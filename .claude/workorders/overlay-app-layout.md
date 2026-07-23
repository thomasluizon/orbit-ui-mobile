---
surfaceId: overlay-app-layout
platform: web
kind: overlay
ownedFiles: 27
cells: 4
mechanicalDebt: 0
pixelEvidence: web-capture
generatedFrom: 478dbc1e7c670ab2c2808b03a08e431d2629e117
---

# Work order: overlay-app-layout

## Goal

Bring `overlay-app-layout` to DESIGN.md. Read DESIGN.md once, then edit; the parts that apply to this surface are named below so you do not have to search for them.

## Boundaries: you own these files, and only these

Ownership is exclusive and frozen in the manifest. Two agents editing one file overwrite
each other, so editing outside this list is a defect even when the change is correct.
If a shared file must change, STOP, write it in the Timeline, and say so in your summary.

- `apps/web/app/(app)/layout.tsx`
- `apps/web/app/(app)/onboarding-overlay-state.ts`
- `apps/web/app/actions/onboarding.ts`
- `apps/web/components/motion/route-transition-shell.tsx`
- `apps/web/components/navigation/bottom-tab-bar.tsx`
- `apps/web/components/navigation/web-nav.tsx`
- `apps/web/components/onboarding/retained-onboarding-overlay.tsx`
- `apps/web/components/shell/app-shell.tsx`
- `apps/web/components/shell/astra-copilot-rail.tsx`
- `apps/web/components/shell/desktop-topbar.tsx`
- `apps/web/components/shell/progress-orbit.tsx`
- `apps/web/components/shell/right-rail.tsx`
- `apps/web/components/shell/today-rail.tsx`
- `apps/web/components/shell/topbar-title.ts`
- `apps/web/components/tour/tour-overlay.tsx`
- `apps/web/components/tour/tour-provider.tsx`
- `apps/web/components/ui/back-to-top.tsx`
- `apps/web/components/ui/expiry-warning.tsx`
- `apps/web/components/ui/push-prompt.tsx`
- `apps/web/components/ui/update-available-banner.tsx`
- `apps/web/hooks/use-keyboard-shortcuts.ts`
- `apps/web/hooks/use-onboarding-flush.ts`
- `apps/web/hooks/use-retained-onboarding-guard.ts`
- `apps/web/hooks/use-timezone-auto-sync.ts`
- `apps/web/hooks/use-tour-mock-data.ts`
- `apps/web/lib/api-fetch-i18n-provider.tsx`
- `apps/web/lib/providers.tsx`

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

1. Backlog A is 0 (`node tools/workorder.mjs --check --id 'overlay-app-layout'` exits 0).
2. The diff touches only the owned files above: `tools/check-diff-ownership.mjs --id 'overlay-app-layout'` agrees.
   Run the EXACT command from your bundle prompt - it pins the `--base` this gate needs. This file
   deliberately bakes no base sha: a regeneration would churn it.
3. You appended one Timeline entry saying what you changed and what you deliberately did not.

Clearing Backlog A is a floor and is NOT evidence of redesign: the depth number for this
surface comes from `node tools/workorder.mjs --check --id 'overlay-app-layout'`, and it is a veto
axis a human consults, never a target. Only a human tick in `signoff.json` grants completion.

This makes the work order READY FOR REVIEW. It does not make it done: a human tick in
`.claude/manifests/signoff.json` is the only thing that grants completion, and you cannot write it.

## Timeline

Append-only. Never rewrite or delete an entry, including your own. A fresh session cannot
reconstruct what the previous ones already tried here, and that is the whole cost this section buys.

- (no work recorded on this surface yet)
