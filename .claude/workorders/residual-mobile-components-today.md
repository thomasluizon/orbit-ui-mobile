---
surfaceId: residual-mobile-components-today
platform: mobile
kind: residual
ownedFiles: 2
cells: 0
mechanicalDebt: 7
pixelEvidence: none
generatedFrom: 478dbc1e7c670ab2c2808b03a08e431d2629e117
---

# Work order: residual-mobile-components-today

## Goal

Bring these shared/style-only files into DESIGN.md conformance. A spacing fix is expected to change the layout - deliberately and minimally; structure and components stay as they are.

## Boundaries: you own these files, and only these

Ownership is exclusive and frozen in the manifest. Two agents editing one file overwrite
each other, so editing outside this list is a defect even when the change is correct.
If a shared file must change, STOP, write it in the Timeline, and say so in your summary.

- `apps/mobile/components/today/setup-checklist-card.tsx`
- `apps/mobile/components/today/today-habits-header.tsx`

## Backlog A: enumerated and machine-COUNTED (the fix is still a judgement call)

7 suppressed DESIGN.md violation(s) in your owned files. These are real defects that
were measured and committed to the lint baseline, then never assigned to anyone.

| file | rule | count |
|---|---|---|
| `apps/mobile/components/today/today-habits-header.tsx` | `local/spacing-scale` | 5 |
| `apps/mobile/components/today/setup-checklist-card.tsx` | `local/spacing-scale` | 2 |

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

- These files are shared or style-only modules that no single surface owns.
- This is conformance work, not a redesign: keep structure and components as they are. A spacing fix is EXPECTED to change the layout - deliberately and minimally, each value judged against the surrounding rhythm, exactly as Backlog A says.
- A value you judge genuinely load-bearing gets Backlog A's sanctioned escape (an inline `eslint-disable-next-line` with a WHY comment linking this work order or its issue, then `npm run lint:prune`, then a Timeline entry), never a forced snap.
- A token or primitive that does not exist yet is a REQUEST, never a judgement call (`.claude/rules` product-and-content rule 2).

## Definition of done for THIS work order

1. Backlog A is 0 (`node tools/workorder.mjs --check --id 'residual-mobile-components-today'` exits 0).
2. The diff touches only the owned files above: `tools/check-diff-ownership.mjs --id 'residual-mobile-components-today'` agrees.
   Run the EXACT command from your bundle prompt - it pins the `--base` this gate needs. This file
   deliberately bakes no base sha: a regeneration would churn it.
3. You appended one Timeline entry saying what you changed and what you deliberately did not.

This makes the work order READY FOR REVIEW. It does not make it done: a human tick in
`.claude/manifests/signoff.json` is the only thing that grants completion, and you cannot write it.

## Timeline

Append-only. Never rewrite or delete an entry, including your own. A fresh session cannot
reconstruct what the previous ones already tried here, and that is the whole cost this section buys.

- (no work recorded on this surface yet)
