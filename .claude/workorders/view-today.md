---
surfaceId: view-today
platform: web
kind: view
href: /
ownedFiles: 1
cells: 32
mechanicalDebt: 0
pixelEvidence: web-capture
generatedFrom: 498537f0715177cf58aa9dffbed9806385434db1
---

# Work order: view-today

## Goal

Bring `view-today` (`/`) to DESIGN.md. Read DESIGN.md once, then edit; the parts that apply to this surface are named below so you do not have to search for them.

## Folded in: surface ids this order also carries

These surfaces render entirely through files this order owns, so a work order of their
own would forbid every edit that could move their cells. Their cells and axes are merged
into this order's counts; there is no other file to look for.

- `view-all`
- `view-general`
- `view-goals`

## Boundaries: you own these files, and only these

Ownership is exclusive and frozen in the manifest. Two agents editing one file overwrite
each other, so editing outside this list is a defect even when the change is correct.
If a shared file must change, STOP, write it in the Timeline, and say so in your summary.

- `apps/web/app/(app)/page.tsx`

## Backlog A: enumerated and machine-COUNTED (the fix is still a judgement call)

None. Every `local/*` design rule already passes on your owned files.

That is a FLOOR you have already met, not evidence the surface looks right. Backlog B is the work.

## Backlog B: judgement, human-granted

No gate can check these. They are why a human tick is the only thing that grants a cell.

- One focal element per view (DESIGN.md `## Working model`). Name it before you edit.
- Spacing rhythm: tight within a group, air between groups (`## Layout & spacing`).
- The loading / empty / error triad actually exists for this route (`## States`).
- Measure: body text does not exceed 65ch (`### Measure and wrapping`).
- A card is not a layout primitive. If it wraps the whole page, it is wrong (`## Surface rules`).
- The three shipping tests: AI-slop, squint, scene-sentence (`### AI-slop test` onward).

## Cells

This order (with its folded surface ids) expands to 32 cell(s): states default/empty, themes dark/light, locales en/pt-BR.
Web: `npm run surfaces:capture -- --filter <id>` produces the screenshot a human will look at.

## Definition of done for THIS work order

1. Backlog A is 0 (`node tools/workorder.mjs --check --id 'view-today'` exits 0).
2. The diff touches only the owned files above (`node tools/check-diff-ownership.mjs --id <id>` agrees).
3. You appended one Timeline entry saying what you changed and what you deliberately did not.

Clearing Backlog A is a floor and is NOT evidence of redesign: the depth number for this
surface comes from `node tools/workorder.mjs --check --id 'view-today'`, and it is a veto
axis a human consults, never a target. Only a human tick in `signoff.json` grants completion.

This makes the work order READY FOR REVIEW. It does not make it done: a human tick in
`.claude/manifests/signoff.json` is the only thing that grants completion, and you cannot write it.

## Timeline

Append-only. Never rewrite or delete an entry, including your own. A fresh session cannot
reconstruct what the previous ones already tried here, and that is the whole cost this section buys.

- (no work recorded on this surface yet)
