# Orbit prod release

History: `## Batch history`, every earlier `## Current state` paragraph, the redesign gate runbook, the answered open questions and the retired rules are in git at the tag `archive/prod-release-spec-full` (`git show archive/prod-release-spec-full:.claude/specs/orbit-prod-release.md`), which keeps the relay branch history reachable after its pull request closes. This spec holds only what is in force. `node tools/check-handoff-size.mjs` keeps it at 40,960 B or less.

## What this is

The goal is a production release with an empty ticket board, except `#33` and the `#2074` measurement, which runs on its own date and never holds the launch. The move to Render and Amazon SES (Batch M) is done, and the redesign is live in production on `main` by an executed written approval: never request another redesign approval. Everything ships now, with no before-launch or after-launch split: Android, web, the landing page, desktop for Mac and Windows, iOS, and Astra with every prompt working.

## Standing rules

Operating facts for workers, CI, merges, releases, consoles and devices are in `.claude/playbooks/operations.md`; hermetic layout facts are in `TESTING.md`. The skills own their procedures (`/orchestrate`, `/sleep`, `/crank`, `/auto-work`, `/handoff`, `/progress`, `/questions`, `/release`, `/android-release`, `/flag`, `/merge-prs`); this list never restates them.

### The run

- Finish the original spec. A blocker becomes the next task. An early stop needs an external cause: allowance exhaustion, machine stop, or the owner's stop request. The run stops only when no other work on the board can be done.
- Every ticket gets done. A ticket is parked only when the run cannot do it at all; recheck each parked blocker at each relay and each `/progress`, and unpark it as soon as the run can act. Only `#33` stays the owner's.
- Choose the complete, correct implementation; speed changes scheduling, never quality. Fix a harness defect in the current run; file a separate ticket only for a real capability gap. Research before you experiment.
- New reports about the shipped product outrank the queue. A defect the owner reports in the live app targets `main`, is fixed at its root, is reproduced red then green on a device or the real path, and ships at once through the production releases. Never repeat a paraphrased report as a verified cause; read the original report.
- Fix every unresolved Sentry issue at its root, then resolve it in Sentry after the carrying release shows no new event.
- The `#315` readiness run is the last before launch: its merged ticket set is the complete launch list, filed once. Run no further `/prod-readiness` or `/audit-*` before launch. A defect found while fixing goes into the open ticket for its area (a worker that files its own ticket gets it folded back and canceled); only a live production defect gets its own ticket.
- Never create orders, phases, rules, gates or approval steps the owner did not give. Build an order in full or not at all.
- Operate every platform through Terraform, CLIs, APIs and MCPs, and do every step yourself that needs no password, 2FA, payment or legal identity choice from the owner. Before you name anything as waiting on the owner, verify it against the code and every installed tool. "Waiting on the owner" means only what the owner personally can do now, never a third party such as Apple.
- Record every infrastructure decision and research result in the brain as it is made.
- The owner is the only active Orbit user before launch: read every fleet signal (PostHog versions, Sentry release counts) as the owner's usage, and a build missing from devices as the owner's phone not updated yet.
- Never create another Claude account and never buy access. When the worker account and the main account both reach their limits, stop new launches until a reset and tell the owner (`orchestrate/SKILL.md` §5.4.1; Batch T changes the account setup).
- Read every worker diff before it counts, for `DESIGN.md` values and gate edits (D95).
- Before every push of a pull request head, one read-only review agent reads the whole diff against the base, and the same push fixes every finding it confirms (owner order, `#2074`). After a fix round, a second agent reads the new commits.
- `#2074` Stop Pullfrog from reviewing heads that later fail CI, and cut a review round to about 15 minutes (owner order, the first priority of the run). `ui#2469` (CI cache), `ui#2486` (the speed build) and `ui#2502` (the Windows runner Clang fix) are merged. Flake candidates for this ticket: `scripts/turbo-inputs.test.mjs` "executes the shared guard again when another consumer task configuration changes" and `e2e/layout/nested-control-fill.spec.ts:101`; a second red of either is root-caused here.
- Every worker tier in `.claude/orchestrator.json` runs `claude-sonnet-5-5` (owner decision). Never move a worker tier to Fable or Opus unless the owner orders it in chat. Heavy build and fix work, review fix rounds included (`compose-prompt.mjs --review-batch`), goes to workers on that account through `tools/launch-worker.mjs`, which reports `usageLimitReached`; past `caps.workerLaunchesPerBranch` pass `--relaunch-reason`. Pre-push reviews, fix-round reviews and device proofs also go to workers (owner order, `#2145`); until `#2145` merges, a review runs as an ordinary worker in its branch worktree with a hand-written review order, `--measurement` and a relaunch reason, and counts only with `commitsSinceLaunch` 0 and `treeClean` true.
- The coordinator relays at a soft 350000 tokens of context, at its first quiet point, with a 400000 hard ceiling (owner decision, measured in `#2085`, live on `main` since `ui#2395` merged).
- Speed with quality (owner order, the newest comment on `#2074`): the code is right the first time, and a pull request never spends a day in review rounds. The local review before a push reads the whole diff as Pullfrog does, and every confirmed defect is BLOCKING (wrong behaviour, a missed edge case, a test that passes with its guard removed, a comment that contradicts the code, an unused export); a NOTE is only taste. A fix round fixes every instance of each class in the diff, each with a test proven red with its guard removed. A defect class that comes from guessing at free text gets a structured input or a deletion, never one more pattern. A false statement in a pull request body is fixed by the coordinator. A worker runs the focused tests of its change, and CI runs the full suites.
- Crank is off and `/sleep` stays on (owner order): the main account's weekly tokens must last until its weekly reset. At most 3 workers run at once, reviews included, and open pull requests reach the merge bar before a new ticket starts. Pullfrog runs on the main account token. While the worker account is at its weekly limit, workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` unset at launch).
- Run tooling (Batch T and Batch 0b) is the priority of the run (owner order). Never hold ready work for an ordering preference: a pull request at the merge bar merges at once (owner order, `#2171`); new launches follow the 3-worker pace.
- `/progress` reports only what merged and what is built but not merged, in product terms, with no pull request, ticket or version numbers; `/progress --remaining` reports the open board the same way (owner order, `#2170`).

### The owner

- Answer each owner message first, in the owner's language (English or pt-BR), before other run work, and give each order a ticket or a rescope of its existing ticket before the turn ends. A command the owner types during an unattended run is answered before any other work.
- Decide every question that has a clearly better answer (`.claude/rules/core.md` rule 7, `/questions`). Pricing, positioning, brand direction and genuine product choices stay the owner's. A token added only to meet an accessibility floor is the run's decision. Written authorization covers the requested scope; ask again only if scope or inputs change.
- When the owner says a step is done, close on it and never re-ask how. Never list or remind the owner of the `#33` videos. When the owner asks "why", answer with evidence from the source and correct any earlier claim it contradicts.
- Write and approve every piece of user-facing copy in both locales: write it against `BRAND.md`, the brain decisions and `/humanizer`, and approve it with `/second-opinion` framed as a claimed copy defect (so `DISAGREE` means approved), with the verdict posted on the pull request before merge. Never hold copy for the owner. pt-BR reads as a Brazilian product writer wrote it; a word-for-word translation is a defect, including API pushes and e-mails. Add no visible string out of place.
- Orbit has no ads; Orbit Pro is the only monetization. Ad code is dead code to delete.
- Orbit keeps its Instagram and X accounts on `contact@useorbit.org` and posts there only for new features and the launch; the focus is the founder (dev) accounts, where the owner posts by hand and the run drafts the posts (owner decision). The founder accounts use the founder e-mail the owner set (done; never ask again). The other brand profiles are LinkedIn, Facebook, Discord and the Workspace mailbox.

### Product rules no other document holds

- General habits never offer Skip; dated habits keep Skip (`#1920`). General items are undated one-time tasks under Task date choices; Habit frequency offers only Every and Times per, without the repeating General hint. The habit form rules are in `design/habit-form-surfaces.md`.
- Calendário is one centred column (the month grid on top, the selected day below it, the view selector under the Orbit line row (`#2122`), 24px card padding). The Perfil Suporte row opens the support form. Sobre carries no internal naming note.
- Owner removals that `tools/feature-parity-rules.json` cites by exact text: Perfil is grouped into sub-menus, and the old duplicate Preferências, Avançado and Recursos de IA pages stay gone as separate copies. A floating control no drawing has (the web back-to-top button) is deleted, not restyled. `#1422`: Remove the Hoje jump pill; the centred date label returns to today across the app.
- The Astra button exists only in the compact shell (Android and web below 1024), replaces the Hoje composer, and sits fixed directly above the create habit button, never dragged or moved (`#2042`, `#2077`).
- Every input is simple first (levels, not a wall of options), keeps correct spacing including hover spacing, and asks human questions instead of system labels. A set of options never wraps onto a second line, and every no-wrap rule has a test that fails the pull request.
- The app feels like a native mobile app at compact widths: less on each screen, secondary content in sheets, menus and drawers, and breathing room around every group (brain ADR `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`). `DESIGN.md` is wrong wherever it permits the opposite. Where a control sits is the run's decision.
- Every screen works on every device size, the smallest first: the owner's iPhone is an SE 2020 (375 x 667 points). An iOS proof runs on an SE-size simulator first, then a large iPhone, with the keyboard closed and open.
- Hovering a nested control never keeps its parent card's hover active (`#2057`).
- No surface draws a spinner: a loading state is a skeleton, and a control that waits keeps its label and takes the skeleton look (owner order, `#2120`).
- Keep locale out of auth and deep-link URLs. Gate both listing and revoking API keys behind the emailed code.
- The landing page follows the long-scroll reference `lp.pierre.finance/lp/converse` in Orbit's design, never a description beside a phone mockup. The mascot rebrand is a tone change with motion, never an icon swap (owner order, the `#2126` work order): Orbit leads the page, the live Orbit moves from page load, and each section has its own entrance and scroll motion; reduced motion keeps a still version. The phone never scrolls on its own and draws every component at the app's logical size.

### Platforms and releases

- Route all work to `main` in every repository; `redesign/main` is retired.
- Nothing deploys on a merge or a push; `/release` and `/android-release` own every deploy. Android fixes merged to `main` ship to the Open track, Orbit's main Android channel. The production track stays empty until the owner orders a launch.
- iOS and Android are always at the same release stage (owner rule). While Android is on the Play Open track, iOS is in TestFlight beta. Orbit goes to everyone on the App Store only when the owner orders the Android production release, in the same order: an App Review approval never starts a release and never needs a question about its date.
- One mobile release ships Android and iOS at the same `app_version` from the same `main` commit. Each store keeps its own build counter: Android `versionCode`, iOS `CFBundleVersion`. Release Android first, then iOS at the Android version. Release one platform alone only for a defect specific to that platform, and pass `platform_only_reason` so the run records why. A platform-only release uses the `nextVersion` of `mobile-version-pair.js plan`, above the newest version of both platforms, so one version never names two code states. Both release workflows pass the commit they build to `apps/mobile/scripts/mobile-version-pair.js check`, which refuses a version that breaks this rule. A version that either platform already carries takes only the commit of its newest record, and a record without a commit refuses its version. `.claude/skills/android-release/SKILL.md` and `.claude/skills/ios-release/SKILL.md` own the procedure.
- The beta fleet permits a simpler deploy order while the owner is the only user, including relaxing deploy-API-first. Keep the full code contract.
- The live Astra eval gate (`#315`) runs once, after every other ticket that changes the code is done and the `#1916` call-cost fix is live, with one attempt per case and failing cases rerun once. Its eval spend ceiling is 2 USD for that run and returns to 0.50 USD a day after it; fix rounds replay recorded provider responses offline. No paid-key probe runs without a written cost estimate. The iOS app does not hold the gate.

## The order

Reconcile the open board with these batches before each handoff. Place each new ticket exactly once, as one bullet, and give it only its title and its current next step: the ticket body and its comments hold the history. A batch completes before the next begins; a ticket that waits on a named condition does not hold its batch. Within a batch, use dependency order and drive open pull requests first.

### Batch T: the harness token diet (owner order, priority 1)

No diet ticket holds admission: `#2071` is closed; `#2074` merged in the API, and its UI and landing pull requests plus the measurement are open. Brain ADR D149 holds the measurements and the account plan.

- `#2074` Stop Pullfrog from reviewing heads that later fail CI, and cut a review round to about 15 minutes (owner order, the first priority of the run). `ui#2469`, `ui#2486` and `ui#2502` are merged. Next: the quality build of the newest owner comment (worktree `ticket-2074-review-quality`, no commit yet). `Mobile Android Build` on `main` failed once on a Maven Central 429 (rerun started): a second one is root-caused here. Flake candidates for this ticket: `scripts/turbo-inputs.test.mjs` "executes the shared guard again when another consumer task configuration changes" and `e2e/layout/nested-control-fill.spec.ts:101`; a second red of either is root-caused here.
- `#2152` Keep all run state on GitHub so any computer can continue the run, and stop carrying the scratchpad (owner order, the next priority after `#2074`). Next: `ui#2488` is merged. The coordinator runs the one-time migration (its pull request body, `## Manual steps`) before the next intake cycle, then closes the ticket.
- `#2170` Make /progress report only what got merged and what is built, in product terms, and add /progress --remaining. Next: `ui#2493` is pushed (a stacked row skips the required-check read), Pullfrog asked: merge at the bar.
- `#2173` Relay without draining the workers (workers detached with a completion file; the successor watches them). Next: `ui#2498` is pushed; Pullfrog found no code defect and approves after the proofs. Merge condition: the live relay proofs A and B (scratchpad `body-2498-main1.md` lines 35 to 55); they need the branch code in the orchestrating checkout and a real relay.
### Batch R: owner review findings

A finding from an owner review or a rendered sweep that shows broken behaviour lands here.

- `#2177` Show one notification delete toast at a time instead of a stack, web and mobile (owner order). Next: `ui#2504` (a failed delete that cannot own the toast leaves the store): one design round for its local review (S `design-2504-r4.md`), push, merge at the bar, then the web release and the Android Open and TestFlight pair.

### Batch 0b: the harness and the standing syncs

The gates every later batch runs through. Re-read each ticket against the tree before you build it.

- `#2149` Make auto-work read every open pull request (Dependabot and every other author) and every code scanning, secret scanning and Dependabot alert in the three repositories, and fix them (owner order). Next: `ui#2475` Pullfrog asked for two step 8 end states (a code scanning alert judged by its own category's scan; a secret scanning alert has no auto close): one design round (S `design-2475-s6y.md`), then merge at the bar. The `picomatch` advisory GHSA-fc5q-39xc-vjpf is withdrawn, so no lockfile pull request is owed. Until ui#2475 merges, read every open pull request and alert by hand each cycle (S `prs-alerts.mjs`). A Dependabot pull request merges by itself after its Pullfrog approval and moves `main`.
- `#2145` Run the pre-push reviews and the device proofs as workers on the worker account (owner order). Next: `ui#2476` is pushed (`main` merged), Pullfrog asked: merge at the bar.
- `#2143` Delete stale files in an unattended run without asking the owner (owner order: never offer, delete with the node tool so nothing prompts). Next: `ui#2483` (`main` merged): the Pullfrog round (one thread: the new exit 4 misses standing tickets), review, push, merge at the bar.


Worker hard ceiling: a long build passes `--hard-ceiling-minutes 150` to `tools/launch-worker.mjs`. A second red of `android-release-certificate.test.ts:39` (`beforeAll`) gives that hook its own time limit; a third hang of "Run median TBT and script budget gates" gives that step its own time limit.

### Batch 0c: live defects in the shipped product, on `main`

An Android fix is followed by an Android Open release and an iOS TestFlight build at the same version, unless the defect is specific to Android.


- `#2156` Answer a malformed form POST to a page with 400, not a 500 (Sentry ORBIT-WEB-1H, 2 production events). Next: `ui#2485` is merged (`2263a8b67`); the web release of `2263a8b67` is in staging. Release production, resolve the Sentry issue after the release shows no new event, then close.
- `#2127` Stop the assistant from asking the opposite of a choice the person already made (live defect, owner order). Next: `api#1111` is merged and live in production (`1d2a826b8`). The staging capture passed 4 of 5 (run 5 replied with a log-only list card, the `#2129` class); per the plan no old-path fix round runs: the case is a must-pass case of `#2135`. Close when the new path passes it.
- `#2129` Make the assistant do the job from a short request, without the person teaching it each step (live defect, owner order; the class of `#2127`; this ticket owns the agreed plan and its build). Next: build the plan step by step (scratchpad `orbit-ai-build-steps.md`, `best-impl-orbit-ai-final.md`; the newest owner comment orders the lanes): 2-api `#2154`, 3a `#2155`, 3b `#2161`, 4a `#2162`, 4b `#2163`, 5-api `#2159`, 6-api `#2160`, 5-ui `#2164`, 6-ui `#2165`, step 7 `#2166` to `#2169`. The eval ceiling of this build is 1.20 USD a day; rows 3a, 3b and 4 gate at k=1; gate rules A1 and B1 are decided (ticket comment). The crisis support word boundaries are a separate pull request after `#2159`. The rate criterion of `core/merge.mjs:133` needs a tolerance decision before the first row that compares a rate.
- `#2154` Give the assistant short record references so a miscopied record ID still reaches the right record (Orbit AI step 2-api). Next: `api#1121` is green and approved at `9e4b6486f`. Its gate is the full core set.
- `#2155` Make each preview approve on the first try, in English and Portuguese, from every route that shows one (Orbit AI step 3a). Next: `api#1120` is green and approved at `d7596be4f`, behind `main`. Its merge gate is the core set at k=1: the gate tool is on `main` (`ui#2487`); it needs the grader (`ui#2480`) and the baseline of `#2135`.
- `#2135` Make the Astra eval a real gate: client path, outcome grader, core set at pass^3 (Orbit AI step 1 of `#2129`). Next: the baseline is PARTIAL with 17 cases left (S `result-2135-baseline.md`). `ui#2480` (the grader): a design round answers Pullfrog (a both-halves card question reads as the half asked first, from live-recorded reads; a failed card read gives no evidence): review, push, merge at the bar. After it merges: one more baseline window (model: S `order-2135-baseline-r5.md`).
- `#2159` Let the model alone decide when to act and when to ask, behind a per-account flag (Orbit AI step 5-api). Next: `api#1124` is green and approved at `925ff6d49`. Merge order: `#2155`, `#2154`, then this.
- `#2160` Prepare a whole request as one complete preview from one typed change list, behind the flag (Orbit AI step 6-api). Next: `api#1126` is pushed at `850fb2ad3` (round 4, notes filed), stacked on the api#1124 branch, Pullfrog asked. The provider probe passed for both shapes, so check 7 chooses: the core set runs on each shape, then a launch removes the other shape and adds the pinned schema baseline. Retarget it to `main` when api#1124 merges.
- `#2161` Show which record a preview changes when several records share one title, on each client and each route (Orbit AI step 3b). Next: `api#1128` is open at `077323076`, stacked on the api#1120 branch: the whole review, CI, Pullfrog. It gates at k=1, and the coordinator approves its eight strings before the merge.
- `#2162` Let each habit change join one approval, with effects that cannot break the set or stay after a rollback (Orbit AI step 4a). Next: `api#1125` is pushed at `02185b4a0`, stacked on the api#1120 branch (fix round 1, notes filed, green): ask Pullfrog. Before the merge, confirm in the CI log that `HabitEffectPostgresTests` ran on PostgreSQL. Retarget it to `main` when api#1120 merges. It gates at k=1.
- `#2163` Let each goal, tag, checklist template, profile and notification change join one approval (Orbit AI step 4b). Next: `api#1127` is open at `f26ff95a6`, stacked on the api#1125 branch; it also stops the model call inside the idempotency transaction of the keyed MCP route (work order comment): the whole review, CI, Pullfrog.
- `#2164` Export the flag-off and the flag-on tool catalogs and name the path of an eval run (Orbit AI step 5-ui). Next: `ui#2491` at `8ba7a99db`: Pullfrog found no code defect and fails only on the merge-order gate below. Before the merge, regenerate the catalog at the API `main` commit that holds `#2159`.
- `#2165` Follow the typed change list in the eval catalog exporter and in the trace readers (Orbit AI step 6-ui). Next: `ui#2494` is pushed at `ed2c469eb` (round 2 with the ui#2491 base merge), stacked on the ui#2491 branch, Pullfrog asked.
- `#2166` Grade the first 103 cases of the launch corpus by outcome and write the family table (Orbit AI step 7, part 1 of 4). Next: `ui#2492` round 5 (one thread, the `TESTING.md` and `astra-eval` text, and the merge of the ui#2480 head) is running, stacked on the ui#2480 branch: review, push, Pullfrog.
- `#2167` Grade the lifecycle families of the launch corpus by outcome (step 7, part 2). Next: `ui#2500` (stacked on the ui#2492 branch) is pushed at `e3372dcde` with its base merge, Pullfrog asked; merge the ui#2492 base again after its round 5.
- `#2168` Grade the offer families of the launch corpus by outcome (step 7, part 3). Next: `ui#2501` (stacked on the ui#2492 branch) is pushed at `725176ad2` (base merge plus the fix that sends each case's offers setting), Pullfrog asked; merge the ui#2492 base again after its round 5.
- `#2169` Add corpus cases for each family with its own code and delete the tool-name grade (step 7, part 4). Next: after `#2167` and `#2168`; its live run needs `#2160`, `#2164` and `#2165`.

### Batch 2a: the API contracts the UI waits on

API first, deploy, then the UI half in Batch 2b.

No open ticket.

### Batch 2b: every other ticket that changes what a person sees

Includes the packaging milestone ("Packaging: caps, quotas and tiers") and the PostHog work.

- `#2176` Apply the unslop-ui skill to the whole app, on web and mobile in both languages (owner order). Next: after `#2122` merges (the screens it reads), one worker vendors the pinned skill into `.claude/skills/unslop-ui/`, then runs its full procedure with `--surface` under the `DESIGN.md` D42 ladder.

### Batch 3: the landing page and the Play listing

No open ticket.


### Batch 5: Astra

Milestone "562 Astra" and every Astra or MCP tool ticket. After every Astra ticket is settled and deployed to staging, run the full real-call and rendered sweep with tool evidence, approved mutations and independent persisted readback, on phone, desktop and Android, in both languages.

### Batch 6: security, correctness and the deletions

A deletion ships as a deprecation, then a code removal, then a table drop, each in its own release. A DTO contraction waits on the `MinSupportedVersion` raise being live in the Play fleet. Accept the SonarCloud `S1133` issues a deprecation raises with a comment naming the removal part.

No open ticket.

### Batch M: the Orbit mascot rebrand (owner order: started, in ticket order)
Each ticket is its body plus its work-order comments: one pull request each, never split, except `#2122`, which merges in its seven parts. `#2126` starts now and `#2125` starts after `#2144` (owner order; the other tickets keep the ticket order). The API releases first.
- `#2146` Give the Orbit conversation entry a background and make the Orbit in the Hoje summary line move (owner order on the live app: it targets `main` and ships at once). `ui#2484` is merged (`e8fa116f9`). Next: ticket item 5 (the rendered check on Android and web at 375, light and dark, with screenshots) as one device proof worker, then the web release and the Android Open plus TestFlight pair, then close.
- `#2121` Build the guided flows: create, edit, goals, tags, onboarding, sign-in and Perfil. Next: `ui#2451` (`main` merged): one Pullfrog round (two threads), then merge at the bar. Its `Lint` job was cancelled twice at its 5 minute limit with no lint error (evidence on `#2074`).
- `#2122` Move every destination to the Orbit logic: Hoje, conversation, Calendário, Progresso and the rest. Next: `ui#2453` (stacked on `#2121`) is pushed at `05ef8007a` (round f2 with the base merge), Pullfrog asked. `#2158` (keep the selection ring on a clicked Calendário day while the selection moves) is folded in as a ticket comment.
- `#2123` Finish the rebrand in the app: rename, guard, remove the old paths and clean the source. Next: after `#2122`.
- `#2124` Finish the rebrand in the API: flag row, brand files and a cleanup of every file. Next: after `#2123`.
- `#2125` Change Orbit outside the app: stores, external logos, thomas-brain and the vault. Next: Parts 1 and 2 are merged (`thomasluizon/thomas-brain#13`, `96e7fcb86`; that repository has no Pullfrog and no branch protection); the seven review notes are on the ticket. Part 5 (the vault) is complete (`thomasluizon/brain#2`, `8fd185e`; its five open review notes are on the ticket). Parts 3 and 4 (the store pages, the outside logos with Sentry) are coordinator work after `#2123`. The `thomas-brain` listing files equal the live Play text; the store rewrite states the Pro allowance as 250 a week (ticket comment).
- `#2126` Rebuild the landing page around Orbit and clean every file. Next: `landing#137` is pushed at `1b83901` (round 4: focus ends a scroll arrival, each guide line names Orbit as its speaker), its `Build` is green, Pullfrog asked. `#2157` (the copy register check) is folded in as a ticket comment. Before merge: read the production `AppConfig` row `FreeAiMessagesPerDay` (the page states 5 a day; the Render MCP has no workspace selected, so use another route) and run a rendered check. Its release needs the new JSON-LD hash in `orbit-api/infra/landing-csp.tf` first. `og-image.png` stays for `#2125`. The owner's tone-change work order (ticket comment) binds it.

### Batch 7: the production readiness run

- `#315` Run `/prod-readiness` once the board is clear. Next: Android Open 1.3.148 or later from a `main` commit whose push runs passed, then the live Astra gate window once the other tickets that change the code are done. First regenerate `evals/astra/catalog.yaml` at the evaluated API commit; a card question the grader cannot read is a grader limit.
- `#33` Record the 7 demo clips and 2 landing videos. Next: after every ticket that changes code (the `#2074` measurement is independent), the run writes the scripts, the owner records, the run edits every video to the best result, and the editing method becomes thomas-brain skills. Blocked by `#2123` and `#2147`.
- `#2147` Remake every store image with the Orbit mascot (owner order: at the end, after every other ticket, before the videos). Next: blocked by every open code ticket; it finishes before `#33`.

### Batch 8: new platforms, iOS first, then desktop

- `#1561` Ship Orbit for iPhone and iPad to TestFlight, with push and the home-screen widget, and the production app on the owner's iPhone (owner order). The iPhone app is a launch requirement. Next: the real-device checks once the owner installs it, and the profiling step for Sentry `ORBIT-MOBILE-R` (a 3 s hang on the App Review iPhone; ticket comment of 12 November 2026). The iPad findings in the ticket comments (unread badge font scale, "Widget do Android" label) stay in scope. App Review approved iOS 1.3.152 (app store version `f093e30c-9704-4ff5-bf4a-e858784c0ecc`, `PENDING_DEVELOPER_RELEASE`, `MANUAL`): it waits for the owner's Android launch order. iOS 1.3.157 (7) is in the outside group `Orbit beta` and waits for Beta App Review. Add each later build with scratchpad `asc-external-group.mjs group <build id>`, then `submit <build id>`. `ui#2489` (App Store Connect retry) is merged. `ui#2496` (the iPad sign-in field, Sentry `ORBIT-MOBILE-Y`) is merged: the mobile pair carries it; resolve the Sentry issue after the carrying build shows no new event. Scratchpad tools: `asc-api.mjs` (the team key of the iOS signing folder in the home directory), `asc-pro.sh on|off`.
- `#1563` Show the App Store badge and the Mac and Windows downloads on the landing page. Next: `landing#127` is live in production landing `7fb212c42`; the App Store card follows the App Store listing (`#1561`).

## How the work runs

Use `/sleep` or `/auto-work` for unattended work and `/orchestrate` for one ticket at a time. Pullfrog reviews each pull request. `/handoff` replaces the one `## Current state` paragraph in this spec and overwrites `.claude/handoffs/NEXT.md`; it never appends. The session chain ledger lives untracked at .git/orbit-session-chain.json.

## Decision pointers

Open these brain notes through the Obsidian MCP (`mcp__obsidian__obsidian_list_notes`, `mcp__obsidian__obsidian_get_note`, `mcp__obsidian__obsidian_search_notes`); `cat` and `ls` miss the frontmatter and backlinks that record which decision superseded which. They live under `2 Areas/20-29 Orbit Engineering/Decisions/`. A filename is a lead: list the directory and copy the names that come back.

- D149, the harness token diet and the one-account plan (list the directory for its name).
- `The Orbit desktop app is a Tauri 2 shell around the deployed web app.md` (D148)
- `Astra runs on gpt-6-luna at low effort with a per-user daily AI ceiling.md` (D147)
- `Feature flags live in the Orbit database and the agent changes them, and the redesign ships as a version flag.md` (D145)
- `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`
- `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`
- `Pro is Astra without the daily ceiling, and goals leave the paywall.md` and `Price Orbit at 9.99 USD and gate depth never the core loop.md`
- `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`
- `Every Astra write shows a preview the person approves first.md`
- `Astra opens full screen and web reaches it from a sidebar row.md`
- `Onboarding shows once per install and once per new account, never on sign-out.md`
- `An idempotency key for an AI tool retry binds to call position never to model-generated arguments.md` and `An AI tool action reuses the app's own command never a raw repository call.md`
- `A shared timeless-text gate blocks a machine path an owner name and a dated anecdote across all three repos.md`
- `Gate new ticket work when shared CI and review capacity is full.md` and `An unattended run caps its own CI demand in code and waits on CI through a registered wake source.md`
- `A written instruction is the authorization ship on it without asking again.md`
- `Reproduce a device bug on the exact shipped build before calling it fixed.md`
- `Put rn-primitives and Radix Primitives under Orbit's own styling instead of adopting a universal UI kit.md`
- `The Orbit workflow decision register (D1 to D42).md` for the older numbered decisions.

## Constraints

Code facts that no gate or owner document states:

- `apps/mobile/android/` is Expo prebuild output: native fixes belong in app config or a config plugin. Mobile ICU syntax treats an apostrophe before `{`, `}` or `#` as a quote: double it, and test mobile strings through the app's i18n instance.
- Hermes ships no `Intl.ListFormat` and other newer `Intl` constructors, while Vitest on Node has full ICU: shared code that constructs one passes every unit test and throws on the device. Mobile loads polyfills from `apps/mobile/index.js` before `expo-router/entry`.
- An Android accessibility node with zero opacity or fully off-screen is ignored: announce through `AccessibilityInfo.announceForAccessibility`. Android's key map emits arrow keys but no Home or End. Expo SAF copy deletes an existing destination document. Android Auto Backup restores only SharedPreferences minus SecureStore, so AsyncStorage state such as the onboarding flag is never restored.
- expo-router resolves a bare `/` to the first group index whatever `Stack.Protected` hides, and a replace to a guarded-out route is a silent no-op: navigate from an unguarded screen to an explicit destination.
- A Server Action strips thrown errors to `digest`: return serializable `ActionResult` values. A React inline style that sets a shorthand and then a longhand to `undefined` loses half the shorthand on the client only: set both longhands.
- `GET /api/config` is `[Authorize]`: a signed-out client gets 401 and falls back to `DEFAULT_CONFIG`. Retrospective access comes from the API setting, never hard-coded Pro access. `useCalendarEvents` is a bounded manual-import feed; the events API reports the event timezone.
- Account deletion deactivates with a bounded grace period and sign-in cancels it: never claim deletion has no recovery. A streak freeze is banked automatically and spent by hand; `RepairableGapDates` does not depend on the freeze bank.
- The Orbit MCP `bulk_log_habits` tool takes no idempotency key, so a production replay check cannot go through it.
- `tools/check-i18n-usage.mjs` resolves only literal translation keys.
- Web and Android mirror files read as duplication to Sonar: list each mirror pair in `sonar.cpd.exclusions`. Shared logic belongs in a React-free core in `packages/shared`; each app keeps only its React wiring.


## Current state

UI `main` is `d7538f743` (ui#2488, the run state on GitHub, merged; its one-time migration is next; `#2175` and `#2178` closed), API `main` `70c66e7be`, landing `main` `20c1b0a90`. Production: API `70c66e7be`, web `2263a8b67` (ORBIT-WEB-1H is watched until the run state `intake.sentry` `resolveAfter`, then resolved and `#2156` closed when no newer event exists), landing `20c1b0a90`; Android Open and TestFlight 1.3.157. The next web release carries ui#2499, ui#2503 and `#2177` (ui#2504); an Android Open and TestFlight pair follows for `#2175` and `#2177`. Main caps review fix rounds at 3 per branch (`tools/fix-rounds.mjs`); one more round needs a new written design change (`launch-worker.mjs --design-change <file>`), and a review round fixes only BLOCKING findings and files the rest (`review-and-audit.md` rule 14). The eval tests under `evals/astra` run in no CI job: run `core-cli.test.mjs` locally with `ORBIT_WORKER_CLAUDE_CONFIG_DIR` empty before an eval pull request is pushed. A calibration-only conflict after a `main` merge is resolved by taking the `main` side and running `node tools/reseed-calibration.mjs`. A worker cannot start a browser, a dev server or an emulator: the web part of a rendered proof is the coordinator's through `claude-in-chrome`, and the device part waits for the `--proof` mode of ui#2476 (`#2145`). The merge bar keeps behind 0: an approved pull request that falls behind merges `main`, is pushed and waits for a fresh approval. Assistant pull requests (api#1120, api#1121, api#1124 to api#1128) are green and approved and wait on the core set gate of `#2135`. The session chain ledger lives untracked at .git/orbit-session-chain.json.
## Open questions

No owner question is open. When Pullfrog's token reaches its limit, run S `token-swap.py`, give the owner the link of S `token-swap-url.txt` and write the code he pastes to S `token-swap-code.txt`. A failed `@pullfrog review` request still counts as the head's request for `tools/list-bot-threads.mjs`: post a new request comment by hand. The Apple and Windows logos on the landing downloads panel are a settled owner order (`#2090`): a review objection to them on trademark grounds gets the standing reply and is never raised with the owner again. A step for the owner names the literal value (the code, the number, the field label on the screen), and the run does the step itself first when an API can. The owner signed in to App Store Connect in Chrome. The Pullfrog workflow secret `CLAUDE_CODE_OAUTH_TOKEN` holds a fresh main account token in all three repositories (scratchpad `token-swap.py`, owner Authorize click). Owner-only steps, never reminded: cancel the second Claude account on 4 December 2026; open TestFlight for the `#1561` device checks; record the `#33` videos when the run asks.

Settled decisions that still bind:

- No Render plan upgrade for the production API, and staging stays on the free plan; never ask again.
- No Mac App Store and no Windows code-signing certificate; the Apple Developer Program only.
- No CircleCI token rotation and no Render MCP key rotation. Astra gets no email connection.
- Gmail web in `claude-in-chrome` reaches the owner's Orbit account mailbox; the Gmail MCP stays on the work mailbox.
- An OAuth Authorize click on the owner's own account is his: give him the link and take the code he pastes.
- The conversation entry is the live Orbit at 48 on a solid circle background (owner order, `#2146`), in a 60 press target above the create button, and the Orbit of the Hoje summary line moves with it, named `Falar com o Orbit` / `Talk to Orbit` and never "the Orbit button"; wide web keeps the labeled sidebar row. The owner comments on `#2120` and `#2122` hold the detail.
- Each Claude account has one weekly reset: use it at 100% (on the main account at about 98%, before the coordinator stops) when about 3 days or more remain before the normal reset (claude.ai, Settings, Usage, "Redefinição semanal").
