# Rebuilding the canvas design system's bundle by hand

**At a glance** - `build-ds-bundle.mjs` regenerates `_ds_bundle.js` and `_ds_manifest.json` for the
Claude Design project `918bd5d7-839c-4dd0-811b-4a8781f60507`. Run it only when the canvas app has
stopped regenerating them itself.

## When to use it

The `DesignSync` write API writes source files fine. It does **not** rebuild the two artifacts the
Design System pane actually reads:

* `_ds_bundle.js` compiles every `components/**/*.jsx` into `window.OrbitDesignSystem_918bd5`, which
  is what each specimen card imports from.
* `_ds_manifest.json` is the card index and the component list.

Both are owned by the canvas app, and `"source":"spa"` in the manifest says so. Use this script if
source changes leave cards missing, references to removed cards, or stale token entries in the manifest.

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

When only tracked token CSS changed, refresh the tracked manifest without a full project export:

```
node design/canvas/tools/build-ds-bundle.mjs <tracked-ds-dir> <tracked-ds-dir> --tokens-only
```

**Verify before pushing.** Execute the emitted bundle in a `vm` context with a stubbed `React` and
`document`, and assert that `__errors` is empty and every expected component is a function. A bundle
that throws inside one block fails silently in the browser and leaves that one card blank.
