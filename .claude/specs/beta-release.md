# The beta release off `main`

**At a glance:** the living spec for the fixes that ship to the Play open track off `main`, separate
from the redesign. One effort, one spec, updated by every `/handoff`.

## STATUS: SHIPPED TWICE. This spec is the record for every release off `main`.

**1.3.28 (87)**, 2026-09-16 at 01:20 UTC, run `35044341064`, from `main` at `adc070bc`. Seven pull
requests, listed below.

**1.3.29 (88)**, 2026-09-16 at 18:36 UTC, run `35134831975`, from `main` at `a9558f7a`. One pull
request, 999, closing ticket `#563`.

### 1.3.29, the checklist release

Thomas reported three defects from a device mid-session and asked for them in one pull request
against `main`, with the release to follow: "put it as a priority now", "target main (not
redesign/main)", "run /android-release to the beta track after you merge to main, you have my
permission, no need to ask". What a person gets:

- Adding a checklist item clears the field, instead of leaving the text there to backspace out.
- The text in a checklist item's field is not flush against its leading edge.
- Moving an item while its field is focused moves THAT item, instead of its text swapping with the
  neighbour's while the focused one refuses to change.

**Two of the three were one cause**, and it reached sixteen other inputs.
`apps/mobile/components/ui/bottom-sheet-app-text-input.tsx:39-44` refused any new `value` while the
input had focus. That guard existed to stop a controlled round-trip fighting the keyboard and it
overshot, because it also dropped a value the PARENT set, which is never keystroke echo.
`handleChangeText` already recorded every keystroke in `lastSyncedValueRef`, so that ref alone tells
the two cases apart, and the fix is the focus term coming out of the condition.

The third was narrow: `habit-checklist.tsx` set `paddingHorizontal: 0`, and a caller's `style` is
applied last inside the primitive, so it beat the primitive's own `paddingHorizontal: 16`.

The reorder half also needed stable row keys. `ChecklistItem` carries no id and it is a persisted
contract type, so the keys are held in `HabitChecklist` beside `items` and reordered, inserted and
removed in step with them.

**Web was not touched, and that was proven rather than assumed.**
`apps/web/components/habits/habit-checklist.tsx:315-320` and `:442-447` are plain controlled inputs,
which React updates whether or not they hold focus, and both already carried horizontal padding. The
pull request carries `parity:exempt` under the React Native platform adapter.

### 1.3.28, the seven-pull-request release

Keep this file. The constraints below are still true and the next effort trips over them. Do not
reopen the work; check the release outcome instead:

    gh run view 35134831975 --repo thomasluizon/orbit-ui-mobile   # 1.3.29
    gh run view 35044341064 --repo thomasluizon/orbit-ui-mobile   # 1.3.28

## What this was

Orbit's Android open beta runs off `main`. Every UI pull request had targeted `redesign/main` since
the redesign began, so for weeks nothing reached the people using the app. On 2026-09-15 Thomas
reported four live defects in one sitting and asked for them fixed, merged to `main`, and shipped.
The set grew to seven.

## What shipped, in product terms

| pull request | what a person gets |
|---|---|
| 977 `#553` | the two Play warnings are gone: no deprecated edge-to-edge attributes, no portrait lock, and large screens centre at 740dp |
| 971 `#134` | the habit row's three-dot menu opens reliably, and select mode keeps its full-card hit target |
| 972 `#547` | Today's completed list shows what you finished on the day you are viewing, and Select all can no longer reach habits the screen is not showing |
| 973 `#552` | the offline queue stops spinning, reaches a terminal state, and no longer strands or silently drops a queued change |
| 978 `#554` | ten ported backlog defects, plus Fresh Start clearing persisted recovery so a deleted change cannot come back |
| 976 `#548` | fill just the habit icon with AI without rewriting the form, marked with the Astra glyph |
| 974 `#550` | the web app renews your session instead of signing you out, and a network blip no longer signs you out permanently |

`#134` is deliberately still OPEN. No session ever reproduced it on a device, and its documented root
cause was wrong: `apps/mobile/CLAUDE.md:32` blames a react-native-screens patch that touches only
`ios/RNSScreenStack.mm` and `ios/integrations/RNSDismissibleModalProtocol.h`, on an Android-only
product. Closing evidence is Thomas opening the built app on a day with completed habits and tapping
the control. A comment on the ticket says exactly that.

## Standing instructions from Thomas, in his words

- **2026-09-15** "i want the 3 changes i asked with PRs created, reviewed by pullfrog, approved,
  merged to main, and after the 3 are merged to main, run a new release to the open track using
  /android-release". Done, for all seven.
- **2026-09-15** "i want the backlog triaged for the same release." Done as `#554`.
- **2026-09-15** "i want those running in parallel, just use worktrees, whatever", narrowed the same
  day by "the pc is very slow, maybe too many workers, fix this".
  **SUPERSEDED by measurement on 2026-09-16: the cap is TWO local Codex workers, not three.** Four
  were killed at once for low memory. A project memory already said two; D89's figure of three is
  what was being followed. Two holds.
- **2026-09-16** **"you shouldnt have asked me to say 'go', you could've just shipped it."** Said
  after the release was held pending confirmation. A release he has already asked for in writing does
  not need a second yes. Ask only when the inputs or the scope changed.
- **2026-09-16** Answered directly: **centred phone IS the large-screen answer.** No tablet layout
  ticket is filed and none should be. Recorded on `#553`.
- **2026-09-16** Answered directly: **the public Play developer name becomes
  TL SOFTWARE ENGINEERING LTDA.** Recorded on `#34`.

## Constraints that are not obvious from the code, and still bite

- **`main` is `strict: true`.** Every merge puts every other pull request BEHIND, costing it one
  branch update, one full CI run and one fresh review. Update a branch BEFORE its CI settles so one
  run covers both; updating after doubles the cycle.
- **`pullfrog-approval` does not publish on a MERGE-ONLY head.** Measured across five heads on
  2026-09-15: a push with a real diff publishes it, an `update-branch` or a bare merge-forward
  commit does not, even though Pullfrog reviews and APPROVES that exact commit. It arrives later from
  the mention runs. Wait for it. Never push an empty commit to manufacture a diff.
- **A forced `--re-review` finds real defects.** Four times in one night it returned a new P1 behind
  a green approval, including the bulk-delete-reaches-hidden-habits defect on 972. Ask for one on any
  head that matters.
- **`apps/mobile/android/` is NOT tracked.** Expo prebuild output. A native fix belongs in
  `app.json`, `app.config.js` or a config plugin.
- **`Contract Drift` compares the committed Zod snapshot against `orbit-api` main, so it rots.** Fix
  with `npm run generate:zod -w @orbit/shared` plus a judgement pass.
- **A red CI check is not always a defect.** On 974 the `Type Check` red was
  `npm error code ECONNRESET` inside `npm ci`, a runner network abort, while the same commit passed
  uncached locally. Read the log before ordering a round.
- **A worker killed for memory or ceiling has usually COMMITTED.** Every one of six did on
  2026-09-15 into 09-16. Check the worktree before assuming loss: the orchestrator can run the
  verification and push an existing commit itself, which is delivery rather than editing.
- **`ERROR: Selected model is at capacity` is transient**, not the allowance running out. A worker
  relaunched at the same moment ran normally.
- **A `parity:exempt` label does not retro-fix a `Cross-Platform Parity` run already created.** On
  999 the failing run was created at 18:14:05 and the label was applied at 18:14:12, so its payload
  predated the label, while the run the label itself triggered skipped correctly. Fire a fresh
  `pull_request` event after labelling rather than reading the red as a finding.
- **A Pullfrog APPROVED review can be superseded by a later review of the SAME head.** It happened
  four times on 2026-09-16 and every superseding review carried a real defect. Decide a merge on the
  LAST review of the exact head plus the newest `pullfrog-approval` check run at it. Recorded on
  `#541`.

## Open questions

**None.** Both that survived the 2026-09-16 `/questions` filter were answered and recorded.
