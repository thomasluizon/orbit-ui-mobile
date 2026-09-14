# Orbit redesign

**At a glance:** the living spec for the redesign. One effort, one spec, updated by every `/handoff`.
Everything durable lives here; a handoff prompt carries only what to do next.

## What this is

Orbit is being rebuilt screen by screen against a granted design canvas. Every screen lands on both
web and Android together. Nothing reaches a real person until the whole redesign ships, so
`redesign/main` is the branch and `main` stays untouched.

Thirteen screens. The calendar, About, Privacy and Terms, and the Android widget are finished. The
rest are listed under State.

## Standing instructions from Thomas

These stay until he changes them. Keep his words.

- **2026-09-12** "finish every harness ticket, even the ones you filed today ... everytime i do a
  run, you file more harness tickets, its infinite. i want a permanent solution. then continue the
  redesign." Done. Do not file a harness ticket as a substitute for fixing something; record a real
  capability gap as a comment on the ticket that needs it.
- **2026-09-13** A progress update is in product terms. "i DONT CARE about this" said of ticket and
  PR numbers. Use `/progress`.
- **2026-09-13** Replies stay inside his writing contract. Do not send a long reply and let the Stop
  hook reject it; he sees the rejected draft and the rewrite both. Do not offload a long answer to a
  file either: "you answer normally here, without stop hook errors ... i just want you to stop
  rambling."
- **2026-09-13** Before asking him anything, run `/questions`. A question answered by the code, the
  ticket body OR ITS COMMENTS, `/brain`, or a web search is not his. "for this feature, do you
  prefer this simpler approach, or this more complete, more scalable and more correct approach" is
  never his either: the answer is always the correct one, "doesnt matter if it will add 1 million
  lines of code, if it will add changes on the other repo, WHATHEVER". More than four surviving
  questions get asked in rounds until all are answered.
- **2026-09-13** A screen question with one clearly better answer is decided, not asked. "if the
  question has two answers, one being trash and one being a lot better, just go with the better.
  ALWAYS FOLLOWING DESIGN.MD and BRAND.MD and /brain decisions." Only a real toss-up reaches him.
- **Standing** Always the best implementation, never a cheaper or partial option.
- **Standing** Copy, pricing, positioning and brand are his. Ticket `#74` owns existing copy.
- **Standing** Never boot the Android emulator. It is his visual testing surface.
- **Standing** `redesign/main` stays unprotected. Settled; never raise it.

## How the work runs

Every session enters through `/orchestrate`. Codex workers make every code change; Claude
orchestrates and never edits code. `.claude/rules/core.md` is the operating contract and carries the
rest, D89 and D90 included.

## Decisions this effort runs on

Pointers, not restatements. The reasoning lives in the ADR.
- D70: Pro is Astra without the daily ceiling; goals left the paywall. The daily summary and
  proactive check ins stayed behind the gate, and the server agrees at
  `ProcessUserChatCommand.Ai.cs:120` and `ProactiveCheckinSchedulerService.cs:58-60`.
- D92: the Gate Charter closes every gate into one registry that fails closed.
- D42: `design/canvas/` outranks `DESIGN.md` prose, except `## Information architecture` and
  `## Bans`.
- 2026-09-13: `Lint Severity` is changed-files scoped AND blocking.
- **2026-09-14: no `orbit-api` pull request merges unattended.** The repository has no deploy
  workflow in `.github/workflows/`, so whether a push to `main` deploys is configured in the Render
  console, which an unattended run cannot read. Building an API pull request IS allowed; only the
  merge is his.
- **2026-09-14: a worker never writes a user-facing string.** It stops with a `NEEDS_DECISION`
  naming the key path and what the string has to say. This is enforced in every worker order, in
  capitals, because a worker ignored it once (see `progressScreen.achievements.lockedBody` under
  Copy waiting on Thomas).
- **2026-09-14: every new guard is proven by breaking what it guards.** A test that has only ever
  been green has not been shown to notice anything. Three stages reported "nothing was broken" while
  carrying a case that could not have seen a break, and two of those blind spots were real.

## Constraints that are not obvious from the code

- **No display-complete calendar events endpoint.** `useCalendarEvents` is the manual-import feed:
  bounded to 60 days ahead, keeps only the first occurrence of a repeating event, and strips
  already-imported ids. Recorded as a comment on ticket `#56`.
- **`/api/calendar/events` reports the EVENT's timezone, not the account's.** Ticket `#526`,
  orbit-api pull request 521.
- **Listing and revoking API keys are protected by Pro entitlement only.** `GetApiKeysQuery.cs:30`
  and `RevokeApiKeyCommand.cs:22` check no step-up grant, while `CreateApiKeyCommand.cs:40-75`
  verifies and consumes one exactly once. Ticket `#529`, and see the deploy-order conflict recorded
  as a comment on it: its own `## Deploy order` section contradicts `CLAUDE.md`'s expand-contract
  plus `MinSupportedVersion` rule, and shipping it as written breaks every Pro account already on
  the store.
- **The API's create-key grant is one use AND expires.** `ConfirmApiKeyCreationChallengeCommand.cs:31-34`
  calls `AuthorizeOnce` with the challenge's remaining lifetime, `CreateApiKeyCommand.cs:72-75`
  consumes it, and `ResultActionResultExtensions.cs:49` maps the failure to `428` with
  `errorCode = API_KEY_CREATION_CHALLENGE_REQUIRED`. The failure body is exactly
  `{ error, errorCode }`, two keys.
- **`send_support_request` activates only on five literal phrases.** `ChatToolGroups.cs:28-29` lists
  `["support", "contact the team", "report a bug", "suporte", "fale conosco"]`, and
  `ProcessUserChatCommand.Ai.cs:56-64` filters tool declarations BEFORE the first model call. So a
  conversation opened from a Support row cannot send a support request unless the person happens to
  type a trigger word. Tickets `#532` (api) and `#533` (ui, blocked by it).
- **Confirming account deletion DEACTIVATES, it does not delete.**
  `ConfirmAccountDeletionCommand.cs:30-40` schedules seven days out, or for active Pro the earlier of
  plan expiry plus seven days and `AppConstants.MaxDeletionGraceDays`, then calls
  `user.Deactivate(scheduledDate)`. `VerifyCodeCommand.cs:104-110` and `GoogleAuthCommand.cs:139-149`
  call `user.CancelDeactivation()` on sign in. **`#71` stage 8's instruction to say "there is no way
  back" is wrong about the product.**
- **The support API accepts more than the form allows.** `SendSupportCommandValidator.cs` allows a
  200 character subject and a 5,000 character message. Pull request 951 raises the client to match.
- **No device list.** The push APIs only subscribe, unsubscribe and test.
- **No `uses24HourClock` write.** Response-only at `GetProfileQuery.cs:147`. Perfil stage 2 needs an
  `orbit-api` change first.
- **No Astra eval trace.** `/api/chat` omits tool arguments, so `#26`'s assertion cannot be written.
- **`GitHub's `reviewDecision` is not the Pullfrog verdict.** Pull request 947 reads `APPROVED` while
  its latest Pullfrog review is `COMMENTED` with an unresolved thread and `pullfrog-approval` is
  FAILURE. Read `list-bot-threads.mjs` and the `pullfrog-approval` check, never the aggregate.
- **`tools/resolve-bot-thread.mjs` has no reply-only mode.** It replies and resolves in one step, so
  a thread you only wanted to answer closes. When the finding is not fixed, post a separate pull
  request comment saying so.
- **`list-bot-threads.mjs` truncates `reviewBody` to 4,000 characters**, and findings live there as
  well as in threads. `counts.unresolved = 0` with a non-null body is not a clean review. Read the
  full bodies with `gh api repos/.../pulls/<n>/reviews` when it matters.
- **Cloud has a circuit breaker.** Two empty diffs in one session open it and every later ticket
  routes local. It fired on 2026-09-14; the file names itself in the refusal.
- **The local worker pool is ONE at a time in practice.** The harness killed three background tasks
  at once for low memory with 12 GB free of 32 GB. Two workers plus a GitHub poller was too many.
- A stale eslint cache at `apps/mobile/.expo/cache/eslint` blocks every commit in a worktree.
- **`apps/mobile/__tests__/scripts/__snapshots__/widget-header.test.ts.snap` flips its line endings
  on its own.** Restore it and keep it out of every commit.
- The calendar stages all touched the same files, so each merge conflicted the next. The same is now
  true of the Perfil, Progresso and Wrapped stacks.
- Worktree and branch debt is large and harmless. Read 2026-09-14: five dirty worktrees, four
  stashes, three detached HEADs whose commits are already reachable.

## How to run a stage, learned 2026-09-13 and 2026-09-14

- **List the open pull requests in the target repository before starting a ticket.**
- **A review order names the tests that pass with the bug present.** Requiring a red run first is
  what makes the fix real.
- **Capture a test run to a file, never through `tail`.**
- **A generated inventory conflict is resolved by keeping BOTH sides' deletions**, then proving it
  with `GITHUB_BASE_REF=redesign/main node tools/check-suppressions-ratchet.mjs`.
- **Read the worker's `## Assumptions` at EVERY exit, including a clean one.** A worker deleted the
  share card's only entry point on Perfil and filed it as an assumption. Its tests went with the row,
  so every suite stayed green.
- **Check the ticket's requirements against the tree, not against the worker's report.** A stage
  reported success with a whole named requirement absent.
- **Grep for the BEHAVIOUR, not the identifier you expect.** Searching for `reorderGoals` and
  `onReorder` found nothing and the reorder existed as `useGoalDrag` with `DndContext`. That produced
  a wrong claim to Thomas.
- **A stacked child is not blocked by a blocked parent.** Wrapped and Progresso stages were both
  written off as blocked when only their base branch was.

## State

Built and merged to `redesign/main`, which is `b9855b91`:

- **The calendar is finished**, all twelve stages, including the Google import candidates beside
  habits, the sync Pro boundary, and the timezone-partitioned event cache with its cancel-then-
  invalidate fix.
- **About is finished** for the screen itself, and **Privacy and Terms** ship with the 62ch measure
  reaching the live route, one `main` landmark, and the Android bottom inset reserved.
- **Perfil** has its five-group frame, data export, the Astra allowance panel, the product email
  consent question, the API keys and MCP surface behind the plan gate with step-up bound to the auth
  session, and the more-of-Orbit routes group.
- Progresso exists as the fourth destination with XP and achievements.
- The Android widget is finished.
- The harness is finished.
- The mobile test suite reads correctly at any device timezone, and one centralized icon double means
  a new icon export can no longer break an unrelated suite.

In flight. **Every stack below sits behind ONE blocker.** Read `## Open questions` for what each is.

| pull request | base | head | state |
|---|---|---|---|
| ui 953, Perfil stage 8 | `redesign/main` | `57b82334` | structurally complete, blocked on copy |
| ui 954, Perfil stage 9 | 953's branch | `1c156658` | APPROVED, zero threads, waits on 953 |
| ui 951, About stage 5 | `redesign/main` | `90c49dce` | blocked on copy |
| ui 947, Wrapped cover | `redesign/main` | `f5a373e3` | bounded fixer exhausted, one finding open |
| ui 955, Wrapped stage 3 | 947's branch | `8fc85676` | opened, retires suppressions |
| ui 960, Wrapped stage 4 | 955's branch | `e0ac75a0` | opened, four strings blocked on copy |
| ui 961, Wrapped stage 5 | 960's branch | `748056b3` | CHANGES_REQUESTED, three P1 findings |
| ui 962, Wrapped stage 6 | 961's branch | `511a1145` | opened, reviewing |
| ui 894, Progresso stage 3 | `redesign/main` | `53c49044` | blocked on orbit-api 518 deploying |
| ui 956, Progresso stage 4 | 894's branch | `a1ea421f` | opened, reviewing |
| ui 957, Progresso stage 6 | 956's branch | `747fd066` | opened, reviewing |
| ui 958, Progresso stage 7 | 957's branch | `a754796e` | opened, one authored string flagged |
| ui 959, Progresso stage 5 | 958's branch | `4557939f` | APPROVED |
| ui 890, orchestrate docs | `redesign/main` | `df2d862d` | untouched by policy, see below |
| api 523, `#532` | `main` | `1ccb2d8f` | opened 2026-09-14, ready for Thomas |
| api 521, `#526` | `main` | `cc86c612` | CHANGES_REQUESTED |
| api 518, `#505` | `main` | `6ac02c2a` | unblocks 894 |

**Wrapped stage 7 exists but has no pull request.** Branch `feature/ticket-63-wrapped-s7` carries
`dd337cc3 feat: add Wrapped entry routes`, pushed on 2026-09-14 after its worker was stopped. Its
worktree also holds two dirty snapshot files. Nobody has verified it.

Open tickets: 100 carry `repo:ui` and 65 carry `repo:api`. Reproduce with
`gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 100`.

Not started:

- About: stage 3 the feature guide subjects, stages 6, 7 and 8. **All four are copy work.**
- Onboarding, the tour and the feature guide: nothing built, and almost entirely copy.
- Progresso's six accessibility sweeps.

Decided 2026-09-13, ready to build:

- Onboarding chips fill the in-flow field only; the Hoje composer chips are a separate ticket.
- The skipped onboarding ending renders its empty state with one action that creates a habit.
- Wrapped pages turn by hand. No timer.

## Pull request 890 is deliberately untouched

890 edits `.claude/skills/orchestrate/SKILL.md`, the contract a run is executing, and that skill's
own hard prohibition forbids editing it from inside a run. Its one Pullfrog finding is real and
small: the new "Who writes the fix" section attributes the actor split to D89, and the attribution
belongs to `.claude/rules/core.md` instead. An attended session fixes that line and merges it.

## Open questions

Four things are his and only his.

1. **The copy below.** It blocks 951, 953, and parts of 958 and 960.
2. **Merging any `orbit-api` pull request.** 523, 521 and 518 are all waiting. 518 unblocks 894 and
   the whole Progresso stack.
3. **`#529`'s deploy order.** Its own body says to ship before the carrying build reaches Play, which
   breaks every Pro account already on the store. The conflict and two workable shapes are recorded
   as a comment on the ticket.
4. **947's last finding**, which the bounded fixer cannot take: `apps/mobile/app/wrapped-styles.ts:84`
   positions `coverExit` absolutely at `top: 8` inside a `SafeAreaView`, which applies its inset as
   Yoga padding that an absolutely positioned child never receives, so on edge-to-edge Android the
   route's only visible exit sits under the status bar. The fix is the top inset from
   `useSafeAreaInsets()` plus a test at a non-zero inset. Unblocking 947 unblocks 955, 960, 961, 962
   and the stage 7 branch.

## Copy waiting on Thomas

1. **`profile.deleteAccount.warning`**, on 953. It reads "This action is irreversible." above
   `warningFree`, "Log back in anytime before then to cancel." The second is true.
2. **`profile.freshStart.description`**, on 953. Says all data is deleted while the preserved-item
   keys say the account, the subscription and the preferences stay.
3. **`profile.support.subjectRequired`** and **`profile.support.messageRequired`**, on 951. Neither
   exists; `nameRequired`, `emailRequired` and `emailInvalid` do.
4. **The disabled account field's reason** on the support form, on 951. `DESIGN.md` requires it.
5. **`progressScreen.achievements.lockedBody`**, on 958. A worker wrote "Orbit Pro tracks achievements
   and XP." and its pt-BR against instructions. Its siblings are `progressScreen.streak.lockedBody`
   and `progressScreen.window.lockedBody`.
6. **The goals filter-empty duplication**, on 956. `progressScreen.goals.filterEmpty` plus
   `clearFilter` versus `emptyFiltered` plus `clearFilter`. Two live sets for one state.
7. **Four Wrapped strings**, on 960: `wrapped.slides.goals.zero`,
   `wrapped.slides.consistency.summary`, `.note` and `.thin`.
8. **`profile.apiKeys.unlock`**, changed on 946 from "Unlock with Pro" to "See Pro" and "Ver Pro"
   because `check-copy.mjs` refused "Unlock" as an AI cliche.
9. **The 32 shortened control labels** drafted on ticket `#74`, outstanding from before 2026-09-14.
