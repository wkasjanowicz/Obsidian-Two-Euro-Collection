# Development

`main.js` in the repository root is **generated**. Edit the sources in `src/`, then build.

```bash
npm install        # once, and after pulling dependency changes
npm run dev        # rebuild main.js on every change (copy it to a test vault to try it)
npm run build      # one-off build
npm test           # build + automated tests
npm run lint       # official Obsidian plugin rules (same checks as the plugin review)
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
| `src/plugin/dashboard.js` | Dashboard rendering (statistics, groups, cards, keyboard) and refresh |
| `src/plugin/export.js` | Missing / owned / swap lists to Markdown and CSV |
| `src/plugin/operations.js` | Long operations: one at a time, Stop button, Numista request counter |
| `src/plugin/cache.js` | Persistent Numista cache (`numista-cache.json` in the plugin folder) |
| `src/plugin/diagnostics.js` | Diagnostics report for bug reports (never includes the API key) |
| `src/collection.js` | Pure helpers: sorting, grouping, statistics, value history, CSV |
| `src/ui/*.js` | Modals (including `ConfirmModal`), settings tab and the filters side panel |
| `src/images/background.js` | Pure background-removal algorithm (tested without Obsidian) |
| `src/utils.js`, `src/constants.js` | Shared helpers and defaults |
| `src/i18n/en.js` | English strings (base language) |
| `src/i18n/builtin.js` | Translations bundled into `main.js` from `Languages/*.json` |

Plugin methods live in plain objects (`export const numistaMethods = { ... }`) that
`src/main.js` copies onto the plugin class, so `this` inside them is the plugin.

## Translations

English strings live in `src/i18n/en.js`; translations in `Languages/pl.json`, `de.json` and
`fr.json` are bundled into `main.js` at build time. To add a language, create
`Languages/<code>.json` and import it in `src/i18n/builtin.js`. The tests check that every key
used in the code exists in English, and that every language has all keys with the same
`{placeholders}`.

## Conventions

- Ask for confirmation with `await this.confirm(message)` (Obsidian dialog), never `window.confirm`.
- Use `window.setTimeout` and `activeDocument` (popout windows); no `console.log`/`console.info`.
- Settings are defined in `EuroSettings.getSettingDefinitions()` (searchable in Obsidian 1.13+);
  `display()` renders the same definitions on older versions.
- Read the API key with `this.getNumistaApiKey()` (secret storage or settings).
- Long operations go through `this.runOperation(() => ...)`; use `this.progressNotice()` for
  progress and keep API calls inside, so the Stop button and request counter work.
- Read Numista types through `getTypeDetails` / `getTypeIssues` (cached); pass `{ fresh: true }`
  for explicit user refreshes.
- `getRows()` is cached for the current task; call `invalidateRows()` after writing many notes
  if you read them again in the same task.

## Tests

Tests use Node's built-in test runner (`node:test`) and run against the built `main.js`
with an in-memory replacement of the Obsidian API (`test/helpers/obsidian-mock.js`).
Numista is never called: tests replace `plugin.api` with fake responses.

## Starter pack

The starter pack is not part of the repository or of plugin releases (Obsidian accepts only
`main.js`, `manifest.json` and `styles.css` in a release). Build and publish it with:

```bash
npm run starter-pack -- "/path/to/vault/2 Euro"
npm run starter-pack:publish
```

`starter-pack:publish` force-pushes `starter-pack.json` to the separate `starter-pack` branch
(always a single commit), from which the plugin downloads it.

## Releases

- `npm run beta` – builds, tests and publishes a GitHub pre-release for BRAT.
- `npm run release:patch | release:minor | release:major` – stable release.

Both require a clean, pushed `main` branch.
