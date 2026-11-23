# Development

`main.js` in the repository root is **generated**. Edit the sources in `src/`, then build.

```bash
npm install        # once, and after pulling dependency changes
npm run dev        # rebuild main.js on every change (copy it to a test vault to try it)
npm run build      # one-off build
npm test           # build + automated tests
npm run format     # format sources with Prettier
```

Commit the rebuilt `main.js` together with your changes. CI fails when `main.js`
does not match a fresh build of `src/`.

## Source layout

| Path | Contents |
| --- | --- |
| `src/main.js` | Plugin class: `onload` (commands, events, views) and the list of method groups |
| `src/plugin/*.js` | Plugin methods grouped by topic and mixed into the plugin class |
| `src/plugin/numista.js` | Numista API, synchronization, prices, cover downloads |
| `src/plugin/coins.js` | Reading and writing coin notes, filtering |
| `src/plugin/images.js` | Background removal, catalog preset, WebP saving |
| `src/plugin/maintenance.js` | Repair commands: dedupe, WebP conversion, normalization |
| `src/plugin/dashboard.js` | Dashboard rendering and refresh, filter panel state |
| `src/ui/*.js` | Modals, settings tab and the filters side panel |
| `src/images/background.js` | Pure background-removal algorithm (tested without Obsidian) |
| `src/utils.js`, `src/constants.js` | Shared helpers and defaults |
| `src/i18n/en.js` | English strings (base language) |
| `src/i18n/builtin.js` | Translations bundled into `main.js` from `Languages/*.json` |

Plugin methods live in plain objects (`export const numistaMethods = { ... }`) that
`src/main.js` copies onto the plugin class, so `this` inside them is the plugin.

## Translations

Edit `Languages/pl.json`. It is bundled into `main.js` at build time. To add a language,
create `Languages/<code>.json` and import it in `src/i18n/builtin.js`. The tests check that
every key used in the code exists in English and that Polish has all keys with the same
`{placeholders}`.

## Tests

Tests use Node's built-in test runner (`node:test`) and run against the built `main.js`
with an in-memory replacement of the Obsidian API (`test/helpers/obsidian-mock.js`).
Numista is never called: tests replace `plugin.api` with fake responses.

## Releases

- `npm run beta` – builds, tests and publishes a GitHub pre-release for BRAT.
- `npm run release:patch | release:minor | release:major` – stable release.

Both require a clean, pushed `main` branch.
