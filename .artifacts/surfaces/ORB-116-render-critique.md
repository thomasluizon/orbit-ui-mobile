# ORB-116 render critique

- Iterations: 1
- Surface: `route-about`
- Viewport: 412 x 915
- Web coverage: dark and light themes in `en` and `pt-BR`
- State coverage: default only
- Mobile coverage: not pixel-verified because `capture-surfaces.mjs` reported all four mobile cells as `platform-not-capturable`

## Screenshots

- `route-about--default--dark--en.png`
- `route-about--default--dark--pt-BR.png`
- `route-about--default--light--en.png`
- `route-about--default--light--pt-BR.png`

## Findings

- Both English captures are clean for the checks in `RENDER-CORRECTNESS.md`.
- Both Portuguese captures fail the 412px shell check. The leading content, icons, trailing chevrons, and part of several labels are clipped horizontally.
- No raw recurrence rules, ISO timestamps, enum names, internal IDs, untranslated keys, or placeholder copy are visible in the four captures.
- Loading, empty, and error states are not pixel-verified. The live capture path reports non-default states as not capturable and requires the hermetic mock API harness.

## Unresolved findings

- The Portuguese clipping remains unresolved. ORB-116 changes the worker evidence contract and checklist only, so changing the `/about` product surface would exceed this ticket's binding scope. The finding is preserved here for reviewer attention.
- Follow-up: [ORB-130](https://linear.app/useorbitai/issue/ORB-130/fix-pt-br-clipping-on-the-web-about-surface-at-412px).

## Result

Unresolved findings.
