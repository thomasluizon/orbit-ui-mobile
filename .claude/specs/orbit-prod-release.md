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
- The coordinator relays at a soft 350000 tokens of context, at its first quiet point, with a 400000 hard ceiling (owner decision, measured in `#2085`). Until `ui#2395` merges, the shipped 200000 threshold still fires.

### The owner

- Answer each owner message first, in the owner's language (English or pt-BR), before other run work, and give each order a ticket or a rescope of its existing ticket before the turn ends. A command the owner types during an unattended run is answered before any other work.
- Decide every question that has a clearly better answer (`.claude/rules/core.md` rule 7, `/questions`). Pricing, positioning, brand direction and genuine product choices stay the owner's. A token added only to meet an accessibility floor is the run's decision. Written authorization covers the requested scope; ask again only if scope or inputs change.
- When the owner says a step is done, close on it and never re-ask how. Never list or remind the owner of the `#33` videos. When the owner asks "why", answer with evidence from the source and correct any earlier claim it contradicts.
- Write and approve every piece of user-facing copy in both locales: write it against `BRAND.md`, the brain decisions and `/humanizer`, and approve it with `/second-opinion` framed as a claimed copy defect (so `DISAGREE` means approved), with the verdict posted on the pull request before merge. Never hold copy for the owner. pt-BR reads as a Brazilian product writer wrote it; a word-for-word translation is a defect, including API pushes and e-mails. Add no visible string out of place.
- Orbit has no ads; Orbit Pro is the only monetization. Ad code is dead code to delete.
- Orbit has no X brand account and gets none. The brand profiles are LinkedIn, Instagram `@useorbitapp`, Facebook, Discord and the Workspace mailbox. The founder account is the owner's to create and post to by hand; the run drafts its posts.

### Product rules no other document holds

- General habits never offer Skip; dated habits keep Skip (`#1920`). General items are undated one-time tasks under Task date choices; Habit frequency offers only Every and Times per, without the repeating General hint. The habit form rules are in `design/habit-form-surfaces.md`.
- Calendário is one centred column (the month grid on top, the selected day below it, the view selector folded into the month header, 24px card padding). The Perfil Suporte row opens the support form. Sobre carries no internal naming note.
- Owner removals that `tools/feature-parity-rules.json` cites by exact text: Perfil is grouped into sub-menus, and the old duplicate Preferências, Avançado and Recursos de IA pages stay gone as separate copies. A floating control no drawing has (the web back-to-top button) is deleted, not restyled. `#1422`: Remove the Hoje jump pill; the centred date label returns to today across the app.
- The Astra button exists only in the compact shell (Android and web below 1024), replaces the Hoje composer, and sits fixed directly above the create habit button, never dragged or moved (`#2042`, `#2077`).
- Every input is simple first (levels, not a wall of options), keeps correct spacing including hover spacing, and asks human questions instead of system labels. A set of options never wraps onto a second line, and every no-wrap rule has a test that fails the pull request.
- The app feels like a native mobile app at compact widths: less on each screen, secondary content in sheets, menus and drawers, and breathing room around every group (brain ADR `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`). `DESIGN.md` is wrong wherever it permits the opposite. Where a control sits is the run's decision.
- Hovering a nested control never keeps its parent card's hover active (`#2057`).
- Keep locale out of auth and deep-link URLs. Gate both listing and revoking API keys behind the emailed code.
- The landing page follows the long-scroll reference `lp.pierre.finance/lp/converse` in Orbit's design with Astra as the focus, never a description beside a phone mockup. Nothing on it changes without a visitor action, except the hero side cards, which float from page load and tilt toward a fine pointer (stopped under reduced motion and off-screen); the phone does not float, never scrolls on its own, and draws every component at the app's logical size.

### Platforms and releases

- Route all work to `main` in every repository; `redesign/main` is retired.
- Nothing deploys on a merge or a push; `/release` and `/android-release` own every deploy. Android fixes merged to `main` ship to the Open track, Orbit's main Android channel. The production track stays empty until the owner orders a launch.
- The beta fleet permits a simpler deploy order while the owner is the only user, including relaxing deploy-API-first. Keep the full code contract.
- The live Astra eval gate (`#315`) runs once, after every other ticket that changes the code is done and the `#1916` call-cost fix is live, with one attempt per case and failing cases rerun once. Its eval spend ceiling is 2 USD for that run and returns to 0.50 USD a day after it; fix rounds replay recorded provider responses offline. No paid-key probe runs without a written cost estimate. The iOS app does not hold the gate.

## The order

Reconcile the open board with these batches before each handoff. Place each new ticket exactly once, as one bullet, and give it only its title and its current next step: the ticket body and its comments hold the history. A batch completes before the next begins; a ticket that waits on a named condition does not hold its batch. Within a batch, use dependency order and drive open pull requests first.

### Batch T: the harness token diet (owner order, priority 1)

In-flight work finishes as normal. Then no new board ticket is admitted until every diet ticket below is merged or waits only on the owner; `#2074` is merged and its measurement does not hold admission, and `#2071` waits only on the owner's sign-in, so it does not hold admission either. Brain ADR D149 holds the measurements and the account plan.

- `#2071` Move the Pullfrog token in all three repositories to the main account, before 4 December 2026. Next: Chrome holds the main org claude.ai session, but the Claude Code OAuth page redirects to `claude.ai/login?reauth=1`, so the owner signs in fresh; then run `token-swap.py` from the scratchpad (it reads the OSC 8 link target), which pipes the token to `gh secret set CLAUDE_CODE_OAUTH_TOKEN` in all three repositories, and a small worker updates the skill text.
- `#2074` Stop Pullfrog from reviewing heads that later fail CI. It never holds the launch (owner order). Next: merged as `ui#2387`, and a requested review published `pullfrog-approval` SUCCESS on `ui#2390`. Run `tools/review-rounds.mjs` as soon as it can run, on or after 16 November 2026, whatever the launch state; if the `dismissed approval` share is not clearly below 43%, fix the cause in this ticket and measure again, then close.

### Batch T addition

- `#2085` Relay the coordinator at the measured cheapest moment, with a soft threshold that waits for a quiet point (owner order). Next: `ui#2395` head `448f84bb6` carries the soft and hard relay design, the cost measurement tool and the owner's numbers (`softTokens` 350000, `hardTokens` 400000; tools and hooks suites exit 0); it is pushed and the PR body says 350000 and 400000. CI is green (42 checks). Pullfrog COMMENTED with four FIX threads: the empty-queue branch of `.claude/hooks/_lib/rules-relay.mjs:19` calls a Stop quiet that the sleep gate refuses; `forced`, `armedAt` and `armedTokens` in `.claude/hooks/relay-at-threshold.mjs:33-37` are written and never read; `.claude/skills/orchestrate/SKILL.md:1492` must say the pair is the owner's choice, not derived by the tool; `tools/lib/relay-cost.mjs:15` repeats the 900000 auto-compact constant. The review-batch order `order-2085-rb1.md` is composed (the arm fields get a reader in `sessionChainEntry` and `measure-relay-cost.mjs`); its launch was refused by the relay drain: launch it with `gl.sh ... --tier default --relaunch-reason`, read the diff, resolve the threads, push, request the review, merge on approval. The measurement is a comment on the ticket.

### Batch R: owner review findings

A finding from an owner review or a rendered sweep that shows broken behaviour lands here.

- `#2086` Hide the log control on every habit while select mode is on, instead of showing it disabled (owner report). Next: `ui#2396` (pushed head `7fb9c69a3`, red: Layout shard 3 and 4 mobile unit failures). The CI-fix worker (order `order-2086-ci1.md`) delivered unpushed commit `43a682ff9` in worktree `ticket-2086-select-mode-log-control` (tree clean, exit 0 after 5 minutes on Sonnet). Read the diff and the worker log against the order (each named failure fixed at its root, including the `android-release-certificate.test.ts:25` hook timeout; `search-empty-icon-action.spec.ts:62` left alone), push, wait on CI, request the review, merge on approval, then production web and Android Open.
- `#2083` Show the Turnstile check full width and only when needed on sign-in, not as a boxed square (owner report from the Windows app). Next: `ui#2393` (head `851d20990`, `size: 'flexible'`, dark theme as the ticket requires, hidden after it passes, web and mobile) is green; Pullfrog COMMENTED with thread `PRRT_kwDOR5Siws61X87w` (`apps/web/components/auth/turnstile-widget.tsx:76`): a light signed-out page gets a dark challenge while mobile follows the app theme. Decided: both platforms follow the page theme (the ticket's "dark theme" described the owner's dark screenshot). The review-batch order `order-2083-rb1.md` is composed and its launch was refused by the relay drain: launch it with `gl.sh ... --tier default --relaunch-reason`, read the diff, resolve the thread, push, request the review, merge on approval, check the rendered sign-in on staging (Turnstile enforces there), then production web and Android Open.

### Batch 0b: the harness and the standing syncs

The gates every later batch runs through. Re-read each ticket against the tree before you build it.

- `#2081` Stop the auto-work waiter's run state saves from overwriting a concurrent run state write. Next: Pullfrog COMMENTED at `ui#2392` head `f8581cfa2` with two threads (`.claude/skills/crank/SKILL.md:21`, `tools/lib/auto-work-intake.mjs:51`): the skill text tells agents to spread the record read inside the lock, which carries the current owner's `sessionId`, so the superseded-session refusal in `publishRunState` no longer stops a predecessor's writes. Both are FIX: enforce the superseded-session refusal once inside `updateRunState` and correct the skill text (thread `PRRT_kwDOR5Siws61XSNW`); delete `saveIntakeSource` and move its tests to `updateIntakeSource` (thread `PRRT_kwDOR5Siws61XSNy`). The review-batch worker delivered commit `531e9f362` in worktree `ticket-2081-run-state-lock`, unpushed by design, tree clean; its diff is read and answers both threads. Run `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs` in that worktree (both must exit 0), merge the worker report into the PR body, resolve both threads, push, request the review, merge on approval.

### Batch 0c: live defects in the shipped product, on `main`

An Android fix is followed by an Android Open release.

- `#2077` Fix the Astra button above the create habit button and remove its drag (owner order). Next: `ui#2389` head `4686f7094` is red in `Layout shard 1` and `Upgrade layout geometry`: `astra-button-compact.spec.ts:88` "takes the create button slot when Hoje has no create button" fails at 412px (`columnBottom - bottom` is 0, expected `FAB_SIZE + ASTRA_BUTTON_GAP` 84, while `[data-shell-fab-pending]` exists) and at 840px (`[data-shell-fab-pending]` count 0). Find whether the test or the pending slot in `ShellFabColumn` (`apps/web/components/shell/shell-wide.tsx:421`) is wrong, red then green. The local repro (`repro-2077.sh` in the scratchpad: the CI `layout-build` artifact of run 42656349155, then `run-spec.sh`) once stopped at "Timed out waiting 120000ms from config.webServer", but a hand start of `next start` in the worktree with the layout env answered on port 3100 within 6 s (HTTP 308 at `/`), so run `repro-2077.sh` again and read the full `[WebServer]` output if it times out. Then compose the CI-fix order, wait on CI, request the review, merge on approval, then production web and Android Open with `#2062` and `#2061`.
- `#2062` Keep the keyboard up while typing in habit search. Next: live in production web `0e43371b0`; ships to Android Open with `#2077`, then close.
- `#2061` Centre the clear X in the habit search empty state. Next: `ui#2377` merged (`b913fa08b`); ship in the next Android Open and production web, then close.
- `#2030` Show the update and later buttons on the Android update sheet. Next: the cover-screen AVD matrix on current `main` is green (ticket comment); close on the owner-device `android_update_sheet_shown` probe event after the next Android Open. Delete AVD `orbit-repro-2030` after the `#2077` Android proof.

### Batch 2a: the API contracts the UI waits on

API first, deploy, then the UI half in Batch 2b.

### Batch 2b: every other ticket that changes what a person sees

Includes the packaging milestone ("Packaging: caps, quotas and tiers") and the PostHog work.

### Batch 3: the landing page and the Play listing

- `#2082` Put the downloads at the top of the landing page: a platform-aware hero button and a header Download link (owner order). Next: `landing#128` (head `a1d231a3f`) got a Pullfrog COMMENTED review with three FIX threads. The orchestrator writes it in one commit, no worker: write the hero surfaces as literals (`src/scripts/desktop-downloads.test.mjs:216`, thread `PRRT_kwDORqm3lM61X_bV`, the reviewer's suggestion). Threads `PRRT_kwDORqm3lM61X_bE` (header anchor records `desktop_download_clicked`) and `PRRT_kwDORqm3lM61X_bM` (unknown Mac architecture gets the aarch64 file) are not applicable: the `#2082` body's Decision items 5 and 1 choose both, and the All downloads link under the hero button lists the Intel file. Before replying to `bE`, find PostHog insights that count `desktop_download_clicked` without a surface breakdown and exclude `header_download` in each. Resolve the threads, push, request the review. It adds en and pt-BR copy (Download, Baixar, Todos os downloads): post the `/second-opinion` copy verdict on the pull request before merge. Merge on approval, then the landing `/release`.

### Batch 5: Astra

Milestone "562 Astra" and every Astra or MCP tool ticket. After every Astra ticket is settled and deployed to staging, run the full real-call and rendered sweep with tool evidence, approved mutations and independent persisted readback, on phone, desktop and Android, in both languages.

### Batch 6: security, correctness and the deletions

A deletion ships as a deprecation, then a code removal, then a table drop, each in its own release. A DTO contraction waits on the `MinSupportedVersion` raise being live in the Play fleet. Accept the SonarCloud `S1133` issues a deprecation raises with a comment naming the removal part.

- `#2078` Make the date phrase parser's digit separator check linear and close the CodeQL ReDoS alert. Next: admit when Batch 0c settles (`#2071` waits on the owner and does not hold Batch T).
- `#2079` Prove runBounded passes the program path and arguments literally and close the CodeQL shell alert. Next: admit when Batch 0c settles.
- `#2080` Prove the cookie policy forces Secure on every cookie and dismiss the test-only CodeQL cookie alert (API). Next: admit when Batch 0c settles.

### Batch 7: the production readiness run

- `#315` Run `/prod-readiness` once the board is clear. Next: Android Open 1.3.148 or later from a `main` commit whose push runs passed, then the live Astra gate window once the other tickets that change the code are done.
- `#33` Record the 7 demo clips and 2 landing videos. Next: after every other ticket, the run writes the scripts, the owner records, and the run edits every video.

### Batch 8: new platforms, iOS first, then desktop

- `#1561` Ship Orbit for iPhone and iPad to TestFlight, with push and the home-screen widget. Next: `ui#2370` is merged and in TestFlight build `a727bce32` (iOS Release run 42451288593); the real-device checks run through TestFlight once the owner installs it.
- `#1560` Ship a real native Orbit desktop app for Windows and macOS. Next: `ui#2391` (NSIS prefetch) merged as `21f6045ae`. Add an ESLint config and `lint` script to `apps/desktop`, raise the 10 s spawn timeout at `tools/desktop-bench/test-acceptance.ts:224` in the same change, verify the shell update on the Mac and close.
- `#1861` Add the Done action to Repeat every reminders in the macOS and Windows desktop app. Next: `ui#2374` merged (`cec0da38a`); ship it in the next desktop release, then close (a real toast click on a real Windows machine stays a manual step).
- `#2084` Replace the old-looking native Windows title bar in the desktop app (owner report). Next: the worker delivered `ui#2397` (head `386b6fe0a`: the Windows caption matches the Orbit canvas and the page theme, with a Windows installed acceptance proof). Verify delivery, read the diff against `DESIGN.md`, wait on CI, request the review, merge on approval; ship in the next desktop release with `#1861` and `#2087`.
- `#2087` Give the Windows desktop app a smaller, slightly rounded Orbit icon tile (owner order). Next: `ui#2394` (head `283556a73`, every `icon.ico` entry regenerated as an inset tile at 81% of the canvas with a radius of 21% of the tile, measured from the Orca icon the owner named; `icon.icns` unchanged) passed every check after the macOS acceptance rerun. Pullfrog COMMENTED: thread `PRRT_kwDOR5Siws61X_ak` (`apps/desktop/README.md:111`, `tauri icon` always writes `icon.ico` too, so the README contradicts itself), plus two doc gaps and a PR-body link in the review body. Docs only, so the orchestrator writes it in one commit: the README suggestion of the thread; the `DESIGN.md:1167` app icon radius bullet also names the Windows baked tile (pointing at `windowsIconLayers` in `tools/generate-brand-assets.mjs`, no repeated numbers, the radius never on a UI surface); the PR body's first line becomes `Tracks thomasluizon/orbit-tickets#2087`. Resolve the thread, push, request the review, merge on approval, ship in the next desktop release.
- `#1563` Show the App Store badge and the Mac and Windows downloads on the landing page. Next: `landing#127` is live in production landing `7fb212c42`; the App Store card follows the App Store listing (`#1561`).

## How the work runs

Use `/sleep` or `/auto-work` for unattended work and `/orchestrate` for one ticket at a time. Pullfrog reviews each pull request. `/handoff` replaces the one `## Current state` paragraph in this spec and overwrites `.claude/handoffs/NEXT.md`; it never appends.

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

Latest handoff: a relay with the chain open, the run in `/sleep` with `crank: true` and `autoWork: true`. UI `main` `21f6045ae`, API `main` `3da71dcf6`, landing `main` `7fb212c42`; production web `0e43371b0`, production API `3da71dcf6`, production landing `7fb212c42`; Android Open 1.3.149 (209); TestFlight `a727bce32`; desktop 0.1.26 on both channels. Open pull requests: `ui#2397` (`#2084`, CI), `ui#2396` (`#2086`, red, CI fix delivered as unpushed `43a682ff9`), `ui#2395` (`#2085`, COMMENTED, order composed), `ui#2394` (`#2087`, COMMENTED, orchestrator docs fix), `ui#2393` (`#2083`, COMMENTED, order composed), `ui#2392` (`#2081`, review batch delivered as unpushed `531e9f362`), `ui#2389` (`#2077`, Layout red), `ui#2388` (this relay's docs, CI), `landing#128` (`#2082`, COMMENTED, orchestrator test fix plus two not-applicable replies). Never put `pkill` options after the pattern: BSD `pkill` reads a trailing argument as a second pattern; kill by recorded pid. Sentry holds one unresolved issue (`ORBIT-MOBILE-Q`, carried by `#1561`); the mailbox and store reviews were empty at the last cycle. Record every merge sha in the run ledger at merge time: unrecorded merges grow the `run-status.mjs` GitHub query past its read budget. The session chain ledger lives untracked at .git/orbit-session-chain.json.

## Open questions

Open: the owner signs in fresh to claude.ai in Chrome with the main account (the OAuth page forces `reauth=1`); it blocks `#2071`. Owner-only steps, never reminded: cancel the second Claude account on 4 December 2026; cancel ChatGPT Plus if it still bills; open TestFlight for the `#1561` device checks; record the `#33` videos when the run asks.

Settled decisions that still bind:

- No Render plan upgrade for the production API, and staging stays on the free plan; never ask again.
- No Mac App Store and no Windows code-signing certificate; the Apple Developer Program only.
- No CircleCI token rotation and no Render MCP key rotation. Astra gets no email connection.
- Gmail web in `claude-in-chrome` reaches the owner's Orbit account mailbox; the Gmail MCP stays on the work mailbox.
