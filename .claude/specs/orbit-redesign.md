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
- **2026-09-15** **The suppressed lint violations are part of finishing the redesign, and speed
  matters.** "the lint violations fixes, and the redesign finished, as fast as possible." Said after
  being shown the 367 suppressed violations across 99 files. They are not a separate cleanup effort
  to be scheduled later: every screen ticket already requires its own share gone with a strict
  Suppressions Ratchet decrease, and that is now the largest remaining block of work. "As fast as
  possible" narrows HOW, never WHAT: it means stop idling a worker slot and stop opening fronts that
  do not close a ticket. It does not license a cheaper implementation, and it never overrides
  "always the best implementation".
- **2026-09-16** **Do not ask permission for work he already asked for.** After the beta release
  was held pending a confirmation he had already given in writing: "you shouldnt have asked me
  to say 'go', you could've just shipped it." A written instruction IS the authorisation.
  Ask again only when the scope or the inputs changed.
- **2026-09-16** Answered directly, both recorded on their tickets: **centred phone IS the
  large-screen answer**, so no tablet layout is filed and none should be; and the **public Play
  developer name becomes TL SOFTWARE ENGINEERING LTDA**.
- **2026-09-16** **The local worker cap is TWO, not three.** Four were killed at once for low
  memory, every one of them after committing. This supersedes D89's figure of three on this machine.
- **2026-09-16** **Copy he asks you to apply still gets both passes first.** On the Play listing
  text: "first make sure all the texts adhere to brand.md and run /humanizer on them." Copy being
  yours does not mean copy skips review; it means the review is yours to run, not his to sit through.
- **2026-09-16** **Beta licences the easy path on sequencing, and only on sequencing.** "i dont care,
  the app is in beta, and basically only i use it, theres no problem in doing the easy approach, no
  matter if it will break (for now)." This narrows deploy-API-first while the fleet is him alone. It
  does NOT narrow "always the best implementation": it buys a simpler deploy order, never simpler code.
- **Standing** Ticket `#74` owns existing copy.
- **2026-09-16** **Device verification is NOT a gate on building something. Build it.** "just build
  it, we dont test now ... when we finish the WHOLE REDESIGN, i will generate an apk and test on my
  phone." Said when `#543`'s React Native feature-flag override was held back because no test can see
  whether it works and the emulator is his. So: "this needs a device to verify" is never a reason to
  stop, scale down, or hand the decision back. Build the correct thing, say plainly in the pull
  request body what only a device can confirm, and move on. He tests the whole redesign once, on his
  phone, from an APK he generates himself at the end.
- **Standing** Never boot the Android emulator. It is his visual testing surface.
- **Standing** `redesign/main` stays unprotected. Settled; never raise it.

## How the work runs

Every session enters through `/orchestrate`. Codex workers make every code change; Claude
orchestrates and never edits code. `.claude/rules/core.md` is the operating contract and carries the
rest, D89 and D90 included.

## Decisions this effort runs on

**The ADRs live in the brain vault. Read them before you act on anything below.** This spec carries
pointers; the reasoning, the options that were rejected and the cost of each are only in the note.

**Read them through the Obsidian MCP, not the filesystem.** `mcp__obsidian__obsidian_list_notes` to
see what exists, `mcp__obsidian__obsidian_get_note` to read one, and
`mcp__obsidian__obsidian_search_notes` when you know the idea but not the filename. The vault is also
on disk at `C:/Users/thoma/Documents/Programming/Projects/brain`, but `cat` and `ls` miss the
frontmatter, the tags and the backlinks that say which decision superseded which. Use the MCP.

- `2 Areas/20-29 Orbit Engineering.md` is the area note and the way in.
- `2 Areas/20-29 Orbit Engineering/Decisions/` holds one note per decision. The ones this effort
  runs on, by exact filename:
  - `Stop the canvas pass and move the redesign into real code as tickets.md`
  - `The unit of redesign delivery is a whole screen with nothing old left on it.md`
  - `Every redesign screen runs a design-first loop in conversation, never autonomously.md`
  - `Run the rest of the redesign unattended and review it once as a whole.md`
  - `Run the redesign cloud-first at max parallelism and carry the operating contract into every session.md`
  - `Claude orchestrates only in redesign build sessions, Codex workers make every code change.md`
  - `Redesign PRs target redesign-main only until the redesign ships.md`
  - `A screen PR never merges on green and approval alone, only Thomas's eyes clear it.md`
  - `Merge readiness during the redesign is a fresh approval plus a disclosed artifact.md`
  - `A run must not edit the gate it is judged by.md`
  - `A gate PR merges only when every check is green with nothing excused.md`
  - `An unattended run proves an external interface from installed source, never a live call.md`
  - `Ship a sleep skill so an unattended session always takes the best approach and logs every decision.md`
- `2 Areas/20-29 Orbit Engineering/Orbit debloat and redesign master plan 2026-08-05.md` is the plan
  the screen list came from.
- `2 Areas/20-29 Orbit Engineering/The ui-skills shortlist for the Orbit redesign.md` is why the
  review sweep uses the skills it uses.

A note that contradicts this spec is the authority, because the note is where Thomas decided it. Say
so rather than following the stale line here, and fix the line.

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
  same way. A fourth joined them on 2026-09-15: `profile.support.offlineReason` promised "the message
  will go out when your connection returns" and neither platform has a queued send at all.
- **2026-09-15: a parent pull request must be correct WITHOUT its children.** `960` shipped a goals
  slide that a goal-only recap could not reach, with the fix sitting in its child `961`. "They land
  together" is an assumption, not a property: a child can be reworked or delayed. The fix moved down.
- **2026-09-15: the granted canvas outranks a run's own reasoning, including a good one.** A run
  ordered the support Send button to stop gating on an empty subject, reasoning that a disabled
  control with no stated reason tells a person nothing. `design/canvas/Orbit Sobre.dc.html:484` reads
  `disabled: send === 'sending' || offline || !subject || !message.length`. The concern was real and
  the override was not: the right answer was the canvas behaviour PLUS a stated reason, which the new
  `Input` `hint` contract now makes possible. **Applied again on 2026-09-15**: rather than build a
  queued send to make a false string true, the string was corrected, because the canvas draws a
  DISABLED send with a reason and a message leaving silently later is not what it specifies.
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
  it caught a caller each time. The converse also bites: a parameter whose every caller now passes one
  literal value is DEAD and gets deleted, which is how `useProgressRetrospective(enabled)` was caught.
- **2026-09-15: enabling a previously disabled request inherits the whole fetch layer, not just the
  response shape.** Making Progresso's retrospective query always fire was correct, and it introduced
  a worse defect than it fixed: `apps/web/lib/api-fetch.ts:103-107` sets
  `globalThis.location.href = '/upgrade'` on a 403 `PAY_GATE` unless the caller passes
  `{ handlesPayGate: true }`, so a free account was navigated off Progresso before the locked card
  could render. Reason about what the TRANSPORT does with a response, not only about its body.
- **2026-09-15: the version metadata on a support request rides in the MESSAGE, with the client
  reserving room.** Compute the message field's `maxLength` as `SUPPORT_API_MESSAGE_MAX_LENGTH` minus
  the exact version-suffix length, so nothing can be typed that will not fit and nothing is ever
  truncated. Rejected: raising the API cap, which puts a live validator change and a deploy on the
  critical path for about fifteen characters; and moving it into Subject, which turns a four-option
  CATEGORY into a variable string nothing can filter on.

## Constraints that are not obvious from the code

- **Mobile parses ICU now, and an apostrophe next to ICU syntax is the trap.** `#540` merged as 966
  on 2026-09-15: `apps/mobile/lib/i18n.ts` uses `i18next-icu/cjs`, so the eleven plural strings that
  rendered as garbage on Android now render. Two consequences that bind every new string:
  - **In ICU an apostrophe FOLLOWED by `{`, `}` or `#` opens a quoted literal**, so `'{name}'`
    renders the literal `{name}` and never substitutes. Double it: `''{name}''` renders `'Corrida'`.
  - A guard in `packages/shared/src/__tests__/i18n.test.ts` walks every key in both locale files and
    fails on an unpaired apostrophe next to ICU syntax. Any new string has to pass it.
- **A MOBILE test must render through the app's own i18n instance**, imported from `@/lib/i18n`, not
  through next-intl's `createTranslator`. Web keeps `createTranslator`.
- **Deleting an account DEACTIVATES, and the schedule has two gates.**
  `ConfirmAccountDeletionCommand.cs:31-35` takes the EARLIER of plan expiry plus seven days and
  `nowAtUtc + AppConstants.MaxDeletionGraceDays`, which is **30**. `VerifyCodeCommand.cs:104-110` and
  `GoogleAuthCommand.cs:139-149` cancel the deactivation on sign in. **`#71`'s acceptance criterion
  "Delete account says there is no way back" is WRONG about the product and must never be executed.**
  954 landed the honest wording; an errata sits on the ticket.
- **A streak freeze is banked automatically and spent by hand.** `AwardStreakFreezeIfEligible` banks
  one per `StreakDaysPerFreeze` (7) days of streak, capped at `MaxStreakFreezesAccumulated` (3) held;
  `MaxStreakFreezesPerMonth` (3) caps SPENDING. `UserStreakService.EvaluateRepair:193` offers a repair
  for YESTERDAY only. Nothing applies a freeze on its own. This does NOT contradict D73: banking is
  automatic, spending is by hand, and `#57`'s criterion is about applying.
- **`RepairableGapDates` is independent of the freeze bank, on purpose.**
  `GetRepairableGapDatesAsync:84-127` walks SCHEDULED occurrences back from yesterday, and
  `EvaluateGapRepair:169-242` never reads `StreakFreezesAccumulated`. The wire type is nullable:
  `openapi.json` declares `"type": ["null", "array"]`.
- **No display-complete calendar events endpoint.** `useCalendarEvents` is the manual-import feed:
  bounded to 60 days ahead, keeps only the first occurrence of a repeating event, and strips
  already-imported ids. Recorded as a comment on ticket `#56`.
- **`/api/calendar/events` reports the EVENT's timezone, not the account's.** Ticket `#526`,
  orbit-api pull request 521, still open on `main` with one live finding.
- **The retrospective is Pro-only BY DEFAULT and CONFIG-CONTROLLED, not by construction.**
  `PayGateService.cs:131-142` reads `AppConfigKeys.RetrospectiveProOnly`, default true, and only then
  checks `HasProAccess`. So a client must never hard-code `hasProAccess` for it; it reads the server's
  answer. `gamification_free_tier` is a different thing again: a PostHog flag evaluated PER USER,
  returned as `canViewGamification` by `GetProfileQuery.cs:83-84`.
- **Listing and revoking API keys are protected by Pro entitlement only.** `GetApiKeysQuery.cs:30`
  and `RevokeApiKeyCommand.cs:22` check no step-up grant. Ticket `#529`, and see the deploy-order
  conflict recorded as a comment on it.
- **The API's create-key grant is one use AND expires.** `ConfirmApiKeyCreationChallengeCommand.cs:31-34`
  calls `AuthorizeOnce`, `CreateApiKeyCommand.cs:72-75` consumes it, and
  `ResultActionResultExtensions.cs:49` maps the failure to `428` with
  `errorCode = API_KEY_CREATION_CHALLENGE_REQUIRED`. The failure body is exactly `{ error, errorCode }`.
- **The support endpoint's real limits**, read at
  `src/Orbit.Application/Support/Validators/SendSupportCommandValidator.cs`: Subject `MaximumLength(200)`,
  Message `MaximumLength(5000)`, both `NotEmpty`. `send_support_request` activates only on five literal
  phrases, `ChatToolGroups.cs:28-29`.
- **The Astra tool count "81 tools across 15 areas" is CORRECT**, counted 2026-09-14: 96 matches of
  `[McpServerTool` minus the 15 `[McpServerToolType]` class attributes. The prefix match is a trap.
- **No device list**, **no `uses24HourClock` write** (response-only at `GetProfileQuery.cs:147`),
  **no Astra eval trace** (`/api/chat` omits tool arguments, so `#26`'s assertion cannot be written).
- **`goals.filters.*` is dead**: seven keys in both locale files with zero production readers. The
  live filter strings are `progressScreen.goals.filterEmpty` and `clearFilter`. Recorded on `#53`.
- **Expo's SAF copy DELETES an existing destination document before writing to it.**
  `node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/fsops/CopyMoveStrategy.kt`,
  `class SAF`, `prepareAsDestination`: given a destination that is a FILE it calls
  `file.deleteRecursively()` and then returns a sink pointing at what it deleted. Given the DIRECTORY
  it finds the existing child by the source's file name, deletes that, and writes a fresh child. So
  always copy to the directory, and name the SOURCE correctly first. `Directory.createFile(name,
  mimeType)` is declared at `build/Directory.d.ts:39`; the `Directory` constructor takes `file:///`
  URIs only, so joining a name onto a `content://` tree URI is never right.
- **Android's key map carries no Home and no End.**
  `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/events/KeyEvent.kt`
  maps only four DPAD codes at `:149-152` to `ArrowUp`, `ArrowDown`, `ArrowLeft` and `ArrowRight`, and
  `:57` returns `KEY_NAME_MAP[keyCode] ?: UNIDENTIFIED` with `UNIDENTIFIED = "Unidentified"` at `:65`.
  A mobile test that fabricates `'Home'` or `'End'` asserts something the platform cannot produce.
- **Android ignores an accessibility node it considers invisible**, both at `opacity: 0` and fully
  off-screen. The answer is `AccessibilityInfo.announceForAccessibility`, declared at
  `AccessibilityInfo.d.ts:146`. Never hide a live region and expect it to announce.
- **A Server Action strips everything but `digest` from a thrown error.** Installed Next 16.3.4,
  `react-server-dom-webpack-server.node.production.js:1925-1928`: a thrown `ApiClientError` reaches
  the browser as `{ digest: string }` and nothing else. Return a serializable discriminated
  `ActionResult` instead; the shared one is `apps/web/app/actions/action-result.ts`. A test that
  rejects from a MOCKED action never crosses the boundary and so passes over the defect. **The same
  shape bit again on 2026-09-15**: a test that mocks a HOOK cannot see a redirect that lives in the
  fetch layer below it.
- **Editing any calibrated file invalidates its digest and fails `Harness Calibration`.**
  `tools/check-calibration.mjs:217` digests the file's complete normalized content. Run
  `node tools/reseed-calibration.mjs` in the same pull request AND reconsider the verdict, whose text
  lives in `VERDICTS` inside `tools/reseed-calibration.mjs`. On 2026-09-15 a reseed also caught two
  entries that had drifted earlier and never been reseeded, one of them from a DIRECT commit to
  `redesign/main` that ran no pull request checks.
- **A Codex Cloud command run from the repository root drops an `error.log` there and blocks the next
  commit.** `runCodex` at `tools/lib/cloud-worker.mjs:141` passes `cwd: options.cwd`, so a caller that
  omits it lets the CLI write into the orchestrator's working directory.
  `check-root-allowlist.mjs` then refuses the commit, and `.gitignore:98` hides the file from
  `git status`, so the symptom looks unrelated. Ticket **`#544`**. Until it lands, delete the stray
  file rather than declaring it in `root-allowlist.json`.
- **GitHub's `reviewDecision` is not the Pullfrog verdict.** Read `list-bot-threads.mjs` and the
  `pullfrog-approval` check, never the aggregate. **`counts.unresolved = 0` is not a clean review**:
  a finding can live in the review BODY with no thread. **A COMMENTED review with an EMPTY body and
  zero threads still leaves `pullfrog-approval` red.**
- **Pullfrog posts EMPTY-bodied COMMENTED reviews as progress markers while it works**, and
  `list-bot-threads.mjs` accepts the first one as `REVIEWED` and returns. Ticket `#541` owns the fix.
  Until it lands, the verdict is the `pullfrog-approval` CHECK RUN at the exact head.
- **Pullfrog runs on the SAME GPT Sol allowance as the local Codex workers.** On 2026-09-15 three
  review runs failed with `action failed: provider error: The usage limit has been reached`,
  `providerID=openai modelID=gpt-5.6-sol`. A failed Pullfrog run looks exactly like a pending review:
  read the linked workflow run, and `gh run rerun <id> --failed` rather than posting a fresh request.
- **Read only the LATEST check run per name.** A push while a workflow is in flight leaves the
  superseded run's `failure` on the same commit.
- **`tools/resolve-bot-thread.mjs` replies and resolves in one step.** Use it only when the finding
  is actually fixed. Its reply body comes from stdin.
- **`list-bot-threads.mjs` posts "@pullfrog review" only when `--wait-seconds` is above 0.**
- **`orbit-api`'s Pullfrog runs by manual dispatch only.**
- **`gh api .../comments` without `--paginate` returns the OLDEST page**, so the newest comment looks
  missing. Always paginate when checking whether a routing comment landed.
- **The orchestrator guardrail refuses any shell redirect whose target contains a variable.** Write
  literal paths or a small node script.
- **`compose-prompt.mjs` appends EVERY ticket comment in order**, so the newest comment is the
  freshest instruction a worker sees. Post a routing comment LAST, naming the round.
- **Cloud is UNUSABLE and is being turned off by default.** On 2026-09-15 it returned an empty diff
  **five times out of five**: twice on `#76` stage 9, then on `#56` stage 13, `#545` stage 1 and
  `#547`. `materialize-cloud-result.mjs` exits 3 with `CLOUD_TASK_EMPTY` and classification
  `lost-work suspect`; the harness behaves correctly and the container is what fails. Thomas: "if
  cloud is bugged, just remove this funcionality ... just disable it by default". Ticket `#551`.
  **Do not pass `--cloud` until it lands.**
- **A Cloud container has NO origin remote, cannot fetch, and installs no dependencies reliably.** So
  a merge-forward is always local, and a Cloud handoff's `testResults` is a CLAIM. On 2026-09-15 a
  container reported "PASS: npm run type-check completed for @orbit/shared, @orbit/web, and
  @orbit/mobile" while the root type-check failed with five errors. **Re-run every check locally.**
- **The local worker pool is THREE at a time on this machine.** One was the old figure; Thomas asked
  for parallel worktrees on 2026-09-15, and five concurrent workers then drove the machine to 45% CPU
  with 6.6 GB free and he asked for it cut. Three holds at about 8% CPU and 8 GB free.
- **`caps.workerLaunchesPerBranch` is 2 and it WILL refuse a legitimate review-fix round.** Pass
  `--relaunch-reason "<text>"` naming the new head and the new findings. Do not raise the cap.
- **The ORCHESTRATING checkout's dependencies go stale too.** On 2026-09-15 the root type-check
  failed with two `TS2307`s for `@resvg/resvg-js` and `@vvo/tzdb`, both DECLARED and both absent, so
  every local verification before the install was worthless. Install in the checkout doing the
  judging, not only in fresh worktrees.
- A stale eslint cache at `apps/mobile/.expo/cache/eslint` blocks every commit in a worktree.
- **`apps/mobile/__tests__/scripts/__snapshots__/widget-header.test.ts.snap` flips its line endings on
  its own.** Restore it and keep it out of every commit.
- **A squash merge duplicates content into every stacked branch.** Resolve by reading both sides. For
  `eslint-suppressions.json`, keep BOTH sides' deletions and the LOWER count, then prove it with
  `GITHUB_BASE_REF=redesign/main node tools/check-suppressions-ratchet.mjs`.
- **Run `npm run type-check` from the repository ROOT, never per workspace.**
- **`node tools/redesign-coverage.mjs` validates against a COMMITTED manifest that nothing regenerates
  automatically.** No CI job runs `surface-manifest.mjs` or `redesign-coverage.mjs`; they are a manual
  completion gate. So a change that deletes surfaces reports `valid` until the manifest is
  regenerated, and only then fails with `mapping surfaceId is absent from manifest`. Any pull request
  that deletes a drawn surface regenerates the manifest AND moves the ids into
  `tools/redesign-groups.json`'s `deleted` section with the decision that removed them, in the same
  commit.
- Worktree and branch debt is large and mostly harmless. Read 2026-09-15 at 14:04 UTC under State.

## The suppressed lint violations, which are now the largest block of work

Read live on `redesign/main` at `52ec075e`:

    web     180 violations across 54 files
    mobile  187 violations across 45 files

By rule: `local/spacing-scale` 122 web and 146 mobile, `local/icon-size-grid` 38 and 36,
`local/no-space-x-y` 9 web, `local/require-focus-replacement` 5 web, `local/no-arbitrary-zindex` 3 web
and 5 mobile, plus three singletons on web. Reproduce with a read of both
`eslint-suppressions.json` files.

**Every screen ticket already requires its own share gone**, with a strict Suppressions Ratchet
decrease, so this is not new scope: it is scope that was never counted. It is also the reason a screen
that "looks done" is not closeable, which is how `#56`, `#71` and `#76` were all found open after being
called finished.

Two rules for this work, both learned the hard way:

- **Fix the VALUE, never the count.** Never raise a count, never add an inline disable, and never
  remove a rule from the ESLint config to make a file pass.
- **A shared primitive needs a caller sweep before it is touched.** `settings-row.tsx`,
  `settings-group.tsx` and `settings-description.tsx` are used by more than one screen, so a spacing
  fix there moves gaps on surfaces the ticket does not own. Name what you found in the pull request
  body. `components/navigation/notification-bell` is navigation chrome and belongs to the shell, not
  to Perfil.

## How to run a stage, learned 2026-09-13 to 2026-09-15

- **List the open pull requests in the target repository before starting a ticket.**
- **A review order names the tests that pass with the bug present.**
- **Capture a test run to a file, never through `tail`.**
- **Read the worker's `## Assumptions` at EVERY exit, including a clean one.** They are also where a
  worker records that it corrected YOUR order. On 2026-09-15 one REFUSED an item and was right: the
  order demanded all 5,000 of a person's characters plus a version suffix inside a 5,000-character
  field. A refusal with a reason beats a guess.
- **Check the ticket's requirements against the tree, not against the worker's report.**
- **Judge a ticket against its own acceptance criteria before closing it.** Three tickets called
  finished were not: `#76` ships one empty widget string where the canvas owes two, `#56`'s calendar
  import prompt still carries three off-scale spacing suppressions, and `#71` carries thirteen files'
  worth. `redesign-coverage.mjs` cannot see any of this; it checks the MAPPING, not the ticket.
- **Grep for the BEHAVIOUR, not the identifier you expect.**
- **A stacked child is not blocked by a blocked parent.**
- **Retarget a stacked child onto the integration branch BEFORE merging its parent.**
- **Verify a Pullfrog finding against the tree before acting on it**, and verify an external-interface
  claim against the INSTALLED source. Three findings on 2026-09-15 were confirmed that way and one
  earlier one was dismissed as stale.
- **The orchestrator can clear a finding itself when the evidence is a read, not an edit.**
- **Measure a stacked branch's OWN diff BEFORE ordering its merge-forward**, against its parent's
  FINAL head rather than the head it was stacked on, with
  `git diff <parent final head>...<branch> --stat`, and put the figure in the order together with the
  check that proves it: after committing, `git diff origin/redesign/main...HEAD --stat` must report
  exactly those files.
- **A merge-forward order forbids fixing anything it finds.** Say it in the pull request body and give
  it its own round; a merge-forward carrying a behaviour change is a review nobody gave.
- **A worker order that says "read pull request N" or "fetch a branch" must run LOCAL.**
- **Post a routing comment LAST, naming the round.**


## What 2026-09-15 into 09-16 proved about reviews and checks

- **A forced `--re-review` is worth its cost.** Four times in one night it returned a NEW P1 on a
  head that already carried a green approval. The worst was 972: an empty rendered set fell back to
  a stale visibility calculation, so Select all reached habits the screen was not showing and bulk
  delete could remove them. Ask for one on any head that matters.
- **`pullfrog-approval` does not publish on a MERGE-ONLY head.** A push with a real diff publishes
  it; an `update-branch` or a bare merge commit does not, even though Pullfrog reviews and APPROVES
  that exact commit. It arrives later from the mention runs, so wait. **Never push an empty commit
  to manufacture a diff**: a required check satisfied by a commit written to satisfy it proves
  nothing.
- **A red check is not always a defect.** On 974 a `Type Check` red was `npm error code ECONNRESET`
  inside `npm ci`, while the same commit passed uncached locally. Read the log before ordering a
  round.
- **Rounds that keep opening new findings mean the STATE MODEL is wrong.** 973 took six. Rounds 3
  and 4 each fixed one finding and opened the next, until round 5 replaced four disagreeing replay
  flags with one state. Order the model change rather than a third guard.
- **A test that was never shown to fail has not been shown to notice anything.** 971 shipped eight
  press tests that all stayed green with both handlers replaced by no-ops. The order that fixed it
  required running that no-op experiment and capturing the output before and after.
- **A worker killed for memory or ceiling has usually COMMITTED.** All six did. Read the worktree
  before assuming loss. The orchestrator may then run the verification and push that commit itself,
  which is delivery rather than editing and saves a launch. Say so plainly in the pull request body,
  and never claim red-first runs that happened only inside the killed session.
- **A refusal with a reason beats a guess.** `#551` round 1 was pointed at `main`, where no Cloud
  system exists at all, and the worker stopped before editing anything rather than inventing a
  config block. Verify such a refusal, then fix the ORDER.
## State

Read live 2026-09-16, late morning. `redesign/main` is `5d684869` and now CONTAINS `main`. `main` is
`adc070bc` and FINAL: the beta release shipped, Orbit 1.3.28 (87) is on the Play open track from run
35044341064, and no pull request is open against `main` except four Dependabot bumps.

**The second effort is DONE.** `.claude/specs/beta-release.md` is a record, not a queue. Its
constraints still bite and are worth reading once.

### Merged to `redesign/main` on 2026-09-16

    979  0472ec34  the drift merge, #556. THE KEYSTONE: redesign/main now contains main, so every
                   orchestrator tool works from a redesign/main checkout again
    963  8972d5af  Wrapped stage 7, the ways in
    981  5e1c2cb2  onboarding stage 1: tour and push prompt deleted on both platforms, the flow cut
                   to three decisions, the completion recap no longer claiming steps that never ran
    989  c178ab92  Progresso rings animate on value change, interrupt cleanly, respect reduced motion
    990  5d684869  Progresso non-default states aligned with the granted canvas

### Open pull requests against `redesign/main`, all fourteen

Every one carries its `## Review harness` block. None is approved yet; the common blocker is
`pullfrog-approval` at the current head.

| PR | ticket | what it is |
|---|---|---|
| 970 | `#558` | `/progress` effort-agnostic plus `--full`. Three P1s answered at `52974481` |
| 983 | `#71` | Perfil stage 10, the last Perfil stage. Suppressions web 142 to 112, mobile 150 to 129 |
| 984 | `#544` | Codex logs move to `.git/orbit-cloud` so a Cloud run stops dropping `error.log` at the root |
| 985 | `#472` | complete a manual goal at target from Progresso detail |
| 986 | `#473` | Progresso goal-detail rows use the canonical `ListRow`; sweep fixed real link navigation |
| 987 | `#480` | Progresso announces goal state and reorder outcomes to assistive technology |
| 988 | `#478` | goal-card interaction feedback; sweep fixed drag lag and a compounded press scale |
| 991 | `#560` | composed UI orders on `redesign/main` now REQUIRE the ui-skills sweep |
| 992 | `#543` | keyboard behaviour for the remaining radio groups |
| 993 | `#545` | habit form fields on the design scales. Suppressions down 45 web and 36 mobile |
| 994 | `#557` | an expired Android session recovers without credentials |
| 995 | `#53` | 14 dead `goals.filters.*` locale entries removed, with regression coverage |
| 996 | `#56` | calendar import spacing on the scale. **`#56` is now finished** |
| 997 | `#373` | the widget empty line split. **Must not merge before `orbit-api` 527 deploys** |

### `orbit-api`, all on `main`

| PR | ticket | what it is |
|---|---|---|
| 527 | `#372` | `EmptyReason` returns `all-done`, `nothing-scheduled` or `null`. Deploys BEFORE UI 997 |
| 521 | `#526` | calendar timezone projection. Recurrence fix at `ee8f3e44`; cross-date events now omit an unsafe source-timezone rule rather than emitting a wrong weekday |
| 520 | `#229` | gating matrix from `PayGateService`. Four fail-open findings closed at `f708d755` |

Also open and NOT this effort's: 526, 525, 510, all Dependabot.

### What the seven ui-skills sweeps found, and why the gate is not paperwork

Four real defects that every other gate passed:

- `983`: `ProBadge` destructured `style: _style` and discarded it, so every caller's spacing was lost.
- `986`: web linked habits navigated through a button, blocking open-in-new-tab and middle-click.
- `988`: goal-card drag lagged the cursor, and drag compounded the press scale into a double shrink.
- `990`: web pill links had no hover or pressed state.

### Closed without merging

**982 (`#76` widget stage 9) was CLOSED, not merged.** Its selector used `habitCount == 0`, which the
API emits for BOTH empty states, so the all-done copy could never show. Once the false selector, a
premature extraction and a test that only re-proved existing behaviour came out, the net diff was two
locale strings nothing referenced. The branch `feature/ticket-76-widget-s9` is kept. The real work
became `#372` (API, PR 527) and `#373` (UI, PR 997).

### Not started

- `#74` and `#34`: Play Console only. See Open questions; the text is written and waiting.
- `#76` beyond stage 9: blocked until 527 deploys and 997 merges.
- `#543`'s supported-route search for Android key events. See Open questions.
- The six Progresso sweeps `#472`, `#473`, `#476`, `#477`, `#478`, `#480` are ALL delivered.

### Worktree and branch debt, read 2026-09-16

Four stashes in `orbit-ui-mobile`, none in `orbit-api`:

    stash@{0}  fix/ticket-416-undeclared-tokens   ticket-416-inherited-killed-run
    stash@{1}  thomasluizon/ticket-352-habit-detail   352 fix-worker residue 2026-08-29
    stash@{2}  thomasluizon/ticket-352-habit-detail   preserve concurrent i18n edit
    stash@{3}  feature/ticket-50-hoje-b   temporary stage 7 drill consolidation

Worktrees holding uncommitted or unpushed work, none of it this session's:

    orb-70-android-widget        dirty 34, no upstream
    ticket-351-primitives        dirty 179, no upstream
    orb65-red-evidence           dirty 4, detached HEAD
    ticket-550-r3-red            dirty 4, detached HEAD
    ticket-335-avisos            clean, 11 commits UNPUSHED
    ticket-174-measure           dirty 1
    ticket-329-progresso-s5b     dirty 2

`ticket-335-avisos` is the one to look at first: a clean tree hiding eleven commits that exist only
on this machine. The two detached HEADs are reachable from no branch and no remote.

A duplicate worktree `ticket-480-a11y-2` exists with no work on it. **Never `git worktree remove
--force` on Windows**: it follows a junction and deletes the target's contents. `rmdir` the junctions
first, then remove without `--force`.

### Tickets

131 open carry `repo:ui`, 65 carry `repo:api`, read 2026-09-16. Re-derive rather than trusting a
count:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 300

Screen tickets: `#53`, `#56` and `#71` are finished pending their pull requests merging. `#63`, `#67`,
`#73`, `#74`, `#76`, `#329` remain, plus `#57` and `#58`.

## Open questions

**None are his.** A `/questions` round on 2026-09-16 put four to him and he answered all four; every
one is recorded on its ticket and summarised below. The only external ending left is the GPT Sol
allowance, which he reset by hand on 2026-09-15 at about 10:20 after it ran out at 08:30. Provider
capacity also refused two worker launches outright on 2026-09-16 with `ERROR: Selected model is at
capacity`; a relaunch minutes later succeeded. If a worker or a Pullfrog run fails for quota or
capacity rather than for code, that is external, and it is reported as external.

### Answered 2026-09-16, and what each one now requires

- **The Play Console listing is NOT to be applied by the session that wrote it.** He said: "dont do
  it now, first make sure all the texts adhere to brand.md and run /humanizer on them. then, DONT DO
  IT NOW. i will call /handoff, and you put the instructions so the next session does it." Both
  passes are done and the final EN and pt-BR text is a comment on `#34`. **The next session applies
  it**, in the browser, and recounts every field against the live console limits first. The BRAND.md
  pass changed two things and they must not be reverted: the heading "MADE FOR EXECUTIVE DYSFUNCTION"
  became "WHEN THE SETUP IS THE WALL", because `## Relationship to marketing` forbids the diagnosis
  as a headline while keeping it as a supporting word, and the opening line now leads with the AI per
  `## Positioning`.
- **The one-row onboarding recap stays.** Shipped in 981. The other three rows claimed steps the
  three-step flow no longer runs.
- **`#529` is unblocked, and the refusal is withdrawn.** He said: "i dont care, the app is in beta,
  and basically only i use it, theres no problem in doing the easy approach, no matter if it will
  break (for now)." Merge the server change on its own, no config flag, no `MinSupportedVersion`
  raise, and record the break in the PR body. **Scoped to beta only**, because it rests entirely on
  "basically only i use it"; a populated Play fleet restores deploy-API-first in full and no future
  ticket may cite this as precedent.
- **Android key events get a supported route or an honest null result.** He chose "find a supported
  route instead" over patching React Native. Do NOT patch a dependency, do NOT flip a React Native
  feature flag application-wide, and do NOT restore the reverted `415320d7`. The three things to
  check, against installed source, are on `#543`. A null result is a correct result.

**Answered on 2026-09-15, previously marked his on `#73`:** whether the support request attaches the
app version. It does, with a visible line saying so, because the picker's "something does not work"
option is useless to support without it. The how is under Decisions.

## Copy, which is yours

Landed 2026-09-14 into 09-15: the deletion warning and its Pro variant,
`profile.freshStart.description`, the support field and send reasons, `shareCard.stats.goalsClosed`,
`wrapped.slides.goals.some`, `wrapped.slides.consistency.summary` and `.even`, the three
`progressScreen.streak.repair*` strings, `profile.support.offlineReason` rewritten to promise only
local retention, and `profile.support.subjectSendingReason`.

Still to write:

1. **The feature guide's rewritten entry sets** for About stage 3.
2. **Onboarding stages 2 to 9** (`#67`), almost entirely copy.
3. **The 32 shortened control labels** for ticket `#74`, across 58 sites in both locales.
4. **The widget's second empty string** for `#76` stage 9. Decided: `Nothing scheduled` and
   `Nada agendado`, with `widget_all_clear` untouched for the everything-done case.
5. **The support version line** for `#73`.
6. `progressScreen.achievements.lockedBody` was REVIEWED and KEPT as "Orbit Pro tracks achievements
   and XP." Do not reopen it.
