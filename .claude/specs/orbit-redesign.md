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
- **2026-09-14** **Copy is YOURS, not his.** "i never draft copies. you create them by following
  brand.md, like any other copy. i dont even have to approve". Write every user-facing string from
  `BRAND.md`, in `en.json` AND `pt-BR.json` in the same edit. This SUPERSEDES the earlier "copy is
  his" line, which stalled Wrapped stages 4 and 5, About stage 5 and Perfil stages 8 and 9 for a
  whole night over strings that were never his to write. Only pricing, positioning and brand
  DIRECTION remain his.
- **2026-09-14** **You merge `orbit-api` pull requests yourself.** "is it related to the redesign? if
  yes, just merge to redesign/main. if not, you can merge and deploy to main. my answer will always
  be this one." This SUPERSEDES "no `orbit-api` pull request merges unattended". The routing follows
  the WORK, never which branches exist: "theres absolutely no problem in creating a redesign/main on
  the api, you know that, right?" `orbit-api` `redesign/main` was created on 2026-09-14 from
  `fb61d921`.
- **2026-09-14** **A question whose recommended answer is obviously right is not a question.** On two
  strings that contradicted the product: "this question doesnt belong to me ... this is the obvious
  best approach, so you should've decided yourself, a questions about 'say the truth or lie' i will
  always answer with th truth. dumb question." Correctness, accuracy and honesty are never toss-ups.
- **2026-09-14** **`/questions` means ZERO questions remain afterwards.** "if i use this skill, you
  should have literally no more questions after i answer all of them ... why the fuck do you
  gatekeep QUESTIONS??" Asking four of six and closing the rest yourself is the failure. Ask every
  survivor, in rounds of four, and say how many rounds are left.
- **Standing** Ticket `#74` owns existing copy.
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
- **SUPERSEDED 2026-09-14 by Thomas: "no `orbit-api` pull request merges unattended".** You merge
  them. See the standing instruction above. `orbit-api` now has its own `redesign/main`.
- **SUPERSEDED 2026-09-14 by Thomas: "a worker never writes a user-facing string".** A worker order
  may now ask for strings, and should. Copy is ordinary work written from `BRAND.md`.
- **2026-09-14: a test that has only ever been green has not been shown to notice anything.** Every
  fix is proven by reproducing the break first. The review found this repeatedly: an adornment test
  matching input strings stayed green while production mapped the colour to a token, a passive
  `PillButton` mock made a disabled assertion that could never fail, a sweep test read an attribute
  the component authored about itself, and a responsive test asserted button order while both
  breakpoint variants were visible at once.
- **2026-09-14: worker cost is capped in the harness, not by intention.** `caps.workerLaunchesPerBranch`
  is 2 and `--tier mechanical` selects `model_reasoning_effort="medium"`. Pull request 964. A third
  launch on one branch exits 2 unless `--relaunch-reason` is given, which is recorded. Batch a review's
  findings into ONE order.
- **2026-09-14: a concurrency gate decides by claiming a name, never by counting.** Three races were
  found in the launch cap before it was right: counting a shared array admitted three, counting
  provisional files admitted none, ordering contenders still admitted two. The answer is N fixed slot
  names claimed with an exclusive create, so the create IS the decision.
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
- Worktree and branch debt is large and harmless. Read 2026-09-14 at 22:26 UTC: four dirty worktrees
  in `orbit-ui-mobile` (`orb-70-android-widget` 34 files, `orb65-red-evidence` 4,
  `ticket-351-primitives` 179, `ticket-174-measure` 1, all last touched 2026-08-25), four stashes,
  three detached HEADs whose commits are already reachable, and no dirty worktree or stash in
  `orbit-api`. Most local branches have no upstream because their work was squash-merged.
- **A squash merge duplicates content into every stacked branch.** Each merge of a stack base
  conflicts the child in the same files. Resolve by reading both sides, never by taking one whole:
  on 2026-09-14 that pattern hit `wrapped.tsx`, `wrapped-styles.ts`, `wrapped-cover.tsx` and both
  `eslint-suppressions.json` files on every Wrapped branch in turn.
- **The orchestrator guardrail refuses any shell redirect whose target contains a variable.** Write
  a small node script instead of `cmd > "$VAR/file"`. Ticket `#521`, whose earlier attempt closed as
  pull request 931.

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

Built and merged to `redesign/main`, which is `35c17cf3`:

- **The calendar is finished**, all twelve stages, including the Google import candidates beside
  habits, the sync Pro boundary, and the timezone-partitioned event cache with its cancel-then-
  invalidate fix.
- **About is finished** for the screen itself, and **Privacy and Terms** ship with the 62ch measure
  reaching the live route, one `main` landmark, and the Android bottom inset reserved.
- **Perfil** has its five-group frame, data export, the Astra allowance panel, the product email
  consent question, the API keys and MCP surface behind the plan gate with step-up bound to the auth
  session, and the more-of-Orbit routes group.
- **Wrapped's cover and paging are in** (947, 955). The cover's only Android exit now sits below the
  status bar, paging lives on `Pager`, and the final page's Share and Save stack at narrow width
  instead of overflowing beside Previous.
- Progresso exists as the fourth destination with XP and achievements.
- The Android widget is finished.
- The harness is finished.
- The mobile test suite reads correctly at any device timezone, and one centralized icon double means
  a new icon export can no longer break an unrelated suite.

In flight, read live 2026-09-14 at 22:26 UTC. **Nothing here waits on Thomas any more.**

| pull request | base | head | state |
|---|---|---|---|
| ui 960, Wrapped stage 4 | `redesign/main` | `49f1a248` | goals count fixed; a worker is writing the weekday interpretation and its four strings |
| ui 961, Wrapped stage 5 | 960's branch | `8054c269` | CHANGES_REQUESTED on one thing only: the card's goal label must read "Goals closed" / "Metas fechadas" |
| ui 962, Wrapped stage 6 | 961's branch | `6e40e930` | APPROVED, CLEAN. Waits on 961 |
| ui 963, Wrapped stage 7 | 962's branch | `b34c0d88` | APPROVED, CLEAN. Waits on 962 |
| ui 894, Progresso stage 3 | `redesign/main` | `53c49044` | one open finding, answered by api 518's `RepairableGapDates` |
| ui 956, Progresso stage 4 | 894's branch | `b49b420d` | APPROVED, CLEAN. Waits on 894 |
| ui 957, Progresso stage 6 | 956's branch | `5812ff33` | APPROVED, CLEAN. Waits on 956 |
| ui 958, Progresso stage 7 | 957's branch | `5ffa297f` | Pro gate now follows the profile, not `hasProAccess`. CI pending |
| ui 959, Progresso stage 5 | 958's branch | `4557939f` | APPROVED, CLEAN. Waits on 958 |
| ui 953, Perfil stage 8 | `redesign/main` | `57b82334` | two strings contradict the product; both are yours to write now |
| ui 954, Perfil stage 9 | 953's branch | `1c156658` | APPROVED, zero threads. Waits on 953 |
| ui 951, About stage 5 | `redesign/main` | `90c49dce` | DIRTY, needs a merge-forward, plus two support strings and the disabled-field reason |
| ui 964, `#536` worker cost | `redesign/main` | `94701d56` | cap and tier built, three races fixed; awaiting `pullfrog-approval` |
| ui 965, `#538` readiness identity | `redesign/main` | `4b8d043b` | APPROVED, CLEAN |
| ui 890, orchestrate docs | `redesign/main` | `df2d862d` | untouched by policy, see below |
| api 518, `#505` | `redesign/main` | `9765492f` | CLEAN, zero threads, no Pullfrog approval at this head yet. **Merging it releases 894 and 956 to 959** |
| api 523, `#532` | `redesign/main` | `1ccb2d8f` | APPROVED, CLEAN. Mergeable |
| api 521, `#526` | `main` | `cc86c612` | CHANGES_REQUESTED. A live calendar defect, not redesign work |
| api 520 | `main` | `ce610484` | gating matrix tooling, not redesign work |

Four dependabot pull requests sit on UI `main` (881, 801, 799, 798) and three on api `main` (512,
511, 510). None is part of this effort.

Open tickets: 123 carry `repo:ui` and 66 carry `repo:api`. Reproduce with
`gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200`.

Filed 2026-09-14, none started: `#534` the share card's goals figure (now fixed inside 961, close it
when that lands), `#535` the layout guard has no 320px width and no Wrapped fixture, `#536` worker
cost, `#537` batch Pullfrog fixes and route mechanical orchestrator work, `#538` readiness identity.

Not started:

- About: stage 3 the feature guide subjects, stages 6, 7 and 8. All four are copy, which is now
  yours, so none of them is blocked.
- Onboarding, the tour and the feature guide: nothing built, and almost entirely copy. Same.
- Progresso's six accessibility sweeps.

Decided 2026-09-13, ready to build:

- Onboarding chips fill the in-flow field only; the Hoje composer chips are a separate ticket.
- The skipped onboarding ending renders its empty state with one action that creates a habit.
- Wrapped pages turn by hand. No timer.

Decided 2026-09-14, ready to build:

- **A period is too thin to compare weekdays when fewer than two weekdays carry any completion.**
  Encode it as a named predicate in `packages/shared`, never derived from translated copy.
- **The goals figure is labelled "Goals closed" / "Metas fechadas"**, in the `shareCard.stats.*`
  namespace, on the card AND the Wrapped goals slide. Both currently borrow
  `progressScreen.sections.goals`.
- **Wrapped's motion follows the canvas at 320ms with a 90ms stagger, scoped to Wrapped.** The shared
  `orbitalMotion.list.staggerMs` stays 40 and `DESIGN.md`'s 160/220/280 scale is untouched, because a
  shared token is not a surface and changing it would move every list in Orbit. Asked as a real
  toss-up; his answer was "whathever is better".
- **CI runs the web layout guard on pull requests touching `apps/web`.** A worker can never run it:
  `checkWorkerBrowser` in `.claude/hooks/_lib/rules-worker.mjs` refuses a browser, a dev server and
  Playwright. Ticket `#535`.
- **`#529` ships expand-contract.** Optional server behaviour accepting both client shapes, then the
  mobile build, then `AppConfig.MinSupportedVersion` raised only once that build is live in the Play
  fleet. Its own body contradicts `CLAUDE.md` and the contract wins. Recorded on the ticket.

## Pull request 890 is deliberately untouched

890 edits `.claude/skills/orchestrate/SKILL.md`, the contract a run is executing, and that skill's
own hard prohibition forbids editing it from inside a run. Its one Pullfrog finding is real and
small: the new "Who writes the fix" section attributes the actor split to D89, and the attribution
belongs to `.claude/rules/core.md` instead. An attended session fixes that line and merges it.

`#537` and the prose half of `#536` are the same shape: `.claude/skills/orchestrate/SKILL.md` still
tells a run to spawn one worker per finding, while the harness now caps launches per branch. That
edit is an attended job for the same reason.

## Open questions

**None are his.** Every question from the 2026-09-14 `/questions` round is answered, and the two
standing instructions added that night moved copy and api merges to you.

One future action is his alone, and it is not a blocker: raising `AppConfig.MinSupportedVersion` for
`#529` after the carrying build is live in the Play fleet, because that depends on a Play rollout he
can see and a run cannot.

## Copy still to write, and it is yours

This list was "Copy waiting on Thomas" until 2026-09-14. Nothing on it is blocked any more; it is
ordinary work, written from `BRAND.md` into `en.json` AND `pt-BR.json` in the same edit. Kept here
because these are real defects, not a wish list.

1. **`profile.deleteAccount.warning`**, on 953. It says the action is irreversible. It is not:
   `ConfirmAccountDeletionCommand.cs:30-40` schedules a deactivation and `VerifyCodeCommand.cs:104-110`
   cancels it on sign in. He confirmed the fix is to say so.
2. **`profile.freshStart.description`**, on 953. Says all data is deleted while the preserved-item
   keys say the account, the subscription and the preferences stay.
3. **`profile.support.subjectRequired` and `profile.support.messageRequired`**, on 951. Neither
   exists; `nameRequired`, `emailRequired` and `emailInvalid` do.
4. **The disabled account field's reason** on the support form, on 951. `DESIGN.md` requires it.
5. **`progressScreen.achievements.lockedBody`**, on 958. A worker wrote "Orbit Pro tracks
   achievements and XP." and its pt-BR against the instruction standing at the time. Review it on its
   merits now; its siblings are `progressScreen.streak.lockedBody` and `progressScreen.window.lockedBody`.
6. **The goals filter-empty duplication**, on 956. `progressScreen.goals.filterEmpty` plus
   `clearFilter` versus `emptyFiltered` plus `clearFilter`. Two live sets for one state; keep one.
7. **Four Wrapped strings**, on 960, drafted and handed to a worker on 2026-09-14:
   `wrapped.slides.consistency.summary`, `.note`, `.thin` and `wrapped.slides.goals.zero`.
8. **`profile.apiKeys.unlock`**, already merged on 946 as "See Pro" and "Ver Pro" because
   `check-copy.mjs` refuses "Unlock" as an AI cliche. Revisit only if the replacement reads badly.
9. **The 32 shortened control labels** for ticket `#74`, drafted across 58 sites in both locales and
   never landed. Landing them retires the matching inline suppressions.
