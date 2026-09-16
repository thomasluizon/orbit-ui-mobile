# The beta release off `main`

**At a glance:** the living spec for the fixes that ship to the Play open track off `main`, separate
from the redesign. One effort, one spec, updated by every `/handoff`.

## STATUS: SHIPPED. This effort is DONE.

All seven pull requests merged to `main`, and `/android-release` dispatched **1.3.28 (87) to the open
track** on 2026-09-16 at 01:20 UTC, run `35044341064`, from `main` at `adc070bc`.

Keep this file. The constraints below are still true and the next effort trips over them. Do not
reopen the work; check the release outcome instead:

    gh run view 35044341064 --repo thomasluizon/orbit-ui-mobile

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

## Open questions

**None.** Both that survived the 2026-09-16 `/questions` filter were answered and recorded.
