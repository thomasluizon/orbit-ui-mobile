# Orbit redesign

**At a glance:** the living spec for the redesign. One effort, one spec, updated by every `/handoff`.
Everything durable lives here; a handoff prompt carries only what to do next.

## What this is

Orbit is being rebuilt screen by screen against a granted design canvas. Every screen lands on both
web and Android together. Nothing reaches a real person until the whole redesign ships, so
`redesign/main` is the branch and `main` stays untouched.

Thirteen screens. The calendar, Privacy and Terms, and most of About are finished. The rest are
listed under State.

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
  **Read that last clause literally.** On 2026-09-14 a run overrode the granted canvas on its own
  judgement and Pullfrog caught it; see the Send-button entry under Decisions.
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
- **2026-09-14** **Any run ends only when this spec is done.** "ANY RUN ends only when the original
  spec is done ... anytime i run /handoff, the handoff needs to list a clear goal: finish the
  original spec. if its not done, then your work is not done, and if it means fixing blockers, taking
  decisions, whathever it takes, you will do it, until the spec is finished with the best approach
  possible." A blocker is the next piece of work, never an ending: "theres no blocker impossible of
  being fixed by you, you create the blockers, you fix them, always doing the best approach." Waiting
  on CI is waiting. A stacked child's blocker is its parent, which is the work. A finding too big for
  one pull request becomes a ticket AND gets picked up. A missing branch, gate or tool gets built. The
  only honest early ending is external: the allowance runs out, the machine stops, or he says stop,
  and you say which.
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
  fix is proven by reproducing the break first. This held again all night: eleven separate rounds on
  2026-09-15 each recorded a red run before its fix, and the two defects nobody had caught were
  both in code whose tests had never failed.
- **2026-09-14: worker cost is capped in the harness, not by intention.** `caps.workerLaunchesPerBranch`
  is 2 and `--tier mechanical` selects `model_reasoning_effort="medium"`. Pull request 964, NOT yet
  merged, so the cap is not live. Batch a review's findings into ONE order regardless.
- **2026-09-14: a concurrency gate decides by claiming a name, never by counting.** Three races were
  found in the launch cap before it was right. The answer is N fixed slot names claimed with an
  exclusive create, so the create IS the decision.
- **2026-09-14: every new guard is proven by breaking what it guards.**
- **2026-09-15: copy that carries a NUMBER or a DATE is checked against the rule that produces it,
  never only against its sibling strings.** Three strings written on 2026-09-14 were each wrong the
  same way: `profile.deleteAccount.warningPro` promised a date the 30-day cap overrides,
  `wrapped.slides.consistency.summary` named a quietest weekday the data cannot identify, and
  `progressScreen.streak.repairPartial` promised a freeze a full bank can never earn. Each read a
  server value and stated a consequence the server does not guarantee.
- **2026-09-15: a parent pull request must be correct WITHOUT its children.** `960` shipped a goals
  slide that a goal-only recap could not reach, with the fix sitting in its child `961`. "They land
  together" is an assumption, not a property: a child can be reworked or delayed. The fix moved down.
- **2026-09-15: the granted canvas outranks a run's own reasoning, including a good one.** A run
  ordered the support Send button to stop gating on an empty subject, reasoning that a disabled
  control with no stated reason tells a person nothing. `design/canvas/Orbit Sobre.dc.html:484` reads
  `disabled: send === 'sending' || offline || !subject || !message.length`. The concern was real and
  the override was not: the right answer was the canvas behaviour PLUS a stated reason, which the new
  `Input` `hint` contract now makes possible.
- **2026-09-15: a client may mirror a server rule only with a one-line WHY naming its file and
  lines.** The delete-account modal has to reproduce `ConfirmAccountDeletionCommand.cs:31-33` because
  the API exposes no preview of the scheduled date. Write that path by opening it, not from memory: a
  WHY comment whose link 404s is worse than no comment.

## Constraints that are not obvious from the code

- **Mobile cannot parse ICU. Eleven strings render as garbage on Android today.** `apps/mobile/lib/i18n.ts:18-29`
  initialises i18next with `interpolation: { prefix: '{', suffix: '}' }` and NO ICU plugin, so it
  eats the opening of every ICU message. Reproduced 2026-09-15 against the real `en.json`:
  `progressScreen.streak.gapBody` renders as
  `"2 other {# days with nothing logged.}} The habits are as they were."` Web is unaffected because
  next-intl parses ICU natively. **No test caught it because every mobile test mocks `t` to echo the
  key and its arguments.** Ticket `#540`, in flight. Until it lands, a new plural string on a shared
  key is broken on the platform Orbit sells.
- **Deleting an account DEACTIVATES, and the schedule has two gates.**
  `ConfirmAccountDeletionCommand.cs:31-35` takes the EARLIER of plan expiry plus seven days and
  `nowAtUtc + AppConstants.MaxDeletionGraceDays`, which is **30**. It uses the plan date only when
  `HasProAccess && PlanExpiresAt.HasValue && PlanExpiresAt > now`, so an active trial and a lifetime
  grant both fall to the seven-day branch. `VerifyCodeCommand.cs:104-110` and
  `GoogleAuthCommand.cs:139-149` cancel the deactivation on sign in. **`#71` stage 8's instruction to
  say "there is no way back" is wrong about the product.**
- **A streak freeze is banked automatically and spent by hand.** `AwardStreakFreezeIfEligible` banks
  one per `StreakDaysPerFreeze` (7) days of streak, capped at `MaxStreakFreezesAccumulated` (3) held;
  `MaxStreakFreezesPerMonth` (3) caps SPENDING. `UserStreakService.EvaluateRepair:193` offers a repair
  for YESTERDAY only, and only when it lengthens the streak. Nothing applies a freeze on its own, so
  copy must never say a freeze shields a missed day by itself.
- **`RepairableGapDates` is independent of the freeze bank, on purpose.**
  `GetRepairableGapDatesAsync:84-127` walks SCHEDULED occurrences back from yesterday, and
  `EvaluateGapRepair:169-242` never reads `StreakFreezesAccumulated`. It checks the gap's shape, the
  predecessor, the PER CALENDAR MONTH spend cap, and whether the repair lengthens the streak. So a
  four-date gap split across a month boundary is a valid response that no bank can ever fund.
  The wire type is nullable: `openapi.json` declares `"type": ["null", "array"]`.
- **No display-complete calendar events endpoint.** `useCalendarEvents` is the manual-import feed:
  bounded to 60 days ahead, keeps only the first occurrence of a repeating event, and strips
  already-imported ids. Recorded as a comment on ticket `#56`.
- **`/api/calendar/events` reports the EVENT's timezone, not the account's.** Ticket `#526`,
  orbit-api pull request 521, still open on `main`.
- **Listing and revoking API keys are protected by Pro entitlement only.** `GetApiKeysQuery.cs:30`
  and `RevokeApiKeyCommand.cs:22` check no step-up grant, while `CreateApiKeyCommand.cs:40-75`
  verifies and consumes one exactly once. Ticket `#529`, and see the deploy-order conflict recorded
  as a comment on it.
- **The API's create-key grant is one use AND expires.** `ConfirmApiKeyCreationChallengeCommand.cs:31-34`
  calls `AuthorizeOnce`, `CreateApiKeyCommand.cs:72-75` consumes it, and
  `ResultActionResultExtensions.cs:49` maps the failure to `428` with
  `errorCode = API_KEY_CREATION_CHALLENGE_REQUIRED`. The failure body is exactly `{ error, errorCode }`.
- **`send_support_request` activates only on five literal phrases.** `ChatToolGroups.cs:28-29`.
  Tickets `#532` (api, MERGED as 523) and `#533` (ui, now unblocked).
- **`gamification_free_tier` is a PostHog flag evaluated PER USER.** `GetProfileQuery.cs:83-84`
  returns `canViewGamification` from it, so the client must never recompute the entitlement. The
  retrospective is a DIFFERENT entitlement: `GetRetrospectiveQuery.cs:61-63` and
  `PayGateService.cs:132-140` keep it Pro-only.
- **The Astra tool count "81 tools across 15 areas" is CORRECT**, counted 2026-09-14: 96 matches of
  `[McpServerTool` minus the 15 `[McpServerToolType]` class attributes. `FEATURES.md` agrees. The
  prefix match is a trap; recount before changing it.
- **The support API accepts more than the form allowed.** `SendSupportCommandValidator.cs` allows a
  200 character subject and a 5,000 character message. Pull request 951 raised the client to match.
- **No device list**, **no `uses24HourClock` write** (response-only at `GetProfileQuery.cs:147`),
  **no Astra eval trace** (`/api/chat` omits tool arguments, so `#26`'s assertion cannot be written).
- **`goals.filters.*` is dead**: seven keys in both locale files with zero production readers. The
  live filter strings are `progressScreen.goals.filterEmpty` and `clearFilter`. Recorded on `#53`,
  which owns that namespace.
- **GitHub's `reviewDecision` is not the Pullfrog verdict.** Read `list-bot-threads.mjs` and the
  `pullfrog-approval` check, never the aggregate. **`counts.unresolved = 0` is not a clean review**:
  a finding can live in the review BODY with no thread, and `reviewBody` is truncated at 4,000
  characters. **A COMMENTED review with an EMPTY body and zero threads still leaves
  `pullfrog-approval` red**; only `--re-review` produces the APPROVED state that flips it.
- **`tools/resolve-bot-thread.mjs` replies and resolves in one step.** Use it only when the finding
  is actually fixed. Its reply body comes from stdin.
- **`list-bot-threads.mjs` posts "@pullfrog review" only when `--wait-seconds` is above 0.** With
  `--wait-seconds 0` it polls once and requests nothing.
- **`orbit-api`'s Pullfrog runs by manual dispatch only**, so a redesign pull request there gets no
  review until one is requested.
- **The orchestrator guardrail refuses any shell redirect whose target contains a variable.** Write
  literal paths or a small node script.
- **`compose-prompt.mjs` appends EVERY ticket comment in order**, so the newest comment is the
  freshest instruction a worker sees. With several branches live on one ticket, post a routing
  comment last naming which branch runs which stage. This hazard appeared three times on 2026-09-15.
- **Cloud has a circuit breaker.** Two empty diffs in one session open it and every later ticket
  routes local. It fired on 2026-09-14.
- **The local worker pool is TWO at a time.** A third gets killed for low memory even with 11 GB free.
- A stale eslint cache at `apps/mobile/.expo/cache/eslint` blocks every commit in a worktree.
- **`apps/mobile/__tests__/scripts/__snapshots__/widget-header.test.ts.snap` flips its line endings
  on its own.** Restore it and keep it out of every commit.
- **A squash merge duplicates content into every stacked branch.** Resolve by reading both sides,
  never by taking one whole. For `eslint-suppressions.json`, keep BOTH sides' deletions and the LOWER
  count, then prove it with `GITHUB_BASE_REF=redesign/main node tools/check-suppressions-ratchet.mjs`.
- Worktree and branch debt is large and harmless. Read 2026-09-15 at 01:29 UTC: four dirty worktrees
  in `orbit-ui-mobile` (`orb-70-android-widget` 34 files, `ticket-351-primitives` 179,
  `orb65-red-evidence` 4, `ticket-174-measure` 1, all last touched 2026-08-25), four stashes, three
  detached HEADs whose commits are already reachable, and no dirty worktree or stash in `orbit-api`.

## How to run a stage, learned 2026-09-13 to 2026-09-15

- **List the open pull requests in the target repository before starting a ticket.**
- **A review order names the tests that pass with the bug present.**
- **Capture a test run to a file, never through `tail`.**
- **Read the worker's `## Assumptions` at EVERY exit, including a clean one.** They are also where a
  worker records that it corrected YOUR order: on 2026-09-15 one caught that Monday-first index 5 is
  Saturday, not Friday, and fixed the fixture rather than the sentence.
- **Check the ticket's requirements against the tree, not against the worker's report.**
- **Grep for the BEHAVIOUR, not the identifier you expect**, and never hand a worker a caller list
  from memory. Two such lists were wrong on 2026-09-15; `isRecapShareEmpty` had five call sites where
  the order named three. Adding a parameter with NO default turns a missed caller into a compile error.
- **A stacked child is not blocked by a blocked parent.**
- **Verify a Pullfrog finding against the tree before acting on it.** Its own metadata warns that a
  finding written against an older head may be stale, and two on 2026-09-15 were: the code was
  already correct and a worker launch would have proved only that.
- **The orchestrator can clear a finding itself when the evidence is a read, not an edit.** A missing
  external-interface proof was answered by pulling the expansion out of a real workflow run log and
  appending it to the pull request body; no worker launch, no branch change.

## State

Built and merged to `redesign/main`, which is `f9535ee5`:

- **The calendar is finished**, all twelve stages, including the Google import candidates beside
  habits, the sync Pro boundary, and the timezone-partitioned event cache.
- **Privacy and Terms** ship with the 62ch measure reaching the live route, one `main` landmark, and
  the Android bottom inset reserved. **About** stages 1, 2 and 4 are merged.
- **Perfil** has its five-group frame, data export, the Astra allowance panel, the product email
  consent question, the API keys and MCP surface behind the plan gate with step-up bound to the auth
  session, and the more-of-Orbit routes group.
- **Wrapped's cover and paging are in** (947, 955).
- Progresso exists as the fourth destination with XP and achievements.
- **The standalone streak, achievements, insights and retrospective routes are GONE** on both
  platforms, and mobile ships four tabs. Verified 2026-09-15; the only survivals are in
  `apps/web/.next/dev/types/routes.d.ts`, a build cache. So `#57` and `#58` have no removal work left
  and should not get their own branches: their section content is `#329`'s stack.
- **The Android widget's seven stages are all merged** (871, 873, 876, 897, 900, 908 and the
  signed-out card). `#76` is NOT closed: see the open item below.
- **`orbit-api` `redesign/main` is `827b99bd`** and now runs the full CI suite on its pull requests.
- The harness is finished. The mobile test suite reads correctly at any device timezone.

Merged during the 2026-09-14 into 09-15 run: `api#523` (support tool triggers), `ui#965` (`#538`
readiness identity), `api#524` (`#539` redesign CI), `api#518` (`#505` repairable gap dates).

In flight, read live 2026-09-15 at 01:29 UTC. **Nothing here waits on Thomas.**

| pull request | base | head | state |
|---|---|---|---|
| ui 960, Wrapped s4 | `redesign/main` | `ef6b0c8d` | 4 rounds done. Awaiting review of the goal-only reachability fix |
| ui 961, Wrapped s5 | 960's branch | `6051de1f` | **DIRTY.** Needs a merge-forward from 960, then one job: point the SHARE CARD at `shareCard.stats.goalsClosed` |
| ui 962, Wrapped s6 | 961's branch | `6e40e930` | APPROVED, clean |
| ui 963, Wrapped s7 | 962's branch | `b34c0d88` | APPROVED, clean |
| ui 894, Progresso s3 | `redesign/main` | `854ad507` | 3 rounds done. Awaiting review of the capped-bank copy |
| ui 956, Progresso s4 | 894's branch | `b49b420d` | APPROVED, clean |
| ui 957, Progresso s6 | 956's branch | `5812ff33` | APPROVED, clean |
| ui 958, Progresso s7 | 957's branch | `5ffa297f` | **3 open P1 findings**, spec posted on `#329`, not yet started |
| ui 959, Progresso s5 | 958's branch | `4557939f` | APPROVED, clean |
| ui 953, Perfil s8 | `redesign/main` | `aef33003` | worker running on round 5 |
| ui 954, Perfil s9 | 953's branch | `1c156658` | APPROVED, clean |
| ui 951, About s5 | `redesign/main` | `182fef4e` | 1 open finding: restore the canvas Send-disabled rule. Spec posted on `#73` |
| ui 964, `#536` worker cost | `redesign/main` | `94701d56` | blocked on `#537`'s SKILL.md doc change; see below |
| ui 890, orchestrate docs | `redesign/main` | `df2d862d` | untouched by policy, see below |
| api 521, `#526` | `main` | `cc86c612` | live calendar timezone defect, not redesign work |
| api 520 | `main` | `ce610484` | gating matrix tooling, not redesign work |

Four dependabot pull requests sit on UI `main` and three on api `main`. None is part of this effort.

Open tickets: 124 carry `repo:ui` and 67 carry `repo:api`. Reproduce with
`gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200`.

Ten screen tickets remain open: `#53` Goals, `#56` calendar, `#57` streak, `#58` achievements, `#63`
Wrapped, `#67` onboarding, `#71` settings, `#73` About, `#74` copy pass, `#76` widget.

Filed 2026-09-14 and 09-15: `#534` (fixed inside 960, close when it lands), `#535` layout guard has
no 320px width, `#536` worker cost (964), `#537` batch Pullfrog fixes, `#538` readiness identity
(MERGED as 965, **ticket still open, close it**), `#539` api redesign CI (MERGED as 524), `#540`
mobile ICU (in flight).

Not started:

- **`#76` needs a stage 8.** Its criteria demand a Vitest test for the progress figure rule and there
  is none. `OrbitWidgetService.kt:129-137` has an unchecked branch: `flattenHabits` sets
  `hasChildren` from `children.isNotEmpty()` but `childrenTotal` from `countingChildren.size`, which
  filters bad habits out, so a parent whose children are ALL bad contributes 0 to both figures while
  still rendering a row. Spec posted on `#76`.
- About stage 3 (feature guide subjects, facts posted on `#73`), stages 6, 7 and 8.
- Onboarding, the tour and the feature guide (`#67`): nothing built, almost entirely copy.
- Progresso's six accessibility sweeps: `#472`, `#473`, `#476`, `#477`, `#478`, `#480`.
- **`#356`, regenerating the redesign coverage mapping.** This is the completion check for the whole
  effort and it is provably stale: `R6-screen-goals`, `R9-screen-streak` and `R10-screen-achievements`
  hold ZERO surfaces while `overlay-goals-goal-detail-drawer` sits under `R12-screen-insights`, a
  route D69 deleted, and `#56` cites "all 10 surfaces under `R8-screen-calendar`" where the tool
  reports 6. **No screen ticket can be honestly closed before this runs.**

## Pull requests 890 and 964, and ticket #537

890 edits `.claude/skills/orchestrate/SKILL.md`, the contract a run is executing, and that skill's
own hard prohibition forbids editing it from inside a run. Its one Pullfrog finding is small: the new
"Who writes the fix" section attributes the actor split to D89, and the attribution belongs to
`.claude/rules/core.md`.

**964 is blocked by the same file.** Its one remaining finding is that `SKILL.md` still documents the
launcher without `--tier` or `--relaunch-reason` while the pull request enables the cap, so the
checked-in production caller does not describe every enabled control. Pullfrog offers two outcomes:
merge the contract change with the activation, or sequence the activation after it. `#537` owns that
doc change and is the same shape.

The three are one job: an attended session, or a run that accepts it is editing its own contract,
fixes the `SKILL.md` prose once and lands 890, 964 and `#537` together. Note that D95 forbids a run
editing **the gate it is judged by**, and Pullfrog's rubric lives server-side, so a `SKILL.md` edit
does not touch it. The prohibition at `SKILL.md:1222` is broader and is what still holds these.

## Open questions

**None are his.** One future action is his alone and is not a blocker: raising
`AppConfig.MinSupportedVersion` for `#529` after the carrying build is live in the Play fleet.

## Copy, which is yours

Written and landed during the 2026-09-14 into 09-15 run: the deletion warning and its Pro variant,
`profile.freshStart.description`, `profile.support.subjectRequired`, `messageRequired`,
`emailLockedReason`, `shareCard.stats.goalsClosed`, `wrapped.slides.goals.some`,
`wrapped.slides.consistency.summary`, `.even`, `progressScreen.streak.repairPartial` and
`repairCapped`.

Still to write:

1. **`profile.support.sendIncomplete`**, on 951, only if the canvas draws no reason beside the
   disabled Send. Draft: "Add a subject and a message to send." / "Escreva um assunto e uma mensagem
   para enviar."
2. **The feature guide's rewritten entry sets** for About stage 3. The verified product facts are
   posted on `#73`; the words are the worker's to write from `BRAND.md`.
3. **Onboarding, the tour and the feature guide** (`#67`), almost entirely copy.
4. **The 32 shortened control labels** for ticket `#74`, drafted across 58 sites in both locales and
   never landed. Landing them retires the matching inline suppressions.
5. `progressScreen.achievements.lockedBody` was REVIEWED and KEPT as "Orbit Pro tracks achievements
   and XP." It matches its siblings `streak.lockedBody` and `window.lockedBody` and is true for the
   person who sees it. Do not reopen it.
