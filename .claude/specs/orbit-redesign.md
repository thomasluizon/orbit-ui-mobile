# Orbit redesign

**At a glance:** the living spec for the redesign. One effort, one spec, updated by every `/handoff`.
Everything durable lives here; a handoff prompt carries only what to do next.

## What this is

Orbit is being rebuilt screen by screen against a granted design canvas. Every screen lands on both
web and Android together. Nothing reaches a real person until the whole redesign ships, so
`redesign/main` is the branch and `main` stays untouched.

Thirteen screens. The calendar, Privacy and Terms, the Android widget and most of About are finished.
The rest are listed under State.

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
  is 2 and `--tier mechanical` selects `model_reasoning_effort="medium"`. **LIVE since 2026-09-15**:
  pull request 964 merged and `launch-worker.mjs` accepts `--tier <default|mechanical>` and
  `--relaunch-reason <text>`. Batch a review's findings into ONE order regardless.
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
- **2026-09-15: a run MAY edit its own contract, and the amended rule says when.**
  `SKILL.md`'s old "never edit this skill from inside a run ... repair it after" had no "after": every
  session here is a run, so it made its own repair impossible and left three pull requests permanently
  unlandable. The rule now bans the case it was reaching for, an edit that changes what THIS run is
  judged by or excuses its own review, and says a contract change takes effect for the NEXT run. D95
  is unchanged and still absolute for gates.
- **2026-09-15: when a gate and a review disagree about ORDER, the gate decides.** 890 and 964 blocked
  each other: the review wanted the documentation first, and `test-hooks.mjs` refuses documentation
  that prescribes a flag the checked-in tool rejects. So the activation merged first and the docs
  second. Posting the five FAIL lines on 964 is what moved it.
- **2026-09-15: a stale FACT in a granted canvas is not a design authority.** `Orbit Wrapped.dc.html`
  said in five places that goal completions had no producer while
  `GetRecapQuery.cs:22,167,245-259` counts them on `main`. Those sentences were corrected and nothing
  drawn was touched. Verify the claim in the other repository BEFORE editing a canvas, and never let
  a correction reach a token, colour, radius, shadow, font, spacing, size or element: that is still
  Thomas's.
- **2026-09-15: a parameter added with NO default turns a missed caller into a compile error.** Used
  three times that night, on `buildShareCardStats`, `deriveProgressViewState` and the goal count, and
  it caught a caller each time.

## Constraints that are not obvious from the code

- **Mobile parses ICU now, and an apostrophe next to ICU syntax is the trap.** `#540` merged as 966
  on 2026-09-15: `apps/mobile/lib/i18n.ts` uses `i18next-icu/cjs`, so the eleven plural strings that
  rendered as garbage on Android now render. Two consequences that bind every new string:
  - **In ICU an apostrophe FOLLOWED by `{`, `}` or `#` opens a quoted literal**, so `'{name}'`
    renders the literal `{name}` and never substitutes. Double it: `''{name}''` renders `'Corrida'`.
    `habits.clarification.successCreated` was broken this way on WEB in production long before
    mobile, because next-intl always parsed ICU.
  - A guard in `packages/shared/src/__tests__/i18n.test.ts` walks every key in both locale files and
    fails on an unpaired apostrophe next to ICU syntax. Any new string has to pass it.
- **A MOBILE test must render through the app's own i18n instance**, imported from `@/lib/i18n`, not
  through next-intl's `createTranslator`. Two separate pull requests shipped mobile assertions that
  passed while Android rendered fragments, because `createTranslator` is web's translator. Web keeps
  `createTranslator`; it is what web actually renders through.
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
- **Pullfrog posts EMPTY-bodied COMMENTED reviews as progress markers while it works**, and
  `list-bot-threads.mjs` accepts the first one as `REVIEWED` and returns. On 953 two arrived at
  01:52 and 01:54 and the real APPROVED review only landed at 02:00; on 958 three arrived within
  three seconds. Ticket `#541` owns the fix. Until it lands, the verdict is the
  `pullfrog-approval` CHECK RUN at the exact head, or, when that check is absent from the rollup, a
  review whose `reviewState` is APPROVED and whose `reviewedCommit` is that head. That disjunction is
  what `readiness-receipt.mjs:215-218,568-571` actually implements.
- **Read only the LATEST check run per name.** A push while a workflow is in flight leaves the
  superseded run's `failure` or `cancelled` on the same commit, so reading every row reports a red
  GitHub itself already replaced. This nearly cost a worker on 966, whose Cross-Platform Parity had
  an old `failure` sitting beside the newer `skipped` the exemption label produced.
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
  routes local. It fired again on 2026-09-15, after three empty results across two tickets, and every
  round that night ran local afterwards.
- **A Cloud container has NO origin remote and cannot fetch.** A `#537` worker recorded it directly:
  `git fetch origin <branch>` failed and `gh` could not authenticate. So a MERGE-FORWARD can never run
  in Cloud; it is always local. A Cloud worker also cannot read another branch's source, so an order
  that says "read pull request N's diff" has to be local too.
- **The local worker pool is ONE at a time on this machine.** Two was the old figure. On 2026-09-15
  the host's memory guard killed two codex workers and three background node waiters in one go with
  8.5 GB free. One worker, and poll reviews inline rather than holding background waiters open.
- **A fresh worktree needs `npm install` before any hook or harness runs.** Two separate worktrees
  failed a commit or a harness on a missing `typescript` and a missing `sharp`, because their
  `node_modules` predated a dependency. Install once, staggered, never in parallel.
- A stale eslint cache at `apps/mobile/.expo/cache/eslint` blocks every commit in a worktree.
- **`apps/mobile/__tests__/scripts/__snapshots__/widget-header.test.ts.snap` flips its line endings
  on its own.** Restore it and keep it out of every commit.
- **A squash merge duplicates content into every stacked branch.** Resolve by reading both sides,
  never by taking one whole. For `eslint-suppressions.json`, keep BOTH sides' deletions and the LOWER
  count, then prove it with `GITHUB_BASE_REF=redesign/main node tools/check-suppressions-ratchet.mjs`.
- **A Server Action strips everything but `digest` from a thrown error.** Installed Next 16.3.4,
  `react-server-dom-webpack-server.node.production.js:1925-1928` and the matching client lines: a
  thrown `ApiClientError` reaches the browser as `{ digest: string }` and nothing else. So a web hook
  that reads `status` off a caught action error never fires in production. Return a serializable
  discriminated `ActionResult` instead; the shared one is
  `apps/web/app/actions/action-result.ts`. A test that rejects from a MOCKED action never crosses the
  boundary and so passes over the defect.
- **Android ignores an accessibility node it considers invisible, and there are two ways to lose it.**
  `opacity: 0` maps to `View.setAlpha(0)`, and a fully off-screen view has no visible rect, so
  `View.isVisibleToUser()` returns false. Both were tried on the support success announcement and both
  failed. The answer is `AccessibilityInfo.announceForAccessibility`, declared in the installed React
  Native at `AccessibilityInfo.d.ts:146` and implemented at `AccessibilityInfo.js:474-478`. Never hide
  a live region and expect it to announce.
- **Run `npm run type-check` from the repository ROOT, never per workspace.** Per-workspace runs
  never reach `packages/shared`'s contract type tests. That gap shipped a TS2345 on one pull request
  and four TS2344s on another, both from containers that had run only `--workspace=apps/...`.
- Worktree and branch debt is large and harmless. Read 2026-09-15 at 10:20 UTC: dirty worktrees are
  `ticket-351-primitives` 179 files, `orb-70-android-widget` 34, `orb65-red-evidence` 4 on a detached
  HEAD, `ticket-174-measure` 1, and `ticket-73-static-s5` 8, which is the only live one and is listed
  in State. Four stashes, all from tickets that shipped. Three detached HEADs whose commits are
  reachable. `ticket-335-avisos` shows 11 "unpushed" commits and `ticket-329-progresso-s7b` six; both
  are artefacts, the first of a squash merge that landed as pull request 843 and the second of an
  upstream pointed at its stack parent. `orbit-api` has no dirty worktree and no stash.

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
  appending it to the pull request body; no worker launch, no branch change. On 2026-09-15 this
  cleared four findings without a worker: an `i18next-icu/cjs` namespace shape, a `PAY_GATE` response
  proved through five `orbit-api` files, a fix that had already landed on the branch's own parent, and
  a copy question that was never Thomas's to answer.
- **Measure a stacked branch's OWN diff BEFORE ordering its merge-forward**, with
  `git diff <parent's final head>...<branch> --stat`, and put the figure in the order together with
  the check that proves it: after committing, `git diff origin/redesign/main...HEAD --stat` must
  report exactly those files. Four merge-forwards resolved that way on 2026-09-15 and every one came
  back matching the measurement.
- **A worker order that says "read pull request N" or "fetch a branch" must run LOCAL.** A Cloud
  container has no origin remote, so it will silently document from your comment instead, which is
  how `--tier` and `--relaunch-reason` nearly landed unverified.
- **Post a routing comment LAST, naming the round.** With several branches live on one ticket, a
  routing comment that names an older round is worse than none: `compose-prompt.mjs` appends every
  comment and the worker reads the newest as current.

## State

Read live 2026-09-15 at 10:20 UTC. `redesign/main` is `2704aa3f`.

### Built and merged

- **The calendar is finished**, all twelve stages, including the Google import candidates beside
  habits, the sync Pro boundary, and the timezone-partitioned event cache.
- **Privacy and Terms** ship with the 62ch measure reaching the live route, one `main` landmark, and
  the Android bottom inset reserved.
- **About** stages 1, 2, 4 and 5 are merged. Stage 5 rebuilt the support form on the system controls:
  Send is disabled while the subject or the message is empty, as the canvas draws it, with a line
  naming which one is missing; whitespace does not fool it; a field the profile fills no longer keeps
  the error for the value it replaced; and a successful send announces through
  `AccessibilityInfo.announceForAccessibility`.
- **Perfil** has its five-group frame, data export, the Astra allowance panel, the product email
  consent question, the API keys and MCP surface behind the plan gate with step-up bound to the auth
  session, the more-of-Orbit routes group, and its ending actions. The deletion warning now states
  only the 30-day cap the server guarantees.
- **Wrapped** has its cover, its paging and stage 4. A recap made shareable only by closed goals no
  longer exports an image of zeroes: the card carries the goal count and its label as the canvas
  draws it, and the goals caption renders on Android.
- **Progresso** exists as the fourth destination with XP and achievements, and stages 3 and 4 are in.
  A locked account no longer sees a false full-bank notice or a repair it cannot use; a 409 during a
  repair re-reads the server; and on web that path works at all for the first time.
- **The Android widget is finished**, all eight stages. A good parent whose children are all bad
  habits counts as one rather than vanishing from both figures, with JVM tests that call
  `prepareWidgetDay` directly.
- **Mobile renders ICU**, so the eleven plural strings that were garbage on Android now render, and a
  shared guard fails any future string that would swallow a placeholder.
- **The harness work is done.** `#536` capped worker launch cost by tier and branch, `#537` gave the
  orchestrate skill its batching contract and tier routing, and `#356` rebuilt the coverage mapping.
- The standalone streak, achievements, insights and retrospective routes are GONE on both platforms,
  and mobile ships four tabs. So `#57` and `#58` have no removal work left; their section content is
  `#329`'s stack.

### The completion check works now

`node tools/redesign-coverage.mjs` validates on `redesign/main`: **190 manifest surfaces across the 21
canvas documents, 8 deleted with their decisions, 3 named exclusions.** It derives the document set by
reading `design/canvas/*.dc.html`, rejects an invented or missing document name, and refuses a
`deleted` id that is still live in the manifest. A live surface no canvas draws stays visible as a
NAMED exclusion rather than being parked under a document that does not draw it; the three are the
store-review prompt, the Astra import prompt and the session-expiry warning.

This is the completion gate for the whole effort. Before `#356` merged it reported zero surfaces for
three built screens and ten for a route D69 deleted.

### Open pull requests, all in `orbit-ui-mobile`

Read live 2026-09-15 at 10:20 UTC. None waits on Thomas.

| pull request | base | head | state |
|---|---|---|---|
| 954, Perfil s9 | `redesign/main` | `efa88425` | merged forward, CLEAN, no review of this head yet |
| 957, Progresso s6 | `redesign/main` | `2bd5ce88` | merged forward, CLEAN, no review of this head yet |
| 961, Wrapped s5 | `redesign/main` | `0a5ad417` | merged forward, only SonarCloud red, no review of this head yet |
| 958, Progresso s7 | 957's branch | `b6fb6396` | CONFLICTING after 957's parent merged; needs a merge-forward |
| 959, Progresso s5 | 958's branch | `4557939f` | APPROVED and clean, waits on its parents |
| 962, Wrapped s6 | 961's branch | `6e40e930` | APPROVED, CONFLICTING; needs a merge-forward after 961 |
| 963, Wrapped s7 | 962's branch | `b34c0d88` | APPROVED and clean, waits on its parents |

Four dependabot pull requests sit on UI `main` and are not this effort.

### `orbit-api`

`redesign/main` is `827b99bd` and runs the full CI suite on its pull requests. Two open pull requests
are real work and both are BLOCKED on review, not on the redesign: 521 (`cc86c612`, the live calendar
timezone defect `#526`, CHANGES_REQUESTED) and 520 (`ce610484`, gating matrix tooling). Three
dependabot ones sit beside them. Thomas's standing instruction routes both to `main`.

### Not started, or half started

- **About stages 6, 7 and 8 are half built and UNCOMMITTED.** The worker died mid-change when the
  Codex allowance ran out at 08:30. `C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-73-static-s5`
  holds 8 modified files, +263/-61, on branch `feature/ticket-73-static-s678` cut from `56ddfdd6`. It
  is **WEB ONLY**: `apps/mobile/app/support.tsx` is untouched, so it would fail Cross-Platform Parity
  and cannot be finished without a worker. It was deliberately not committed: the salvage rule forbids
  writing the implementation by hand, and half a screen is worse than none.
- **About stage 3**, the feature guide subjects. The verified product facts are posted on `#73`.
- **Onboarding, the tour and the feature guide** (`#67`): nothing built, almost entirely copy.
- **Progresso's six accessibility sweeps**: `#472`, `#473`, `#476`, `#477`, `#478`, `#480`.
- **`#53` Goals** and **`#74`'s copy pass**, whose 32 drafted labels across 58 sites have never landed.

### Tickets

121 carry `repo:ui` and 65 carry `repo:api`. Reproduce with

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200

Ten screen tickets remain open: `#53` Goals, `#56` calendar, `#57` streak, `#58` achievements, `#63`
Wrapped, `#67` onboarding, `#71` settings, `#73` About, `#74` copy pass, `#76` widget, plus `#329`
Progresso. `#76`'s work is complete and it can close as soon as someone judges it against the
coverage command; the rest have work left.

Closed during the 2026-09-14 into 09-15 run: `#538`, `#539`, `#536`, `#537`, `#540`, `#534`, `#356`.
Filed and still open: `#535` (the layout guard has no 320px width), `#541` (list-bot-threads accepts a
Pullfrog progress marker as a finished review), `#542` (a review-fix worker pushes before its threads
can be resolved).

## Open questions

**None are his.** Two future actions are his alone and neither blocks this spec:

- raising `AppConfig.MinSupportedVersion` for `#529`, after the carrying build is live in the Play
  fleet;
- the Codex allowance, which ran out at 2026-09-15 08:30 UTC and would otherwise have returned on
  2026-09-19 05:09. He reset it by hand the same morning. If a worker fails for quota rather than for
  code, that is the one external ending this run may take, and it is reported as external.

## Copy, which is yours

Landed during the 2026-09-14 into 09-15 run: the deletion warning and its Pro variant,
`profile.freshStart.description`, `profile.support.subjectRequired`, `messageRequired`,
`emailLockedReason`, `sendIncomplete`, `sendNeedsSubject`, `sendNeedsMessage`,
`shareCard.stats.goalsClosed`, `wrapped.slides.goals.some`, `wrapped.slides.consistency.summary`,
`.even`, and `progressScreen.streak.repairPartial`, `repairEmpty` and `repairCapped`.

Three of those were rewritten a second time, and each for the same reason: **a string that reads a
server value must state only what the server guarantees.** `warningPro` promised a date the 30-day cap
overrides. `repairEmpty` and `repairPartial` told an underfunded person to wait for the next earned
freeze, which cannot rescue that gap at all, because `UserStreakService.cs:107-123` only ever offers a
gap ending LOCAL YESTERDAY and `StreakFreeze.cs:24-39` rejects it after that. And `repairPartial`
rendered "only 2 is banked" until `banked` got its own plural in both locales.

Still to write:

1. **The four support subject options** for About stage 6, each with a short description: something
   does not work, billing or plan, account and access, something else. The API takes `subject` as free
   text, so they are authored phrasings of that same string. Note that with a picker there is no empty
   subject, so `sendNeedsSubject` and `sendIncomplete` need rereading and any unreachable one deleted.
2. **The feature guide's rewritten entry sets** for About stage 3. The verified product facts are
   posted on `#73`; the words are the worker's to write from `BRAND.md`.
3. **Onboarding, the tour and the feature guide** (`#67`), almost entirely copy.
4. **The 32 shortened control labels** for ticket `#74`, drafted across 58 sites in both locales and
   never landed. Landing them retires the matching inline suppressions.
5. `progressScreen.achievements.lockedBody` was REVIEWED and KEPT as "Orbit Pro tracks achievements
   and XP." It matches its siblings `streak.lockedBody` and `window.lockedBody` and is true for the
   person who sees it: the locked card renders only when `canViewGamification` is false, which means
   no Pro and no flag. Do not reopen it. Pullfrog asked for "the product owner's ruling" on it on
   2026-09-15 and that request was declined, because copy is not his.
