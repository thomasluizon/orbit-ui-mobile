# Orbit prod release

History: `## Batch history`, every earlier `## Current state` paragraph, the redesign gate runbook, the answered open questions and the retired rules are in git at the tag `archive/prod-release-spec-full` (`git show archive/prod-release-spec-full:.claude/specs/orbit-prod-release.md`), which keeps the relay branch history reachable after its pull request closes. This spec holds only what is in force. `node tools/check-handoff-size.mjs` keeps it at 40,960 B or less.

## What this is

The goal is a production release with an empty ticket board, except `#33`. The move to Render and Amazon SES (Batch M) is done, and the redesign is live in production on `main` by an executed written approval: never request another redesign approval. Everything ships now, with no before-launch or after-launch split: Android, web, the landing page, desktop for Mac and Windows, iOS, and Astra with every prompt working.

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

In-flight work finishes as normal. Then no new board ticket is admitted until every diet ticket below is merged. Brain ADR D149 holds the measurements and the account plan.

- `#2065` Lower the coordinator relay threshold to 200k tokens. Next: `ui#2390` head `40a20e256` answers its one Pullfrog thread (every relay-session case reads the shipped threshold); CI green, review requested at that head: merge on approval.
- `#2071` Move the Pullfrog token in all three repositories to the main account, before 4 December 2026. Next: Chrome holds the main org claude.ai session, but the Claude Code OAuth page redirects to `claude.ai/login?reauth=1`, so the owner signs in fresh; then run `token-swap.py` from the scratchpad (it reads the OSC 8 link target), which pipes the token to `gh secret set CLAUDE_CODE_OAUTH_TOKEN` in all three repositories, and a small worker updates the skill text.
- `#2074` Stop Pullfrog from reviewing heads that later fail CI. Next: merged as `ui#2387`; `review.mode none` and `review.re-review false` are set in all three repositories. Prove one requested review publishes `pullfrog-approval` on the next green pull request, then run the review-rounds measurement one week after the config change (dated in the ticket comment) and close.

### Batch R: owner review findings

A finding from an owner review or a rendered sweep that shows broken behaviour lands here.

### Batch 0b: the harness and the standing syncs

The gates every later batch runs through. Re-read each ticket against the tree before you build it.

### Batch 0c: live defects in the shipped product, on `main`

An Android fix is followed by an Android Open release.

- `#2077` Fix the Astra button above the create habit button and remove its drag (owner order). Next: `ui#2389` head `93d906554` (layout spec now measures the stack column at its content box); only `Android release build` was red (Gradle download timeout), rerun in progress. Request the review after green CI, merge, then production web and Android Open with `#2062` and `#2061`.
- `#2062` Keep the keyboard up while typing in habit search. Next: live in production web `0e43371b0`; ships to Android Open with `#2077`, then close.
- `#2061` Centre the clear X in the habit search empty state. Next: `ui#2377` head `2e0aa1a8d` (round 4 primitive plus the shared text token test fix), threads resolved; failed jobs (Android release build on a GitHub 504, flaky Layout shard 3 search-empty spec) rerun. Request the review after green CI, merge, then Android Open.
- `#2030` Show the update and later buttons on the Android update sheet. Next: the cover-screen AVD matrix on current `main` is green (ticket comment); close on the owner-device `android_update_sheet_shown` probe event after the next Android Open. Delete AVD `orbit-repro-2030` after the `#2077` Android proof.

### Batch 2a: the API contracts the UI waits on

API first, deploy, then the UI half in Batch 2b.

### Batch 2b: every other ticket that changes what a person sees

Includes the packaging milestone ("Packaging: caps, quotas and tiers") and the PostHog work.

### Batch 3: the landing page and the Play listing

### Batch 5: Astra

Milestone "562 Astra" and every Astra or MCP tool ticket. After every Astra ticket is settled and deployed to staging, run the full real-call and rendered sweep with tool evidence, approved mutations and independent persisted readback, on phone, desktop and Android, in both languages.

### Batch 6: security, correctness and the deletions

A deletion ships as a deprecation, then a code removal, then a table drop, each in its own release. A DTO contraction waits on the `MinSupportedVersion` raise being live in the Play fleet. Accept the SonarCloud `S1133` issues a deprecation raises with a comment naming the removal part.

### Batch 7: the production readiness run

- `#315` Run `/prod-readiness` once the board is clear. Next: Android Open 1.3.148 or later from a `main` commit whose push runs passed, then the live Astra gate window once the other tickets that change the code are done.
- `#33` Record the 7 demo clips and 2 landing videos. Next: after every other ticket, the run writes the scripts, the owner records, and the run edits every video.

### Batch 8: new platforms, iOS first, then desktop

- `#1561` Ship Orbit for iPhone and iPad to TestFlight, with push and the home-screen widget. Next: CI, review and merge of `ui#2370`, which rides the next Android Open, then the real-device checks through TestFlight once the owner installs it.
- `#1560` Ship a real native Orbit desktop app for Windows and macOS. Next: `ui#2391` head `abaff0ab4` (hash-checked NSIS tools cache, release manifest through the asset endpoint with retries); red only on GitHub 504 outages (Android AAB Kotlin jar, Windows measure electron-builder binaries, rerun pending). Request the review after green CI, merge, then verify the shell update on the Mac and close.
- `#1861` Add the Done action to Repeat every reminders in the macOS and Windows desktop app. Next: launch round 11 on `ui#2374` (head `0e83d9839`, macOS installed now passes) with the composed order `order-1861-r11.md`: the Windows notification hosts run High elevated while the harness starts the shell at Medium, so start the shell as a person does; cache electron-builder binaries. `Desktop aarch64-pc-windows-msvc` reruns after `ui#2391` merges.
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

Latest handoff: a relay with the chain open, the run in `/sleep` with `crank: true` and `autoWork: true`. UI `main` `f063561d7`, API `main` `3da71dcf6`, landing `main` `7fb212c42`; production web `0e43371b0`, production API `3da71dcf6`, production landing `7fb212c42`; Android Open 1.3.149 (209); desktop 0.1.26 on both channels. Open ui pull requests: `ui#2390` (`#2065`), `ui#2389` (`#2077`), `ui#2377` (`#2061`), `ui#2391` (`#1560`), `ui#2374` (`#1861`), `ui#2388` (relay docs). GitHub `releases/download` and `services.gradle.org` answer 504 or time out intermittently, so Android, iOS and Windows bundling jobs need reruns. Intake: Sentry `ORBIT-MOBILE-Q` only (no new event), mail 0, Play 0. The session chain ledger lives untracked at .git/orbit-session-chain.json.

## Open questions

Open: the owner signs in fresh to claude.ai in Chrome with the main account (the OAuth page forces `reauth=1`); it blocks `#2071`. Owner-only steps, never reminded: cancel the second Claude account on 4 December 2026; cancel ChatGPT Plus if it still bills; open TestFlight for the `#1561` device checks; record the `#33` videos when the run asks.

Settled decisions that still bind:

- No Render plan upgrade for the production API, and staging stays on the free plan; never ask again.
- No Mac App Store and no Windows code-signing certificate; the Apple Developer Program only.
- No CircleCI token rotation and no Render MCP key rotation. Astra gets no email connection.
- Gmail web in `claude-in-chrome` reaches the owner's Orbit account mailbox; the Gmail MCP stays on the work mailbox.
