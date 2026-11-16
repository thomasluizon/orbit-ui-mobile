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
- `#2074` Stop Pullfrog from reviewing heads that later fail CI, and cut a review round to about 15 minutes (owner order, the first priority of the run); its next step is the Batch T bullet.
- The worker account rotates its model (owner order): every `claude` tier in `.claude/orchestrator.json` runs `claude-fable-5-2` until that account reaches its weekly limit; the run tells the owner at once and he resets it; then every tier runs `claude-opus-5-5` until the limit and the run tells him again; when his resets for that account end, the tiers return to `claude-sonnet-5-5`. Heavy build and fix work, review fix rounds included (`compose-prompt.mjs --review-batch`), goes to workers on that account through `tools/launch-worker.mjs`, which reports `usageLimitReached`; past `caps.workerLaunchesPerBranch` pass `--relaunch-reason`. In-session subagents only read and review.
- The coordinator relays at a soft 350000 tokens of context, at its first quiet point, with a 400000 hard ceiling (owner decision, measured in `#2085`, live on `main` since `ui#2395` merged).

### The owner

- Answer each owner message first, in the owner's language (English or pt-BR), before other run work, and give each order a ticket or a rescope of its existing ticket before the turn ends. A command the owner types during an unattended run is answered before any other work.
- Decide every question that has a clearly better answer (`.claude/rules/core.md` rule 7, `/questions`). Pricing, positioning, brand direction and genuine product choices stay the owner's. A token added only to meet an accessibility floor is the run's decision. Written authorization covers the requested scope; ask again only if scope or inputs change.
- When the owner says a step is done, close on it and never re-ask how. Never list or remind the owner of the `#33` videos. When the owner asks "why", answer with evidence from the source and correct any earlier claim it contradicts.
- Write and approve every piece of user-facing copy in both locales: write it against `BRAND.md`, the brain decisions and `/humanizer`, and approve it with `/second-opinion` framed as a claimed copy defect (so `DISAGREE` means approved), with the verdict posted on the pull request before merge. Never hold copy for the owner. pt-BR reads as a Brazilian product writer wrote it; a word-for-word translation is a defect, including API pushes and e-mails. Add no visible string out of place.
- Orbit has no ads; Orbit Pro is the only monetization. Ad code is dead code to delete.
- Orbit has no X brand account and gets none. The brand profiles are LinkedIn, Instagram `@useorbitapp`, Facebook, Discord and the Workspace mailbox. The founder account is the owner's to create and post to by hand; the run drafts its posts.

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
- The landing page follows the long-scroll reference `lp.pierre.finance/lp/converse` in Orbit's design with Astra as the focus, never a description beside a phone mockup. Nothing on it changes without a visitor action, except the hero side cards, which float from page load and tilt toward a fine pointer (stopped under reduced motion and off-screen); the phone does not float, never scrolls on its own, and draws every component at the app's logical size.

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

- `#2074` Stop Pullfrog from reviewing heads that later fail CI, and cut a review round to about 15 minutes (owner order, the first priority of the run). Measured on 5 pushes: push to Pullfrog verdict fell from a 41 minute median to 11, CI wall time from 32 to 18; the layout shards set the floor. Next: ui#2469 local `f01177b84` (round 15 `3b8f8b843`: one exact reviewed path per saver class, whole-path compare; clean merge of `main` `f58a889af`). Its review (S `review-2469-r15-local.md`) found 2 defects: launch round 16 as the class fix (default-deny on restores: every restore of a saved path is the one restore the rule names, exact key, probes G1 and G2; the compiler cache save bounds the whole saved directory: a delete of every file ccache does not age out, or a save of only the object tree, and an allow list for the job env and run text in place of the `MOVES_CCACHE_DIRECTORY` deny pattern, probes G3 to G5; correct `TESTING.md:273`, body line 22, `reply-2469-zTd7.md` line 15). Then one review, body S `body-2469-r15.md` plus the r15 and r16 reports, resolve `PRRT_kwDOR5Siws63zTd7` and `PRRT_kwDOR5Siws63zTeA`, push, merge, then delete the four orphaned npm and NDK cache entries once. Comment lint round 14 is committed: UI `fix/ticket-2074-jsdoc-type-tags` local `bf0131224` (on merge `e122385d1`), landing#136 local `e0cb23a`: the rule parses the real file once and keeps a block whose start is a TypeScript JSDoc node with a named tag (S `fix-136-r14-result.md`). Next: one review against S `review-136-r13-local.md` and its column fuzz (confirm `node.jsDoc` against the installed `typescript` source of both repositories, UI ^6 and landing ^5.9, and the position with a BOM, a shebang and CRLF), landing body S `body-136-r5.md`, resolve `PRRT_kwDORqm3lM633iTX` (S `reply-136-3iTX.md`), push landing, push the UI branch and open its pull request from S `body-ui-jsdoc-r2.md`. Local pre-push checks missed React Doctor on ui#2468: make the local check list cover every Guards step.
### Batch R: owner review findings

A finding from an owner review or a rendered sweep that shows broken behaviour lands here.

No open ticket.

### Batch 0b: the harness and the standing syncs

The gates every later batch runs through. Re-read each ticket against the tree before you build it.

- `#2137` Never let an unattended run stop on an approval prompt or wait without limit on a subagent (owner order, live harness defect). Next: `ui#2464` local `035c4e5c5` (round 16 on merge `88d0f26e0` of `main` `f58a889af`: canonical push URL forms only, `HOME`, `XDG_*`, `PWD` and the Windows home names refused, `env -i` and `-u` refused, `distinct` by map content, `git merge-tree` allowed; S `fix-2464-r16-result.md`). Diff read. One review against S `review-2464-r15-local.md` and its `rv-2464-r15` probes, body S `body-2464-r16.md`, resolve the four FY threads (S `reply-2464-FYx.md`, `-FYz.md`, `-FY5.md`, `-FY9.md`), push, merge. Then the api and landing hook ports.
- `#2139` Run every shell guard on a command that the Monitor tool runs (filed by an agent). Next: built inside `ui#2464`; when it merges, post scratchpad `comment-2139.md` with `tools/comment-ticket.mjs` and close the ticket as folded into `#2137`.
- `#2143` Delete stale files in an unattended run without asking the owner (owner order: never offer, delete with the node tool so nothing prompts). Next: worktree `ticket-2143-stale-auto-delete` (branch `fix/ticket-2143-stale-auto-delete` from `main`, `npm ci` done) and S `order-2143-r1.md` are ready; its launch was refused by the relay drain. Launch S `gated-launch.sh --issue "#2143" --worktree <that worktree> --prompt <that order> --tier max --hard-ceiling-minutes 150`. The ticket comment adds: protect a worktree that a queued or running launch names. Until it merges, delete stale items at once with `node tools/stale-files.mjs --list` then `--delete --listing <id>`, never offer, but keep a worktree a queued launch needs.


Worker hard ceiling: a long build or a part build passes `--hard-ceiling-minutes 150` to `tools/launch-worker.mjs`; the configured 45 minutes stops it mid-work. `tab-view-transition-chrome.spec.ts` timed out in CI twice: the root fix is `ui#2454` (`#2096`), in review. `android-release-certificate.test.ts:39` (`beforeAll`, 8 child JVMs) timed out once at 15 s; a second red gives that hook its own time limit. The CI step "Run median TBT and script budget gates" (job "Authed Today Lighthouse budget") hung until the 6 hour job limit on two pull requests: a third hang gives that step its own time limit.

### Batch 0c: live defects in the shipped product, on `main`

An Android fix is followed by an Android Open release and an iOS TestFlight build at the same version, unless the defect is specific to Android.


- `#2131` Fix sign-in on iPhone: the code field opens no keyboard, and the human check is oversized, off centre and never settles (live defect, owner report). `ui#2471` merged at `main` `f58a889af` (PR Tests and Guards on `main` green). Next: `node tools/release-plan.mjs --environment staging --branch main`, dispatch the staging web release at `f58a889af`; then the proof agent with S `proof-note-2131-main-f58a889af.md` (reuses the existing detached `wt-2131-proof` worktree; red baseline S `report-2131-proof-c95546c4c.md`); at PASS, production web, Android Open and iOS TestFlight at one version from `main`; then resolve Sentry ORBIT-MOBILE-S and -T (no new event).
- `#2127` Stop the assistant from asking the opposite of a choice the person already made (live defect, owner order). Next: `api#1111` is merged and live in production (`1d2a826b8`). The staging capture passed 4 of 5 (run 5 replied with a log-only list card, the `#2129` class); per the plan no old-path fix round runs: the case is a must-pass case of `#2135`. Close when the new path passes it.
- `#2129` Make the assistant do the job from a short request, without the person teaching it each step (live defect, owner order: the class that `#2127` is one member of). Owner order: `/g-best-implementation` over the whole Orbit AI (map every part, the defect classes and their shared cause, every current approach including retrieval, the best model at the correct cost, with web research), then the second Claude account on Fable 5.2 (`claude -p --model claude-fable-5-2` with `CLAUDE_CONFIG_DIR` set to the worker account) must agree on the approach, then the run explains to the owner what changes; this ticket owns the plan and its build. Next: build the agreed plan step by step (scratchpad `orbit-ai-build-steps.md`, `best-impl-orbit-ai-final.md`); each step gets its own ticket when admitted (step 1 is `#2135`). Step 2 (API short references) starts after `#2135` merges and its live baseline run of `main` is done.
- `#2135` Make the Astra eval a real gate: client path, outcome grader, core set at pass^3 (Orbit AI step 1 of `#2129`). Next: `ui#2459` local `118abea84` (round 27 on pushed `df2591e37`: each core merge input is named by its command-line position, `inputPosition`, in every refusal and in `sourceWindow`; S `fix-2459-r27-result.md`). Diff read. One review (check that `mergeRunFiles` reads in command-line order and the baseline is not counted), body S `body-2459-r27.md`, resolve `PRRT_kwDOR5Siws638rXw` and `PRRT_kwDOR5Siws6384ur` (S `reply-2459-8rXw.md`, `-84ur.md`), push, request, merge at approval, then one live baseline run of `main` with a written cost estimate.

### Batch 2a: the API contracts the UI waits on

API first, deploy, then the UI half in Batch 2b.

No open ticket.

### Batch 2b: every other ticket that changes what a person sees

Includes the packaging milestone ("Packaging: caps, quotas and tiers") and the PostHog work.

- `#2096` Audit app motion on web and mobile and file one ticket per area. Next: `ui#2442` and `ui#2454` (the tab transition root fix) are on production web. Three older stale route intents are a work order comment on the ticket. Close when both are in the next Android and iOS pair.
- `#2140` Lay out borders in the mobile Yoga test helpers, so a geometry test sees the device size. Next: `ui#2470` pushed `859e06382`, CI green, Pullfrog 2 P1 threads on one defect (S `review-2470-pullfrog-r10.json`): the mobile expiry notice wrapper (`apps/mobile/components/ui/expiry-warning.tsx:209`) is a flat 12 dp from the window edge while web uses max(12px, the safe inset) and the top inset. Round 10 as the class fix (every edge offset of an overlay reads the device inset the same way on both platforms), resolve `PRRT_kwDOR5Siws638ykW` and `PRRT_kwDOR5Siws63808h`, review, React Doctor, push, request, merge at approval.

### Batch 3: the landing page and the Play listing

No open ticket.


### Batch 5: Astra

Milestone "562 Astra" and every Astra or MCP tool ticket. After every Astra ticket is settled and deployed to staging, run the full real-call and rendered sweep with tool evidence, approved mutations and independent persisted readback, on phone, desktop and Android, in both languages.

### Batch 6: security, correctness and the deletions

A deletion ships as a deprecation, then a code removal, then a table drop, each in its own release. A DTO contraction waits on the `MinSupportedVersion` raise being live in the Play fleet. Accept the SonarCloud `S1133` issues a deprecation raises with a comment naming the removal part.

- `#2142` Override `@hono/node-server` to 2.1.6 in the Astra eval to close Dependabot alert 180. Next: `ui#2459` (`#2135`) already pins the override (Pullfrog review of `a9b3b8ec7`); when it merges, confirm alert 180 closes and close this ticket with that evidence.

### Batch M: the Orbit mascot rebrand (owner order: started, in ticket order)
Each ticket is its body plus its work-order comments: one pull request each, never split. The API releases first.
- `#2144` Draw every app icon as the mascot with its eyes (owner order). Next: worktree `ticket-2144-icon-eyes` local `c448facd4` (the generator draws the rig with eyes for iOS, Android, web, desktop and the store exports; an eye pixel test on 43 icons; S `fix-2144-r1-result.md`). One review of `main..c448facd4`, then push and open the pull request from S `body-2144-r1.md` (`Tracks #2144`); it ships in the next web, Android and iOS releases.
- `#2121` Build the guided flows: create, edit, goals, tags, onboarding, sign-in and Perfil. Next: `ui#2451` local `97b9e7724` (round 15 `c52162209` and the worker merge of `main` `f58a889af`, 6 sign-in conflicts resolved, every ui#2471 behaviour kept). Its review (S `review-2451-r15-local.md`) found 2 defects: launch round 16 (`applyFreeRead` in `guided-habit-flow-core.ts:312-315` sets the schedule mark only when a schedule field changed, as `gaveTime` does, with web and Android modal cases; `TESTING.md:286` names the merged `sign-in-fixture-bundle` files and the real Sentry fact; body line 7 lists merge `97b9e7724`, body line 108 true). Then one review, body S `body-2451-r15.md` plus the r16 report, resolve the 5 threads (S `reply-2451-219t.md`, `-219w.md`, `-219y.md`, `-2193.md`, `-219_.md`), React Doctor, push, merge. Also fold `check-surface-scope` on `apps/mobile/components/chat/plan-block.tsx:20` into `#2122`.
- `#2122` Move every destination to the Orbit logic: Hoje, conversation, Calendário, Progresso and the rest. Next: `ui#2453` (stacked on `#2121`). Local `feature/ticket-2122-destinations` holds Parts 3 to 7 and now Parts 1 and 2 items 1 to 8 (worker `cd703bcc2`..`e0c7baa82`, then `a06f93f71`..`c49520d21`; 2 of 2 launches used); an agent adds the reduced-motion tests for the chips, preview approve and reject and the composer. New strings to approve: `chat.question.previous`, `chat.question.next`. Then the base merges after `#2120` and `#2121`, two critic passes, the copy approval, read, push and review.
- `#2123` Finish the rebrand in the app: rename, guard, remove the old paths and clean the source. Next: after `#2122`.
- `#2124` Finish the rebrand in the API: flag row, brand files and a cleanup of every file. Next: after `#2123`.
- `#2125` Change Orbit outside the app: stores, external logos, thomas-brain and the vault. Next: after `#2123`; parts outside the repositories are coordinator work. The `thomas-brain` listing files equal the live Play text; the store rewrite states the Pro allowance as 250 a week (ticket comment).
- `#2126` Rebuild the landing page around Orbit and clean every file. Next: after `#2125`.

### Batch 7: the production readiness run

- `#315` Run `/prod-readiness` once the board is clear. Next: Android Open 1.3.148 or later from a `main` commit whose push runs passed, then the live Astra gate window once the other tickets that change the code are done. First regenerate `evals/astra/catalog.yaml` at the evaluated API commit; a card question the grader cannot read is a grader limit.
- `#33` Record the 7 demo clips and 2 landing videos. Next: after every ticket that changes code (the `#2074` measurement is independent), the run writes the scripts, the owner records, the run edits every video to the best result, and the editing method becomes thomas-brain skills. Blocked by `#2123`.

### Batch 8: new platforms, iOS first, then desktop

- `#1561` Ship Orbit for iPhone and iPad to TestFlight, with push and the home-screen widget, and the production app on the owner's iPhone (owner order). The iPhone app is a launch requirement. Next: the real-device checks once the owner installs it, and the profiling step for Sentry `ORBIT-MOBILE-R` (a 3 s hang on the App Review iPhone; ticket comment of 12 November 2026). The iPad findings in the ticket comments (unread badge font scale, "Widget do Android" label) stay in scope. App Review approved iOS 1.3.152 (app store version `f093e30c-9704-4ff5-bf4a-e858784c0ecc`, `PENDING_DEVELOPER_RELEASE`, `MANUAL`): it waits for the owner's Android launch order. The outside tester group `Orbit beta` exists with a public link (on the ticket) and iOS 1.3.154 (4) in it, approved by Beta App Review (the link answers). Add each later build to the group with scratchpad `asc-external-group.mjs group <build id>`. Scratchpad tools: `asc-api.mjs` (team key `~/.orbit-ios-signing`), `asc-pro.sh on|off`.
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

UI `main` `f58a889af` (ui#2471 merged), API `main` `38513551a`, landing `main` `7e6d150e0`. Production web serves `0ed7244d3` with desktop 0.1.34; production API serves `38513551a`; Android 1.3.156 (217) is on Open; iOS 1.3.156 (6) is in `Orbit beta`. Open pull requests: ui#2451, ui#2453, ui#2459, ui#2464, ui#2469, ui#2470, landing#136 and the relay pull request; local commits not yet pushed on ui#2451, ui#2459, ui#2464, ui#2469, landing#136, the UI JSDoc branch and the `#2144` branch. The stale-file cleanup freed 148.8 GB; free disk on `/System/Volumes/Data` is about 60 GiB, over the 50 GiB floor, so new worktrees are allowed.

## Open questions

No open owner question. The Apple and Windows logos on the landing downloads panel are a settled owner order (`#2090`): a review objection to them on trademark grounds gets the standing reply and is never raised with the owner again. A step for the owner names the literal value (the code, the number, the field label on the screen), and the run does the step itself first when an API can. The owner signed in to App Store Connect in Chrome. The Pullfrog workflow secret `CLAUDE_CODE_OAUTH_TOKEN` holds a fresh main account token in all three repositories (scratchpad `token-swap.py`, owner Authorize click). Owner-only steps, never reminded: cancel the second Claude account on 4 December 2026; open TestFlight for the `#1561` device checks; record the `#33` videos when the run asks.

Settled decisions that still bind:

- No Render plan upgrade for the production API, and staging stays on the free plan; never ask again.
- No Mac App Store and no Windows code-signing certificate; the Apple Developer Program only.
- No CircleCI token rotation and no Render MCP key rotation. Astra gets no email connection.
- Gmail web in `claude-in-chrome` reaches the owner's Orbit account mailbox; the Gmail MCP stays on the work mailbox.
- An OAuth Authorize click on the owner's own account is his: give him the link and take the code he pastes.
- The conversation entry is the live Orbit at 48 with no background, in a 60 press target above the create button, named `Falar com o Orbit` / `Talk to Orbit` and never "the Orbit button"; wide web keeps the labeled sidebar row. The owner comments on `#2120` and `#2122` hold the detail.
- Each Claude account has one weekly reset: use it at 100% (on the main account at about 98%, before the coordinator stops) when about 3 days or more remain before the normal reset (claude.ai, Settings, Usage, "Redefinição semanal").
