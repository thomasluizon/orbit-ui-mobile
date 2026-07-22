---
surfaceId: overlay-habits-habit-row
platform: web
kind: overlay
ownedFiles: 1
cells: 4
mechanicalDebt: 0
pixelEvidence: web-capture
generatedFrom: 498537f0715177cf58aa9dffbed9806385434db1
---

# Work order: overlay-habits-habit-row

## Goal

Bring `overlay-habits-habit-row` to DESIGN.md. Read DESIGN.md once, then edit; the parts that apply to this surface are named below so you do not have to search for them.

## Boundaries: you own these files, and only these

Ownership is exclusive and frozen in the manifest. Two agents editing one file overwrite
each other, so editing outside this list is a defect even when the change is correct.
If a shared file must change, STOP, write it in the Timeline, and say so in your summary.

- `apps/web/components/habits/habit-row.tsx`

## Backlog A: enumerated and machine-COUNTED (the fix is still a judgement call)

None. Every `local/*` design rule already passes on your owned files.

That is a FLOOR you have already met, not evidence the surface looks right. Backlog B is the work.

## Backlog B: judgement, human-granted

No gate can check these. They are why a human tick is the only thing that grants a cell.

- Focus management: focus moves in on open and returns on close (`### Keyboard and focus`).
- The overlay has an accessible name (`local/require-dialog-title` gates the mechanical half).
- Confirmation warrant: a dialog that asks nothing the user cannot undo should not exist (`## Copy`).
- Stacking uses a named `z-<tier>` / `zLayers.<tier>`, never an arbitrary literal (`### Stacking`).
- The three shipping tests: AI-slop, squint, scene-sentence.

## Cells

This surface expands to 4 cell(s): states default, themes dark/light, locales en/pt-BR.
Web: `npm run surfaces:capture -- --filter <id>` produces the screenshot a human will look at.

## Definition of done for THIS work order

1. Backlog A is 0 (`node tools/workorder.mjs --check` agrees).
2. The diff touches only the owned files above (`node tools/check-diff-ownership.mjs --id <id>` agrees).
3. You appended one Timeline entry saying what you changed and what you deliberately did not.

This makes the work order READY FOR REVIEW. It does not make it done: a human tick in
`.claude/manifests/signoff.json` is the only thing that grants completion, and you cannot write it.

## Timeline

Append-only. Never rewrite or delete an entry, including your own. A fresh session cannot
reconstruct what the previous ones already tried here, and that is the whole cost this section buys.

- (no work recorded on this surface yet)
