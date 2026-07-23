---
surfaceId: overlay-navigation-notification-detail-modal
platform: web
kind: overlay
ownedFiles: 1
cells: 4
mechanicalDebt: 2
pixelEvidence: web-capture
generatedFrom: 498537f0715177cf58aa9dffbed9806385434db1
---

# Work order: overlay-navigation-notification-detail-modal

## Goal

Bring `overlay-navigation-notification-detail-modal` to DESIGN.md. Read DESIGN.md once, then edit; the parts that apply to this surface are named below so you do not have to search for them.

## Boundaries: you own these files, and only these

Ownership is exclusive and frozen in the manifest. Two agents editing one file overwrite
each other, so editing outside this list is a defect even when the change is correct.
If a shared file must change, STOP, write it in the Timeline, and say so in your summary.

- `apps/web/components/navigation/notification-detail-modal.tsx`

## Backlog A: enumerated and machine-COUNTED (the fix is still a judgement call)

2 suppressed DESIGN.md violation(s) in your owned files. These are real defects that
were measured and committed to the lint baseline, then never assigned to anyone.

| file | rule | count |
|---|---|---|
| `apps/web/components/navigation/notification-detail-modal.tsx` | `local/spacing-scale` | 2 |

**Counting these is objective. Fixing them is not.** `local/spacing-scale` autofixes only an
unambiguous snap (within 1px of a unique step: 9 -> 8, 13 -> 12) and deliberately refuses the
rest, because taking a 6px gap to 4 or a 14px padding to 12 CHANGES THE LAYOUT. Verified on this
repo: `eslint --fix` over a 30-violation file changed zero lines. So do not batch-snap every
number to the nearest step and call it done - that is the shallow sweep this harness exists to
stop. Decide each one against the surrounding rhythm (tight within a group, air between groups).

A value you judge genuinely load-bearing is KEPT, through the sanctioned escape - never a forced
snap: add an inline `// eslint-disable-next-line local/<rule> -- <why>, see <this work order or its issue>`
(a tooling directive with a linked WHY is legal under the comment policy), run `npm run lint:prune`,
then append a Timeline entry naming each value you kept and why. The source file IS edited, so the
count falls legitimately and the definition of done below stays reachable for honest work.

See the violations with (a TEMPLATE: substitute the two capitalised words, and run it FROM THE
WORKSPACE - apps/web or apps/mobile - never the repo root, which carries no eslint config or
binary. The angle-bracket form this used to print was a bash redirect: pasted verbatim it was a
syntax error, not a run):
  `npx eslint FILE --suppressions-location EMPTY_JSON_FILE`  (the baseline hides them otherwise)
Then `npm run lint:prune` in that same workspace, then `node tools/workorder.mjs --check` from the root.
Editing `eslint-suppressions.json` by hand instead of fixing the code is fabricating a result,
and `tools/check-diff-ownership.mjs` detects a count that fell for a file you never edited.

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

1. Backlog A is 0 (`node tools/workorder.mjs --check --id 'overlay-navigation-notification-detail-modal'` exits 0).
2. The diff touches only the owned files above: `tools/check-diff-ownership.mjs --id 'overlay-navigation-notification-detail-modal'` agrees.
   Run the EXACT command from your bundle prompt - it pins the `--base` this gate needs. This file
   deliberately bakes no base sha: a regeneration would churn it.
3. You appended one Timeline entry saying what you changed and what you deliberately did not.

Clearing Backlog A is a floor and is NOT evidence of redesign: the depth number for this
surface comes from `node tools/workorder.mjs --check --id 'overlay-navigation-notification-detail-modal'`, and it is a veto
axis a human consults, never a target. Only a human tick in `signoff.json` grants completion.

This makes the work order READY FOR REVIEW. It does not make it done: a human tick in
`.claude/manifests/signoff.json` is the only thing that grants completion, and you cannot write it.

## Timeline

Append-only. Never rewrite or delete an entry, including your own. A fresh session cannot
reconstruct what the previous ones already tried here, and that is the whole cost this section buys.

- (no work recorded on this surface yet)
