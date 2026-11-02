# Placard Pick

Pick one place at random from your Placard library. Narrow the pool by category,
list, tag, opening hours or distance, and avoid places picked in the last 14 days.
Choose a window of 1–365 days and use **Save as my defaults** to remember both
the avoidance switch and duration per account. New accounts start at 14 days.
The module adds a **Pick** navigation page at `/m/places.pick` and an MCP tool for
assistants.

## Requirements and permissions

- A Placard host supporting SDK **0.2.0+**, module uploads and the
  `globalThis.__PLACARD_PLUGIN__` web bridge (`sdkVersion: 0.2.0`).
- Manifest permissions: `places.read` and `search.query`.
- Browser location permission when using **Near me**.

Search runs through Placard as the current user. Opening-hours and distance
matching use the host's search behavior and stored place data.

## Install

In **Settings → Module marketplace → Install from GitHub**, paste:

```text
https://github.com/JobiJoba/plugins#places.pick
```

Enable the module and show it in your navigation. Keep the `#places.pick` selector
so the installer selects Pick's releases in this multi-module repository.

Alternatively, upload Pick's `.placard-module` or `.zip` from
[Releases](https://github.com/JobiJoba/plugins/releases). For a local package, run
from the repository root:

```sh
pnpm install
pnpm --filter @placard-official/places.pick build
```

Upload `plugins/places.pick/dist/places.pick-<version>.zip` or the equivalent
`.placard-module` file. The version comes from `placard.module.json`; both archives
contain the same package.

## Choose a place

1. Open **Pick** and select a type, or leave **Any type** selected.
2. Choose a pool: all places, a specific list or a specific tag.
3. Adjust **Open tonight**, **Near me** and **Avoid recent picks (14 days)**.
4. Check the pool count and press **Choose for me**.
5. Open the selected place, view it in Google Maps or spin again.

**Open tonight** and **Avoid recent picks** start enabled. **Near me** starts
disabled; when enabled, it requests your browser location and offers 1, 2, 5, 10 or
25 km radii (5 km by default). A list, tag or location must be available before a
pick using that filter can run.

Supported categories are `restaurant`, `cafe`, `bar`, `park`, `museum`, `cinema`,
`hotel`, `trail` and `other`.

Every successful pick records history, including picks made with avoidance off
and picks made through MCP. Avoidance excludes that user's picks from the configured number of days. Previewing the pool does not record a pick.

## MCP

Connect an assistant through Placard's MCP settings. The module declares
`pick_place`; on hosts using the module tool namespace it is exposed as
`places_pick__pick_place`. Use the name returned by the host's tool listing.

Example tool arguments:

```json
{
  "category": "restaurant",
  "open": "tonight",
  "near": { "lat": 50.85, "lng": 4.35 },
  "radiusKm": 5,
  "avoidRecent": true
}
```

All filters are optional:

| Argument | Value / behavior |
| --- | --- |
| `category` | One of the category IDs above; omit for any type |
| `text` | Search text passed to Placard |
| `open` | `now` or `tonight`; omit for no opening-hours filter |
| `near` | Coordinates as `{ "lat": number, "lng": number }` |
| `radiusKm` | Radius in kilometers, used with `near` |
| `list` | A Placard list ID |
| `tag` | A tag name |
| `status` | `want_to_go` or `been_there` |
| `avoidRecentDays` | Whole number from 1 to 365; defaults to the account’s saved window |
| `avoidRecent` | Exclude this user's recent picks when `true` |

Unlike the page's initial settings, an MCP call with `{}` applies no filters and
does not avoid recent picks. A successful result contains the chosen place's
`id`, `name`, `address` and `category`. An empty pool returns an error with
suggestions for widening the search.

## Storage and backup

Pick stores history in `<ctx.rootDir>/data/picks.json`, with the owner ID, place ID
and timestamp for each pick. If the HTTP host context does not supply `rootDir`,
the fallback is `<PLACARD_MODULES_DIR>/places.pick`, or
`./data/modules/places.pick` when that environment variable is unset.

Back up the history file with module writers stopped if you want to preserve
recent-pick avoidance. Pick does not modify places or lists. The configured window
controls filtering; older history rows are not automatically removed. Storage
retention across updates or uninstall depends on the host's handling of this
module directory.

## Develop

Requires Node.js 24+ and pnpm 12.4.1. From the repository root:

```sh
pnpm install
pnpm --filter @placard-official/places.pick typecheck
pnpm --filter @placard-official/places.pick build
```

The build recreates `pack/` and writes the two installable archives under `dist/`
inside this module directory. Run `pnpm --filter @placard-official/places.pick test` for preference isolation,
validation and exclusion-window tests. For a manual check, install the archive, verify pool counts and filters,
spin twice with avoidance enabled, and call the MCP tool.

| Path | Purpose |
| --- | --- |
| `placard.module.json` | Permissions, SDK version, navigation, actions and tool declaration |
| `src/placard-sdk.ts` | Local host contract types; builds do not require the core repository |
| `src/server/create-module.ts` | Search pool, history, HTTP handlers and MCP implementation |
| `src/web/PickPage.tsx` | Filters, pool preview, selection animation and result links |
| `src/web/shims/` | React and router adapters to the host web bridge |
| `scripts/build.mjs` | Server/web bundling and archive creation |

The module HTTP base is `/api/m/places.pick`:

| Method and suffix | Result |
| --- | --- |
| `GET /` or `GET /meta` | Module ID and supported categories |
| `POST /preview` | `{ "count": number }` for the supplied filters |
| `POST /spin` | `{ "place": ... }`, or HTTP 404 with `_tag: "PickPoolEmpty"` |

The POST endpoints accept the same filters as the MCP tool. See the
[workspace release instructions](../../README.md#release-one-module) for independent
tags such as `places.pick@0.1.1`.

## Troubleshooting

- **Nothing in the pool:** turn off Open tonight, widen the radius, choose a
  different list/tag, or disable recent-pick avoidance.
- **Waiting for location:** allow location access in your browser, or turn off
  Near me to pick without a distance filter.
- **No Pick navigation entry:** check both module enablement and your account's
  module visibility setting.
- **Wrong module offered by GitHub:** use the full install URL with `#places.pick`,
  or upload the Pick release asset directly.

Preferences are stored in `<ctx.rootDir>/data/preferences/`, in one file per hashed
owner ID. Include this directory when backing up defaults. GET and PUT
`/api/m/places.pick/preferences` read and save the current account’s defaults.
