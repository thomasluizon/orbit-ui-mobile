# Rebuilding the canvas design system's bundle by hand

**At a glance** - `build-ds-bundle.mjs` regenerates `_ds_bundle.js` and `_ds_manifest.json` for the
Claude Design project `918bd5d7-839c-4dd0-811b-4a8781f60507`. Run it only when the canvas app has
stopped regenerating them itself.

## The defect it works around, found 2026-08-16

The `DesignSync` write API writes source files fine. It does **not** rebuild the two artifacts the
Design System pane actually reads:

* `_ds_bundle.js` compiles every `components/**/*.jsx` into `window.OrbitDesignSystem_918bd5`, which
  is what each specimen card imports from.
* `_ds_manifest.json` is the card index and the component list.

Both are owned by the canvas app, and `"source":"spa"` in the manifest says so. After wave 0 and
wave 1 landed, the app did not rebuild either one, even after Thomas opened the project. The visible
symptoms were exact:

* Two cards rendered `file not found`, because their manifest entries pointed at files deleted
  earlier the same day. `unregister_assets` returned `unregistered: 2` and changed nothing.
* Three new cards did not appear in the Components group at all.
* The manifest still carried the eight `--p-hab-*` habit-palette tokens, deleted from
  `tokens/colors.css` hours before.

## What the script does

It reads a local copy of the whole project, then emits both artifacts in the app's own output shape,
which was read out of a project export rather than guessed:

* every `.jsx` under `components/`, in the app's group order
* imports stripped, because the card runtime supplies `React` as a global
* JSX transformed with `@babel/plugin-transform-react-jsx` to `React.createElement`
* the `export` keyword stripped, because each block runs inside an IIFE and not a module
* every sibling component reference rewritten to `__ds_scope.X`
* each block wrapped in `try { (() => { ... }) (); } catch` that pushes to `__ds_ns.__errors`
* the card index rebuilt from the first-line `<!-- @dsCard ... -->` marker of every `.html` that
  still exists, which is what makes a deleted card disappear

## Running it

```
node design/canvas/tools/build-ds-bundle.mjs <project-copy-dir> <output-dir>
```

Get `<project-copy-dir>` by downloading the project from claude.ai/design, then copying this
session's newer sources over it. Then push the two files with `DesignSync` `write_files`.

**Verify before pushing.** Execute the emitted bundle in a `vm` context with a stubbed `React` and
`document`, and assert that `__errors` is empty and every expected component is a function. A bundle
that throws inside one block fails silently in the browser and leaves that one card blank.
