---
surfaceId: residual-mobile-components
platform: mobile
kind: residual
ownedFiles: 5
cells: 0
mechanicalDebt: 14
pixelEvidence: none
generatedFrom: 498537f0715177cf58aa9dffbed9806385434db1
---

# Work order: residual-mobile-components

## Goal

Bring these shared/style-only files into DESIGN.md conformance without changing what they render.

## Boundaries: you own these files, and only these

Ownership is exclusive and frozen in the manifest. Two agents editing one file overwrite
each other, so editing outside this list is a defect even when the change is correct.
If a shared file must change, STOP, write it in the Timeline, and say so in your summary.

- `apps/mobile/components/bottom-sheet-modal.tsx`
- `apps/mobile/components/goal-card.tsx`
- `apps/mobile/components/message-bubble.tsx`
- `apps/mobile/components/upgrade-required-screen.tsx`
- `apps/mobile/components/version-update-drawer.tsx`

## Backlog A: enumerated and machine-COUNTED (the fix is still a judgement call)

14 suppressed DESIGN.md violation(s) in your owned files. These are real defects that
were measured and committed to the lint baseline, then never assigned to anyone.

| file | rule | count |
|---|---|---|
| `apps/mobile/components/version-update-drawer.tsx` | `local/spacing-scale` | 5 |
| `apps/mobile/components/message-bubble.tsx` | `local/spacing-scale` | 3 |
| `apps/mobile/components/upgrade-required-screen.tsx` | `local/spacing-scale` | 3 |
| `apps/mobile/components/goal-card.tsx` | `local/spacing-scale` | 2 |
| `apps/mobile/components/bottom-sheet-modal.tsx` | `local/spacing-scale` | 1 |

**Counting these is objective. Fixing them is not.** `local/spacing-scale` autofixes only an
unambiguous snap (within 1px of a unique step: 9 -> 8, 13 -> 12) and deliberately refuses the
rest, because taking a 6px gap to 4 or a 14px padding to 12 CHANGES THE LAYOUT. Verified on this
repo: `eslint --fix` over a 30-violation file changed zero lines. So do not batch-snap every
number to the nearest step and call it done - that is the shallow sweep this harness exists to
stop. Decide each one against the surrounding rhythm (tight within a group, air between groups),
and where a value is genuinely load-bearing, say so in the Timeline rather than forcing it.

See the violations with:
  `npx eslint <file> --suppressions-location <an-empty-json-file>`  (the baseline hides them otherwise)
Then `npm run lint:prune` in the workspace, then `node tools/workorder.mjs --check`.
Editing `eslint-suppressions.json` by hand instead of fixing the code is fabricating a result,
and `tools/check-diff-ownership.mjs` detects a count that fell for a file you never edited.

## Backlog B: judgement, human-granted

No gate can check these. They are why a human tick is the only thing that grants a cell.

- These files are shared or style-only modules that no single surface owns.
- Fix the enumerated violations without changing rendered behaviour: this is conformance work, not a redesign.
- A token or primitive that does not exist yet is a REQUEST, never a judgement call (`.claude/rules` product-and-content rule 2).

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
