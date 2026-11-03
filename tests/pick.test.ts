import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createModule } from "../src/server/create-module.ts"

test("preferences persist per owner and control preview without leaking into search", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "pick-test-"))
  try {
    const app = createModule().createHttpApp!
    const call = async (pathSuffix: string, method = "GET", body?: unknown, ownerId = "alice") => {
      return app(new Request(`http://localhost/${pathSuffix}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), {
        moduleId: "places.pick", rootDir, ownerId, pathSuffix,
        hostFetch: async (_path: string, init?: RequestInit) => {
          const filter = JSON.parse(String(init?.body))
          assert.equal(filter.avoidRecentDays, undefined)
          assert.equal(filter.avoidRecent, undefined)
          return Response.json([{ place: { id: "old", name: "Old", category: "cafe" } }])
        },
      })
    }
    assert.deepEqual(await (await call("preferences")).json(), { avoidRecent: true, avoidRecentDays: 14 })
    assert.equal((await call("preferences", "PUT", { avoidRecent: true, avoidRecentDays: 3 })).status, 200)
    assert.equal((await (await call("preferences")).json()).avoidRecentDays, 3)
    assert.equal((await (await call("preferences", "GET", undefined, "bob")).json()).avoidRecentDays, 14)
    for (const days of [0, -1, 366, 1.5, "3", null]) {
      assert.equal((await call("preferences", "PUT", { avoidRecent: true, avoidRecentDays: days })).status, 400)
      assert.equal((await call("preview", "POST", { avoidRecentDays: days })).status, 400)
    }
    await mkdir(join(rootDir, "data"), { recursive: true })
    await writeFile(join(rootDir, "data/picks.json"), JSON.stringify([{ ownerId: "alice", placeId: "old", pickedAt: new Date(Date.now() - 7 * 86400000).toISOString() }]))
    assert.equal((await (await call("preview", "POST", { avoidRecent: true })).json()).count, 1)
    assert.equal((await (await call("preview", "POST", { avoidRecent: true, avoidRecentDays: 14 })).json()).count, 0)
    assert.equal((await (await call("preview", "POST", { avoidRecent: false, avoidRecentDays: 14 })).json()).count, 1)
    assert.equal((await call("preferences", "GET", undefined, "")).status, 401)
  } finally { await rm(rootDir, { recursive: true, force: true }) }
})


test("metadata loads the current account's place types from core", async () => {
  const app = createModule().createHttpApp!
  const categories = ["restaurant", "bakery", "Record shop"]
  for (const pathSuffix of ["", "meta"]) {
    const response = await app(new Request("http://localhost/meta"), {
      moduleId: "places.pick", rootDir: "/unused", ownerId: "alice", pathSuffix,
      hostFetch: async (path) => {
        assert.equal(path, "/api/me/place-types")
        return Response.json({ types: categories })
      },
    })
    assert.deepEqual(await response.json(), { id: "places.pick", categories })
  }
  const response = await app(new Request("http://localhost/meta"), {
    moduleId: "places.pick", rootDir: "/unused", ownerId: "alice", pathSuffix: "meta",
    hostFetch: async () => new Response(null, { status: 404 }),
  })
  assert.equal(response.status, 502)
})

test("preview, spin and MCP support core built-ins and custom place types", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "pick-types-"))
  try {
    const module = createModule()
    const hostFetch = async (path: string, init?: RequestInit) => {
      assert.equal(path, "/api/search")
      const { category } = JSON.parse(String(init?.body))
      assert.ok(["bakery", "Record shop"].includes(category))
      return Response.json([{ place: { id: "one", name: "One", category } }])
    }
    const ctx = { moduleId: "places.pick", rootDir, ownerId: "alice", hostFetch }
    for (const category of ["bakery", " Record shop "]) {
      for (const pathSuffix of ["preview", "spin"]) {
        const response = await module.createHttpApp!(new Request(`http://localhost/${pathSuffix}`, {
          method: "POST", body: JSON.stringify({ category }),
        }), { ...ctx, pathSuffix })
        assert.equal(response.status, 200)
        const body = await response.json()
        if (pathSuffix === "preview") assert.equal(body.count, 1)
        else assert.equal(body.place.category, category.trim())
      }
      const result = await module.mcpTools![0]!.handler({ category }, ctx)
      assert.equal(result.ok, true)
      if (result.ok) assert.equal((result.data as { category: string }).category, category.trim())
    }
    for (const category of [42, [], {}, "   ", "x".repeat(81)]) {
      const result = await module.mcpTools![0]!.handler({ category }, ctx)
      assert.equal(result.ok, false)
    }
    const schema = module.mcpTools![0]!.def.inputSchema as { properties: { category: Record<string, unknown> } }
    assert.equal(schema.properties.category.enum, undefined)
  } finally { await rm(rootDir, { recursive: true, force: true }) }
})
