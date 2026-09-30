# Orbit prod release

## What this is

The goal is a production release with an empty ticket board. First, Orbit moves to its new stack (Batch M): Render for the API, web, landing and Postgres, Amazon SES for email, a separate staging, and production deployed only through release workflows. Everything else is parked until Batch M is done. Complete the redesign on web and Android, obtain the owner's whole-redesign approval, then complete the remaining batches and `/prod-readiness` findings. Use the granted canvas under `DESIGN.md` and keep web and mobile behavior aligned.

## Standing rules

- Finish the original spec. A blocker becomes the next task. An early stop needs an external cause: allowance exhaustion, machine stop, or the owner's stop request.
- Finish harness work before the redesign. Fix a harness defect in the current run; file a separate ticket only for a real capability gap.
- Report progress in product terms through `/progress`, with short replies that meet the writing contract.
- Run `/questions` before asking the owner anything. Check code, ticket comments, decisions and research first. Ask every surviving question in rounds of at most four.
- Decide questions with a clearly better answer. Follow `DESIGN.md`, `BRAND.md`, the granted canvas and brain decisions. Send genuine product, brand, price and design choices to the owner.
- Choose the complete, correct implementation. Speed changes scheduling, never quality.
- Write and approve every piece of user-facing copy in the run, in both locales: write it against `BRAND.md`, the brain decisions and `/humanizer`, and approve it with `/second-opinion` before merge. Never hold copy for the owner and never add an owner copy-review gate. Pricing, positioning and brand direction stay the owner's (the rule above).
- Orbit has no ads; Orbit Pro is the only monetization. Ad code anywhere is dead code to delete, never a product option or a question.
- Supabase is paused and production data lives on Render Postgres. The Batch E query-shape tickets remain as performance work on Render Postgres: measure bytes and rows per query shape, rank them, and fix the largest waste first; they are no longer a quota emergency.
- Batch M (the move to the new stack) outranks every other batch; everything else waits until staging and production both run on the new stack.
- Operate every platform through Terraform, CLIs, APIs and MCPs. A console step goes through `claude-in-chrome` only when no API covers it. The owner does only account creation, passwords, 2FA, payment and legal identity.
- A secret that only a browser can create (a first API token) is stored by the owner in the macOS Keychain; commands read it with `security find-generic-password -s <service> -w` and never print it. Keychain services in use: `orbit-cloudflare-api-token`, `orbit-stripe-test-secret-key`.
- After a migration is verified live, nothing stale stays active: cancel the retired subscriptions and delete the retired projects, after a final backup. A permanent deletion that only a browser can do is the owner's click.
- The production database copy loses zero rows: writes frozen during the dump, every table verified by row count and checksum, the old database paused until the owner signs off.
- Before the public launch, a production outage keeps its place in the batch order; it jumps the queue only after launch.
- Record every infrastructure decision and research result in the brain (`/brain`) as it is made.
- Nothing deploys on a merge or a push. Each code repository has one manually run `release.yml` with an environment choice: `production` always deploys `main`; `staging` deploys whatever branch the operator selects (for example `main` to test new features before production, or `redesign/main` for the redesign gate). No branch is tied to staging, and no staging service auto-deploys. The `/release` skill runs these workflows and takes the environment and, for staging, the branch.
- Release credentials are scoped by GitHub environment: each release job reads `RENDER_API_KEY` from its own environment (`production` or `staging`, plus `render-operations` for the API's scheduled Render jobs), and every environment that holds the key allows deployments only from `main`. No repository-level Render key remains once each repository's credential ticket lands.
- Never read a live secret into the session transcript. Pipe it from its source (an environment variable, the Keychain, SSM) straight into its destination, such as `gh secret set` on stdin. A secret that exists only in a dashboard and has no API is not used; choose a design that does not need it.
- Android releases keep a track choice with only the tracks in use: open and production build `main` against the production API; the internal testing track (the owner's closed beta) builds the selected branch against the staging API. Every other track option is removed. Never promote a binary between tracks, because the API base is baked in at build time.
- After a verified cutover, cancel the plans Orbit no longer uses (Vercel Pro, Resend Pro) and pause what is left on retired platforms (Supabase). Permanent deletion of an old project or its data stays the owner's.
- Android fixes merged to `main` ship to the open track through `/android-release` (through `/release` once Batch M lands).
- Route redesign-only work to `redesign/main`; route shipped defects, performance and egress fixes, harness work, CI and security work to `main`. If a shared fix depends on redesign code, land it on `redesign/main` and backport it to `main`.
- Keep `redesign/main` synced with `main` in every repository: #556 carries `orbit-ui-mobile`, #746 carries `orbit-api` and #828 carries `orbit-landing-page`. Sync pull requests merge by squash, so `main` never becomes an ancestor of `redesign/main`; each sync cherry-picks with `-x` only the `main` commits added since the last one, skipping any already carried, and changes no behaviour beyond carrying them.
- Do console and dashboard steps yourself through the `claude-in-chrome` skill (Play Console, AdMob, Cloudflare, Render, Supabase): a manual step is the run's work unless it needs the owner's password, 2FA, payment or a legal identity choice. A Play Data safety change waits until the build it describes is live.
- Keep `redesign/main` unprotected. The whole redesign receives one closed Play INTERNAL build and one owner review before merging to `main`; do not request an earlier gate.
- Use the configured local worker cap. Relaunch killed workers after checking their worktrees for commits.
- Written authorization covers the requested scope. Ask again only if scope or inputs change.
- The centered phone layout is the large-screen answer. The public Play developer name is TL SOFTWARE ENGINEERING LTDA.
- Build device-dependent work without treating device inspection as an implementation gate. The owner tests the whole redesign from an APK at the redesign gate. Do not boot the owner's Android emulator.
- Gate both listing and revoking API keys behind the emailed code.
- Render Astra responses with visual blocks wherever useful; simple sentences may stay text. Check `#318` before implementing the component plan. Use `beautifului.dev` when it supports the platform.
- Never repeat a paraphrased user report as a verified cause; check the original report.
- New reports affecting the shipped product take priority over the queue.
- Never edit `node_modules`. Confirm installed interfaces by reading them, and implement supported changes in repository code or config plugins.
- Route component-library migration after the redesign: rn-primitives on mobile and Radix on web, with shared component shape and Orbit tokens.
- The failed-delete toast pauses on hover and focus; Retry remains its sole action.
- Keep the Mac awake while a session runs. A closed lid still sleeps it.
- Turnstile enforcement starts only after web and Android sign-in send a token.
- Keep locale out of auth and deep-link URLs.
- `/handoff` ends its session after committing the spec and one `NEXT.md`. `/wrap-up` runs `/progress`, `/questions`, then `/handoff`.
- The orchestrator merges a pull request with `gh pr merge --squash --match-head-commit <sha>` after the exact head has green checks, a Pullfrog approval submitted after its push, and zero unresolved threads. Redesign-only work merges to `redesign/main`; other work merges to `main`. Production auto-deploy is off: a merge to `main` deploys nothing, and production deploys only through the release workflows.
- Admin merges happen only inside `/merge-prs` after the owner invokes it for an approved frozen set. Never use a direct merge API.
- Launch Codex workers about 90 seconds apart, never several in the same second. Never pipe a launcher into `head`, because its final line dies on EPIPE.
- Start a waiter only as a background task. A trailing `&` does not wake the session.
- Check every colour, size and shape a worker adds against `DESIGN.md` before pushing. Read the worker's diff for gate edits before pushing (D95).
- After `merge-review-batch-body.mjs`, grep the body for superseded design claims that survived the merge.
- Link tickets in `orbit-api` and `orbit-landing-page` pull request bodies as `thomasluizon/orbit-tickets#N`; a bare `#N` points to that repository's issues.
- When a pull request body edit re-runs Guards, its concurrency group cancels the push's run. Read `gh run list --commit <sha>` before calling a check red.
- A pull request behind `redesign/main` may merge at its approved head after the merge result passes locally: both type checks, three Vitest suites and i18n usage for `orbit-ui-mobile` (`tools/check-i18n-usage.mjs` exists only on `redesign/main`); `dotnet build` and `dotnet test` for `orbit-api` (D115). Read test results by exit code, never by grepping summary text, because the unset locale prints the summary in Portuguese. When the base moved after the test, the result still counts if the files the base changed do not overlap the pull request's files.
- A Pullfrog approval counts only at the exact current head and only if submitted after that head's push. When a push that changes only generated or mechanical files dismisses an approval and Pullfrog's incremental review posts none, request a fresh one with `node tools/list-bot-threads.mjs --pr <n> --repo <key> --wait-seconds 900 --re-review`; never push an empty commit to force a review.
- Pullfrog and Codex share one OpenAI allowance. When exhausted, use Claude headless through the same launcher under `.claude/skills/orchestrate/SKILL.md` §5.4.1, never a subagent.
- The worker is Codex on `gpt-6.1-sol` (high effort default tier, medium mechanical) with both Claude fallback tiers on `claude-opus-5-5`, committed in `.claude/orchestrator.json` with its calibration and test pins. The Pullfrog review step runs `openai/gpt-6.1-sol` as a raw model on the stored Codex credential and the default opencode harness (the Codex CLI harness drops the reviewfrog specialist); a raw model gets no effort rung, so it runs at OpenAI's default, medium. When a published Pullfrog alias carries `gpt-6.1-sol`, bump the pin and use the alias.
- The Pullfrog console model stays "Custom (set in workflow)" in all three repositories. A model stored in the console overrides the workflow's `model` input (a stored pick resolves to `openai/gpt-6-sol` whatever the workflow says); with the console on Custom, each review logs `model: openai/gpt-6.1-sol` and `agent: opencode`. The console then shows the Smart tab with no provider, which is how it renders no stored model.
- Start every `tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs` and local check as a background task with the Bash `timeout` set to 7200000. The default background limit is 30 minutes, and reaching it kills the launcher and its worker mid-run, leaving unpushed commits or a half-finished cherry-pick.
- Gate each worker launch in the same background command that starts it: wait until the one-minute load is under 20 and 90 seconds have passed since the previous launch, holding a lock so two gated launches never start together. Checking the load in one call and launching in another lets a launch slip past the gate.
- When everything the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, the Orbit Staging internal build uploaded, and a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification through the `PushNotification` tool and make it the first line of the run's report. That is the redesign gate moment; the run stops there.
- Onboarding on the redesign ends with a step that shows the person their 7-day free Pro trial, and that step always shows, even when the person skips every earlier onboarding step. An account that is not on a trial (for example a free account that reset itself and runs onboarding again) sees an Orbit Pro paywall instead, built well and the way good apps present one, following `DESIGN.md` `## Special surfaces` (Paywall), the Pro drawing and `BRAND.md`. An account that already has Pro sees neither, and onboarding finishes normally.
- `gpt-6.1-sol` intermittently answers "Selected model is at capacity". Relaunch a worker that dies on it with a recomposed order; switch the engine to Claude only when capacity errors keep killing workers.
- Keep `CODEX_HOME` short enough for the macOS 104-byte socket limit; a longer path fails with `path must be shorter than SUN_LEN`.
- The beta fleet permits a simpler deploy order while the owner is the only user, including relaxing deploy-API-first. Keep the full code contract.
- `#74` owns existing copy. Never revisit the redesign gate's timing because of how many screens remain.

- Redesign fixes merge once the exact head has green checks, a Pullfrog approval of that head and zero unresolved threads, and then `redesign/main` is released to staging. No screenshot gate sits in front of a merge.
- Every rendered sweep scrolls each screen to its end at both widths and checks the last element clears the pinned chrome; bottom clearance is the shell's job, never a page's.
- Redesign quality is judged on the rendered app: sweep staging screen by screen, at desktop and phone width, against the `DESIGN.md` rules, the screen's drawing in `design/canvas/`, `BRAND.md` and the brain decisions, and file what is wrong. A code-only audit never counts as a sweep. Sweeps repeat after every batch of merged fixes until a full pass finds nothing.
- A sweep may create, log and delete test habits and send Astra messages in the owner's staging account. Never in production.
- Owner overrides of the drawings: Calendário is one centred column (month grid on top, the selected day below it, the view selector folded into the month header, 24px card padding), and the Calendário drawing is amended to match; the Perfil Suporte row opens the support form, not Astra; Perfil keeps its settings inline as drawn, and the duplicate Preferências, Avançado and Recursos de IA pages go; Sobre carries no internal naming note.
- Owner decisions where the drawings leave a gap (brain ADR `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`): at phone width, search opens from one icon-only ghost button at the end of the Hoje date row, and the destination title bars go; Google events stay importable as habits, and the import, review and calendar picker live in a sheet opened from Calendário, with no separate sync screen; an account on a Pro trial sees the Pro pitch on `/upgrade`, and the Assinatura dashboard is for paid Pro only.
- Every Astra write shows a preview block the person approves (approve, edit, reject) before anything changes, whatever the API's risk level for that capability; the internal risk level never renders to the person, and one write is reported once, in one block (brain ADR `Every Astra write shows a preview the person approves first.md`).
- The redesign renders the drawn Toast in the shell notice slot now; `#580` later moves it onto the headless layer. A floating control no drawing has (the web back-to-top button) is deleted, not restyled.- A deletion that removes data keeps its confirmation (`DESIGN.md` `### The core loop is never mediated`: confirmation follows reversibility, and anything that removes data carries one).
- Production web recovers a stale Server Action after a release (`#834`), and staging web does too since its carry merged.
- Every focusable control in the whole app draws exactly one focus indicator, following its own shape. A double ring anywhere (a field inside a ringed wrapper, a button inside a ringed group) is a defect, and a fix proves itself with a layout guard, not a class-name unit test.
- A fix that touches a reusable pattern (a focus rule, a toast, a sheet) is checked on every surface that uses the pattern before it merges, not only on the surface that was reported.
- The orchestrator may run the hermetic layout guard locally before pushing a pull request's guard (`npm run build -w apps/web`, then `npx playwright test --project=layout <spec>` in `apps/web` with the lockfile-pinned Chromium from `npx playwright install chromium`) to observe it red with the fix reverted and green with it. Workers never run it.
- The local merge-result check before merging a pull request that is behind `redesign/main` (rule D115 above) also runs the hermetic layout project whenever the combined change touches `apps/web`. Two pull requests that are each green alone can turn a layout spec red together (a spec from one relied on a client refetch the other removed), and the Vitest suites alone never see it.
- Approve copy with `/second-opinion` by framing the new strings as a claimed copy defect, so `DISAGREE` means approved; framing the copy itself as the claim inverts the verdict. Post the verdict on the pull request before merge.
- After every merge to `redesign/main`, an open pull request whose CI ran on the older base keeps that result: when the base gains a fix its checks need, merge `redesign/main` into the branch (the readiness loop's merge step, no rebase, no force) and push, so a new run sees the fixed base.
- A Pullfrog behaviour finding on code a carry brought from `main` is fixed on `main` first (the same code runs in production), then cherry-picked with `-x` into the carry, and the thread is answered with that fix. It is never closed by a ticket and never fixed only in the carry.
- A hermetic layout spec that needs a particular profile sets it with `setLayoutProfileSession` (`apps/web/e2e/layout/profile-session.ts`): the server preloads the profile from the session cookie, so a browser route on the profile endpoint does not reach the first render.
- A new value in a response enum is a breaking change for any client whose schema enum is strict: the client that accepts it ships first (web and an Android release), or the API sends it only to clients that declare support.
- Several approved pull requests that are behind `redesign/main` may merge on one combined local merge-result check: a scratch worktree at the base with every head merged, then `npm ci`, `npx turbo run type-check --force`, `node tools/check-i18n-usage.mjs`, `node tools/surface-manifest.mjs --check`, `node tools/check-sonar-paths.mjs`, the three Vitest suites, the web build and the hermetic layout project, all by exit code.
- The load average rule reads the one-minute figure: above 20 on 18 cores, no new worker starts.
- Hover and focus follow the control's own shape everywhere, on both platforms: a pressed or hovered row, tab, chip or button fills its whole hit area with the control's radius (never a squared or partial rectangle), and every field or code box draws one focus indicator (never a ring inside a ringed wrapper). This is the highest-priority redesign defect class; a fix covers every surface that uses the pattern and proves itself with a layout guard on web and a style test on Android.
- The web type tokens (`--fs-*`) equal the granted canvas scale (12 14 16 17 20 22 28 34 44 60); a size outside that set needs a drawing that sets it.
- The MCP OAuth authorize page served by the API is a redesign surface: it follows the Entrar and Verificacao drawings and the tokens, with the orbital mark.
- The redesign is finished only when every redesign ticket on the board is merged and closed, every service that has redesign work (web, API, landing, Android internal) is released to staging from `redesign/main`, and a full rendered sweep of staging at both widths finds nothing. Nothing redesign-related is left for later.
- When the Codex allowance runs out, switch the worker engine to Claude through `.claude/skills/orchestrate/SKILL.md` §5.4.1 (Claude tiers on `claude-opus-5-5`); the Pullfrog workflow's Claude fallback step (`anthropic/claude-opus-5-5`) reviews when the Codex step fails. Revert when Codex is available again.
- Orbit Staging's store listing icon is the redesigned mark (`design/brand/exports/play-icon-512.png`), because staging runs the redesign; production keeps its own until the redesign ships.
- Every sheet footer uses the drawn trailing pair: a ghost Cancel, then the filled action, hugging their labels at the trailing edge (`Sheet.d.ts`, `Orbit Perfil.dc.html`), on web and Android; the centred stacked full-width pair goes (`#996`).
- The redesign works on foldable and multi-screen phones: the Galaxy Z Fold cover ("passport") and inner screens, the Fold Ultra, the tri-fold and a folding phone class device. Every rendered sweep includes foldable widths (about 480, 840 and 1100 wide) besides desktop and phone.
- Staging and production install side by side: the internal track builds `org.useorbit.app.staging` ("Orbit Staging", its own Play Console app on internal testing with the same tester list as production), and open and production keep `org.useorbit.app`. The Firebase project config holding both packages is the `GOOGLE_SERVICES_JSON` secret of the `android-internal` GitHub environment only.
- Run only one local hermetic Playwright run at a time: two at once collide on the mock API port and one run never executes.
- A pull request that conflicts with its base runs no CI at all, so "settled with no failing checks" is not green until the rollup shows the workflow checks; merge the base forward first.

## The order

Reconcile the open board with these batches before each handoff. Place each new ticket exactly once. A batch completes before the next begins. Within a batch, use dependency order; drive already open pull requests first.

### Batch M: move to the new stack, before everything

The decision and its research: brain ADR `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. File one ticket per coherent piece (`repo:api`, `repo:ui` or `repo:landing`, `needs:no-conversation`) and place every one here. The batch ends when staging and production both run on the new stack, every item below is verified live, and the retired plans are cancelled.

1. Tooling: DONE. Terraform, the AWS CLI, the Render CLI, libpq (`psql`, `pg_dump`) and the Render MCP (user scope, next session) are installed and proven by read calls; AWS, Cloudflare, Render, PostHog, Sentry and Supabase all answer.
2. Infrastructure as code in `orbit-api` `infra/`: the official Render Terraform provider (`render-oss/render`) for the production and staging services, Postgres and environment groups; the AWS provider for SES; the Cloudflare provider for DNS (move `useorbit.org` DNS from Spaceship to Cloudflare, which Turnstile needs anyway). Terraform state never enters a repository (they are public): an S3 backend with native locking in the AWS account, and a local state file outside every repository until that account exists (`terraform init -migrate-state` moves it). Import the existing production API service (`srv-d6tc2isr85hc739bf75g`, Ohio) so its URL does not change.
3. Production: API web service, Next.js web service (standalone Docker image built in GitHub Actions, pushed to GHCR, deployed by digest), landing as a Render static site, Render Postgres 17 in the same region. Size from measured use (the API averaged 0.004 CPU and 343 MB over 30 days): API and web at 0.5 CPU / 512 MB, Postgres 1 GB; raise the API to 1 CPU / 2 GB when memory nears its limit.
4. Staging: web on the free plan; API on the free plan with a scheduled `/health` ping every 5 minutes only between 08:00 and 24:00 America/Sao_Paulo (the 750 free instance hours a month are shared by every free service); Postgres on the free plan, recreated and re-seeded by a scheduled workflow every 4 weeks (free databases expire 30 days after creation). Staging deploys only through `release.yml` with a selected branch, never automatically.
5. Data: copy the production database from Supabase to Render Postgres (schema and data, including `hangfire`) in a short maintenance window, verify row counts table by table, switch the API connection string, and verify the live app end to end.
6. Google sign-in in the API, web and Android, including the calendar scopes, replacing Supabase Auth. Keep the Supabase Auth path working for installed Android builds until `AppConfig.MinSupportedVersion` passes the first build with the new sign-in (expand, then contract). Add the new redirect URIs to the existing Google OAuth client.
7. Email on Amazon SES: verified domain with DKIM through Terraform, production access, bounce and complaint handling, and the waitlist contacts moved from Resend into Orbit's own database.
8. Release workflows: one manually run `release.yml` per repository with an environment input (`production` always `main`; `staging` any selected branch): `orbit-api` builds, runs the EF Core migration bundle, deploys, checks health and records a GitHub Deployment; `orbit-ui-mobile` builds and deploys the web image; `orbit-landing-page` deploys the landing. `android-release.yml` keeps a track input with only open, production (both `main`, production API) and internal (a selected branch, staging API). The current `deploy-api.yml`, `deploy-web.yml`, `web-image.yml` and `deploy-landing.yml` are folded into these and deleted. Render and Vercel auto-deploy are off.
9. The `/release` skill in `orbit-ui-mobile`: for production, compare each service's last production deployment with `main` (API, web, landing, Android), deploy only the services with undeployed changes, in that order, wait for each and verify it; for staging, take a branch and deploy it to the staging services the same way.
10. Cutover and retirement: move `app.useorbit.org` and `useorbit.org` to Render, then cancel Vercel Pro and remove its domains; cancel Resend Pro after SES is live; pause the Supabase project after its Auth path is retired, keeping a final database dump. Once the owner signs off on the verified migration, delete the retired projects and cancel every retired subscription so nothing stale stays active; a permanent deletion that only a browser can do is the owner's click. Record each step in the brain.

Owner rules for Batch M: the production copy loses zero rows (writes frozen during the dump, every table verified by row count and checksum, Supabase paused until sign-off); staging seeds sample data for the owner's account only; PostHog replaces Vercel Analytics and Speed Insights; both databases stay reachable through the Render MCP and `psql`; MCPs, CLIs and APIs come before the browser.

Tickets, in dependency order (every other Batch M ticket is closed):

- `#943` (`repo:api`, on `main`) Retire the Resend email provider: delete the Resend code and configuration, make SES the only provider, then carry it by `#746`.
- Email runs on Amazon SES in both environments: production access is granted, `Email__Provider` is `Ses` in both API environment groups, both SES dead-letter alarm topics email `contact@useorbit.org` (confirmed), and Resend Pro is cancelled (ends at its billing date; the free tier stays for rollback until `#943` lands). After `#943`, list the retired projects for the owner's delete click: the two Vercel Orbit projects, the paused Supabase project, and Resend.

### Batch R: the owner's redesign review, and sweeps until nothing is wrong

The owner reviewed staging (`redesign/main`) and his phone build and found the redesign far from the drawings and `DESIGN.md`. Everything he reported gets fixed, and the rendered sweeps (standing rule above) continue until a full pass finds nothing. This batch outranks every later batch. Tickets that fix a shipped defect land on `main` first and are carried into `redesign/main` through `#556` (UI) or `#746` (API); every other ticket lands on `redesign/main`.

Open pull requests first, in this order (heads are leads; re-read each). Each merges on the bar; a pull request behind its base merges after the local merge-result check.

- `#850` habit detail rescue proposal and free upgrade card: `ui#1351` at `725228af`, approved, 0 unresolved, copy approved by `/second-opinion` (DISAGREE posted on the pull request). `#964` pinned trailing-pair sheet footers: `ui#1354` at `49bdc8df`, approved. `#966` mobile year picker through the shared sheet: `ui#1355` at `a1643838`, approved. All three passed ONE combined local merge-result check onto `ea06bc35` (npm ci, type-check, i18n usage, surface manifest, Sonar paths, three Vitest suites, web build, hermetic layout, all exit 0): if `redesign/main` has not moved past `ea06bc35` and their heads are unchanged, merge all three; otherwise re-run the combined check first. Then complete `#850`, `#964` and `#966`.
- `#951` send and focus open the Astra conversation: `ui#1356` at `2087a4e4`. Pullfrog did not approve (one P1 thread: the composer effect refocuses the field on every `inputDisabled` transition, even after the person focuses another control) and the required `Upgrade layout geometry` check is red: read the run, fix both in one review batch.
- `#941` backport to `main`: `ui#1357` (base `main`) at `26a445e4`. Pullfrog requested changes (P1: a pending flexible skip sets `isCompleted: true` with unmet weekly progress, so the new rule counts a skipped flexible habit done). The same rule already merged on `redesign/main` (`ea06bc35`, `ui#1353`): fix it on `main` in `ui#1357`, then carry the fix into `redesign/main` (rule above). After `ui#1357` merges, release production web (it also ships Next.js 16.3.6, merged as `ui#1350`) and ship an Android open-track build, then close `#941`.
- `#936` HabitRow disclosure controls link their panels: `ui#1358` at `c43f9c61`; waiting for CI and its first review.

Then the filed tickets, highest first. Before a new ticket starts, check its files against the open pull requests; a ticket whose files overlap one waits for that one to merge (the shared i18n JSON files do not count):

- The standing `#556` sync (running at handoff, worktree `ticket-556-carry-staging-id-push`, 12 commits ahead of its base at handoff): carries `main`'s `#1327` (staging application id), `#1335`, `#1338` (take `main`'s onError), `#1339` (`#889`, close it when this carry merges), `#1341`, `#1346`, `#1347` (contract snapshot; keep `redesign/main`'s pin if the two differ), `#1342` (web push worker, adapted onto the Perfil notification row and the redesign's Astra conversation) and `#1348` (Pullfrog workflow). The next sync after it carries `#1350` (Next.js 16.3.6) and the `#941` backport.
- `#952` The composer input keeps its width, recording replaces the field with the drawn row, no empty band above the FAB (after `ui#1356`; same composer files).
- `#970` Web hover fills move off the elevation ladder; an opaque control layers `--bg-hover` over its resting fill (decided on the ticket; after `ui#1355` and `#947`, which share `calendar-shell.tsx` and `globals.css`).
- `#965` Give the sheet body one owner for its bottom padding (after `ui#1354`; same sheet files).
- `#947` Web `--fs-*` tokens equal the canvas scale (running at handoff, worktree `ticket-947-type-scale`).
- `#958` Foldables: the Android app and web work on the Galaxy Z Fold cover and inner screens, the tri-fold and a folding phone class device (after the `#556` carry of `#1327`).
- `#961` (`repo:api`) Play purchases from `org.useorbit.app.staging` verify on the staging API: staging `GooglePlay__PackageName`, Orbit Staging subscription products and notifications (after the first staging upload).
- `#841` The Astra dock, tab bar and Today column cap at 740 in the narrow shell (after `ui#1356`; shared composer and shell files).
- `#847` The create habit form: dismissal, one focus ring per field, the understood block, `Mais detalhes`, the discard prompt (after `ui#1354`).
- `#851` Every sheet's action row in the pinned footer (blocked by `#847`).
- `#892` Habit creation is the drawn pushed screen, not a dialog (blocked by `#847` and `#851`).
- `#967` Stop the pending operation card identity sheet test depending on test order (running at handoff, worktree `ticket-967-identity-sheet-test`), then `#1004` (reset shared account and modal state in shuffled web tests) and `#1005` (release Chrome geometry resources before suite teardown times out), both from the same shuffled-suite investigation.
- `#993` The empty Astra conversation overflows its scroll area on a short desktop panel (after `ui#1356`; same conversation file).
- `#973` The Avisos clear-all confirmation's drawn inline action pair.
- `#974`, `#975`, `#976`, `#977` The press-shape follow-ups from `#949` (fill across the whole hit box, the mobile guard reading nested pressed styles, every web hover behind the pointer query, Android press fill parity); `#974` after `#947` (`globals.css`).
- `#979` Verb plus habit title labels that read correctly for a verb title.
- `#982`, `#983` Wrapped: the player and cover when the recap changes mid-session, and the back control over the cover mark on short screens.
- `#989` Reload guidance on step-up, open sheets, the command palette and onboarding.
- `#990` The reload banner says its message once (copy).
- `#991` Close the web import prompts through the sheet's dismissal.
- `#992` Delete the overlay-bleed rule no element can activate.
- `#986` Guard the web account deletion modal when offline.
- `#980` (`repo:api`) Every held Astra write edits its fields behind the tool's own argument check (running at handoff, worktree `orbit-api` `ticket-980-held-write-edits`, base `redesign/main`).
- `#984` (`repo:api`, on `main`) Every sub-habit log date in the calendar-month response (flexible, finished one-time and completed recurring sub-habits), then `#985` (UI) shows them.
- `#988` (on `main`) One reload message on web, not a toast and a banner; `#978` names the same defect: close one as a duplicate of the other.
- `#987` (on `main`) One account refetch when a tab returns after the stale time.
- `#994` (on `main`) Release the browser's push subscription before web onboarding replaces it and on sign-out.
- `#996` Every sheet footer takes the drawn trailing pair (owner decision; `ui#1354` already converts the footers it pins and `DialogActionPair`): verify the rest, move `ConfirmSheet`, add the `DESIGN.md` sentence; `#997` one separation device at the sheet footer boundary; `#998` the referral drawer lines up with its pinned Share and loses the dead overlay-bleed rule; `#999` the prompt footers' quiet second action built one way on both platforms. All after `ui#1354` merges.
- `#995` Web text fields hover: the perimeter ring steps from `--border-control` to `--hairline-strong` behind the pointer query (decided on the ticket); after `#976`.
- `#1001` An autofilled dark field repaints the opaque field fill so its focus and error rings clear 3:1 (decided on the ticket).
- `#1000` The habit form submit stays enabled until the request starts.
- Onboarding trial step and paywall (owner requirement, standing rule above; file it with `/ticket` as `repo:ui` on `redesign/main`, plus an API ticket if the trial state or eligibility the onboarding needs is not already in the profile contract): the last onboarding step shows the 7-day free Pro trial and always shows, even after a skip; an account not on a trial sees the Orbit Pro paywall there; a Pro account sees neither. Write its copy against `BRAND.md` and approve it with `/second-opinion`.
- `#972` (`repo:api`) Keep pre-redesign Android builds off held Astra writes they cannot preview: at the redesign merge to `main`, before the production API release that carries `#893`.

Then the Android internal build: once the `#556` carry merges, release `redesign/main` to staging and ship an internal build from `redesign/main` through `/android-release`; it is the first build of `org.useorbit.app.staging` (Orbit Staging), installs beside the production Orbit on the owner's phone, and publishes the Orbit Staging store listing, whose redesigned icon is saved as a draft. The owner is waiting for it.

Decisions this batch took that bind the rest of it: a drawn string beats a ticket paraphrase and a worker's second-opinion dissent (the orchestrator frames `/second-opinion` as a claimed defect, so DISAGREE approves); the pt-BR slipping line keeps the drawn "Nenhum registro", matching the app's pt-BR "Registros" for completions; the rescue card, slipping line and proposal request show only for a good habit (the API never marks a bad habit overdue); the pt-BR delete verb is "Apagar" everywhere; an existing type token may replace a drawn size that cannot fit the longest locale value (`--fs-lg` for the best-day tile); the Perfil "Análise de uso" switch stays; the Perfil persistent reminder row and its feature are deleted; a flexible habit is done for the day once logged; a toast host follows the topmost open modal; the sign-in column is centred vertically at phone width and the Entrar and Verificacao drawings are amended to match; a control with an opaque resting fill layers `--bg-hover` over that fill on hover (no new token); the MCP pending Google sign-in store is capped at 1,000 with eviction on insert; every sheet footer uses the drawn trailing pair (ghost Cancel, then the filled action, hugging their labels at the trailing edge); the focus-ring layout guards count a ring drawn by a `::before` or `::after` pseudo-element and still flag a wrapper-plus-pseudo double ring.

Unverified findings, reproduce before filing: two copies of Habit detail stay on screen after a client navigation from Hoje in a hidden browser window (re-check in a visible window). The not-found page shows Today's composer chips; confirm whether the drawing wants chips there. A production post-deploy smoke run once failed create-habit, log-habit and Astra send with the page not reacting, and its rerun on the same deploy passed; file it with both runs if it fails again.

Sweep coverage: staging web runs `redesign/main` `ea06bc35` and the staging API `e0cec58a` (read `/api/health` and `/health`). `#949` is merged, so the full rendered sweep is due: every screen at desktop, phone and foldable widths (about 480, 840 and 1100 wide), scrolled to the end, including a real Chrome autofill check on a field (it needs a page where Chrome offers a saved value; never sign the owner's staging session out). The owner's staging account holds "Ler 10 minutos" (daily 21:00) and others; delete "Ler 10 minutos" once sweeps no longer need it.

### Batch 0a: DONE

`#585` closed; `node tools/test-tools.mjs` takes `--only <name>`.

### Batch E: Supabase egress, first

The project hit its monthly Supabase egress quota. This batch outranks every later batch except driving
already open pull requests to merge.

1. Measure: read `pg_stat_statements` through the Supabase connector (or `/audit-performance`'s
   measurement mode) and rank query shapes by rows and bytes returned, then map each shape to the API
   code path that issues it.
2. Look for the waste classes directly in `orbit-api` and both apps: an N+1 loop that issues one query
   per item where one bulk query serves, a read that returns far more rows or columns than the caller
   uses, an unbounded list query, polling, and duplicate client refetches.
3. File one ticket per root cause (`repo:api` or `repo:ui`, `needs:no-conversation`), place it here,
   and fix the largest by bytes first. Each pull request carries the before and after measurement.
4. The batch ends when the top ranked shapes are fixed or proven necessary, and the remaining egress
   per active user is recorded in the Current state section.

The first root causes (#742 Today log window, #743 streak and achievement projections, #744 scheduler
projections, #745 warm connection pools), the client notification poll (#759) and the client habit
refetch fix (#758) are merged on `main`. A per-shape delta (two `pg_stat_statements` snapshots 59
minutes apart, plus the shapes whose `stats_since` falls after the latest deploys) showed every old
large shape stopped growing. What still grew became four tickets: `#760` (reminder scheduler probe, 48 rows to 1 per call), `#761` (one schedule load per log), `#762` (completion dates from projected dates) and `#763` (daily summary columns and dates), all merged on `main`. One account holds about 4,650 of
the 5,033 logs and 996 habits, so per-call cost tracks that account.

Later fixes, all merged and deployed on `main` and carried to `redesign/main`: `#790` (the Today schedule reads 19 candidate columns and full rows only for the page; 167 B instead of 348 B per candidate row), `#791` (page rows keep the schedule fields they were filtered on) and `#792` (Today log facts as day-offset arrays; the busiest account's facts fell from 88,369 to 32,385 bytes per call). `#762` and `#745` are recorded and closed (Supavisor authentications 5,088 to 532 per day).

- `#763` The daily summary reads 366 days of full log rows; overdue detection needs every date it inspects, so the saving is columns and dates, not one row per habit. Its after shape (the `jsonb_to_recordset` summary reader) has run only for accounts with no windows; record rows per call on the ticket once the busiest account requests a summary, then close it
- After real use resumes, record on `#790` and `#792` the after-deploy rows per call of the candidate read and the facts read, and record the remaining egress per active user in the Current state section from the Supabase usage page (organization usage, Egress per day) divided by the day's active accounts. Rows come from `pg_stat_statements`; bytes are rows times the `pg_column_size` width of the selected columns. The next shapes to check are the full `Users` row reads (queryid 4312627288915722739, about 11 rows per call, and -4857207453161324362, one row per call) and the per-user schedule projection (8385022281071737821, about 611 rows of 91 B per call)

### Batch 0b: the harness, before the redesign

These are the gates every later batch runs through. Re-read each ticket against the tree before building it, and never
file a harness ticket as a substitute for a fix.

- `#556` The standing `main` into `redesign/main` sync; the next sync carries every `main` merge since the last one
- `#746` The standing `orbit-api` `main` into `redesign/main` sync; the next sync carries every `main` merge since the last one
- `#926` Delete the redesign drift merge job that fails on every `main` push

The contract rebaseline App (`#702`) is done: its pull requests now start every required check. The redesign rebaseline passes the App key to its reusable workflow (`#787`): dispatch `redesign-drift.yml` on `redesign/main` after each orbit-api `redesign/main` merge that changes the contract. Worktree teardown accepts clean local base merges (`#785`) and merged carry worktrees of the standing tickets listed in `tickets.standing` (`#786`); a closed, unmerged ledger row with a blocker and `closed: true` ends a sleep run BLOCKED (`#788`), and an explicit `closed: false` reopens it (`#789`).

### Batch 0c: live defects in the shipped product, on `main`

Defects a person hits in the shipped build today (web on `main`, Android from `main`, the `orbit-api`
`main` deploy). They target `main` under D99 and the route-by-subject rule; an Android fix is followed by
`/android-release` to the open track.

- `#566` Resolve orphan offline IDs before reorder mutations expire (merged; closes after seven days without ORBIT-MOBILE-5 on the carrying release)
- `#134` Habit row three-dot menu does not reliably open on Android (verify on a device, then close)
- File a ticket and fix: on production web Today, a habit's three-dot menu once stayed open while a second habit's menu opened below it, so two menus showed at once (not reproducible on demand; investigate the menu open state and outside-dismiss logic on both platforms)
- `#565` Root-cause the Today-page non-array map failure (map the minified frame from the release's own build first; never add a blanket guard)
- `#903` (`repo:api`) Calendário marks a flexible habit missed on days when nothing was due (every projected day of its window is sent); fix in the month query on `main`, then carry by `#746`
- `#390` Restore deferred bulk mutations and settle parents from the replay once the API is idempotent

### Batch 1: close the redesign

Every ticket whose work lands on `redesign/main` in either code repository, including the API halves the
redesign screens wait on. **This batch ends** when `node tools/redesign-coverage.mjs` reports a valid mapping
AND every screen ticket closes against its own acceptance criteria.

DONE: `#784` and `#682` merged; `node tools/redesign-coverage.mjs` reports a valid mapping (201 manifest surfaces accounted for, 15 deleted, 3 excluded).

### THE REDESIGN GATE, between batch 1 and batch 2a

Unchanged and absolute. Once every screen ticket is done, a run **stops** and ships a closed Play
INTERNAL build off `redesign/main` for the owner to test as a real update. It does not merge to `main`
and does not start the next batch. **Only the owner's approval merges `redesign/main` to `main`.**

The gate runs on the new staging after Batch M: the run deploys `redesign/main` of both repositories to staging through `release.yml` with that branch selected, and ships the gate test build from `redesign/main` to the internal track with the staging API baked in. The run deploys it, verifies it, and stops for the owner's approval.

**The merge carries one protection change in the same moment.** `main` requires
`Suppressions Ratchet` again, because `main` still has both `eslint-suppressions.json` baselines and
no `Lint Severity` job, so the `#617` swap had made every pull request to `main` unmergeable. The
`redesign/main` into `main` pull request deletes the ratchet and brings `Lint Severity`, so swap the
required context back to `Lint Severity` when that pull request is ready to merge. Payload shape:
`gh api -X PATCH repos/thomasluizon/orbit-ui-mobile/branches/main/protection/required_status_checks
--input <json>` with `{strict: true, checks: [{context, app_id}]}` (`app_id` 15368 for Actions).

The same merge must keep `main`'s scheduled contract rebaseline: `redesign/main`'s `.github/workflows/contract-rebaseline.yml` is the `workflow_call`-only redesign copy (it checks out `redesign/main`), so a plain merge would drop `main`'s six-hourly run. Keep `main`'s scheduled workflow and retire or rename the redesign copy in that pull request.

### Batch 2a: the API contracts the UI is waiting on

API first, deploy, then the UI half in 2b.

- `#483` Yearly gap repair needs the streak engine's own window widened
- `#606` Give every FluentValidation rule an error code and localized copy
- `#387` Add a from and to range to the habit logs endpoint so a habit's full history is readable
- `#394` Expose the stable recurrence origin on the habit detail response
- `#385` Return the discount-aware billed amount on the billing details response
- `#179` Add a bulk reparent endpoint so a selected set of habits moves in one request
- `#257` Add optional habitIds to the shared create-goal contract
- `#259` Test create_goal enforces MaxHabitsPerGoal on the Astra path
- `#28` Make the referral reward platform-agnostic Pro days with an atomic idempotent grant

### Batch 2b: every remaining ticket that changes what a person sees

Includes the packaging changes (milestone "Packaging: caps, quotas and tiers") and the PostHog flags and
analytics work.

- `#395` Anchor habit history on the stable recurrence origin once the API exposes it (after `#394` deploys)
- `#386` Show the billed charge on the subscription screen once the API returns it (after `#385` deploys)
- `#181` Bulk-move selected habits, and open the move picker at the habit's current position (after `#179` deploys)
- `#62` Show and explain the Pro-days referral reward on the surfaces users actually see (after `#28` deploys)
- `#222` Linking a habit becomes the primary route into creating a goal
- `#195` Habit-limit paywall copy removed; new at-capacity state
- `#196` AI quota copy becomes daily across web and mobile
- `#197` Retrospective unlocks on any Pro plan; remove the yearlyPro entitlement
- `#237` Sub-habits leave Pro: remove the server gate and unseed the flag
- `#238` Sub-habits leave Pro (UI): drop the matrix row and the copy that sells depth (with `#237`)
- `#82` Migrate feature flags to a PostHog-backed provider behind a switch (expand phase)
- `#213` Define the retention cohort and stand up the recurring read
- `#25` Consume PostHog feature flags on web and mobile and wire the Astra kill switch

### Batch 3: the landing page and the Play listing, together

- `#78` Redesign the landing page against the new canon (L2)
- `#204` Fix the landing today: real numbers, drop the payer stat, drop the badge and the two missing spaces
- `#209` Landing pricing and FAQ copy realigned to the new packaging
- `#212` Add llms.txt to the landing for the AI crawlers robots.txt already invites
- `#269` Waitlist Turnstile can render two widgets into one container, orphaning the first
- `#270` A transient Turnstile script-load failure disables the waitlist form with no retry path
- `#271` Waitlist Turnstile receives pt-BR where Cloudflare documents pt-br, so the widget may render in English
- `#272` PUBLIC_TURNSTILE_SITE_KEY is undocumented, so a build without it silently disables waitlist signups
- `#273` Turnstile error-callback fights its own auto-retry, forcing a reset loop on any persistent widget error
- `#274` Turnstile flexible size overflows its clipped card below a 374px viewport
- `#275` Missing Turnstile sitekey re-announces the same error to screen readers on every keystroke
- `#276` Turnstile widget keeps its first language and does not follow the runtime language toggle
- `#277` Recovered Turnstile challenge leaves stale failure copy above an enabled submit button
- `#278` Turnstile init hangs silently when the script loads but never executes: no load fallback, no timeout
- `#280` Landing analytics consent cannot be withdrawn once granted: no manage-consent affordance
- `#282` A CTA click between consent grant and PostHog readiness is silently dropped
- `#285` Fixing the Lighthouse blocklist silently dropped the accessibility gate from the waitlist-confirmed page
- `#286` The 404 Lighthouse carve-out records what it excludes but not the measurement that justifies it
- `#292` A failed Turnstile script load re-appends a script tag on every input event, with no backoff or attempt cap
- `#313` Turnstile error codes are discarded, so a hard failure like 400020 reaches no log and no human
- `#328` Move goals to the free plan on the landing pricing table
- `#249` BRAND.md copy and format cleanups from the ORB-209 review

### Batch 4: the component-library migration

D101, and strictly after the redesign ships.

- `#576` Put a headless behaviour layer under our primitives: rn-primitives on mobile, Radix on web, one shape
- `#577` Rebuild the anchored menus and popovers on the headless layer, both platforms
- `#578` Rebuild the confirm and general dialogs on the headless layer, both platforms
- `#579` Rebuild the select and the pickers on the headless layer, both platforms
- `#580` Rebuild the toast, tabs and form controls on the headless layer, both platforms
- `#581` Build the Astra chat surface from beautifului.dev, on both platforms where it can run

### Batch 5: Astra

Milestone "562 Astra" and every Astra or MCP tool ticket not already in Batch 1.

- `#16` Cut Astra chat input tokens roughly 35 percent via tool gating, schema trim, and a smaller history window
- `#17` Harden MCP auth and wire content moderation into the chat and MCP input paths
- `#18` Bound per-user AI spend and close the residual MCP authz gaps: tool-boundary scope check, ownership map, idempotency, distributed OAuth code store
- `#19` Execute Astra bulk intents server side on the full matching set and report the true affected count
- `#21` Constrain Astra free text answers to tool returned facts
- `#23` Localize Astra tool result card text via structured message keys in the contract
- `#24` Chat surface UX: Stage 1, localized tool-result cards, which needs the `#23` message keys (Stages 2 and 3 are merged on `redesign/main`)
- `#26` Build the Astra prompt to behavior eval harness and gate launch on it
- `#48` Ground the Astra daily summary in real multi-day adherence data
- `#49` Localize the Astra action-chip labels for UpdateChecklist and the other unmapped tool types
- `#201` Persist Astra conversations so failures are debuggable
- `#202` Astra builds an invalid payload for date-specific tasks
- `#236` Astra tells free users that XP, levels and streak freezes are Pro. They are not.
- `#244` Astra crashes the chat turn when asked to log a habit already logged for that date
- `#245` The agent audit write commits the caller's uncommitted work and loses the row when it matters
- `#246` Astra cannot unmark a habit: add unlog_habit
- `#247` Astra logs habits that are not due, because its habit listing never says so
- `#248` The habit list does not refresh after Astra unmarks a habit
- `#254` Chat habit-tool follow-ups from ORB-23: unproven ownership scoping, changed failure contract, test gaps
- `#260` CanSendAiMessage is orphaned after the atomic reservation migration
- `#264` Every added limiter test calls TryApplyMcpRateLimitsAsync directly, so removing the new middleware invocation leaves the suite green while restoring an unbounded MCP endpoint.
- `#265` The new get_retrospective AI classification has no rate-limit regression test, so deleting or misspelling that entry leaves every test green and gives the AI tool the general limit.
- `#396` Register an AI tool for the proactive Astra setting so Astra can change it
- `#418` Let Astra retry a rejected tool call safely, without trusting the model to identify the retry
- `#514` Extend the #318 capability inventory to the MCP surface and to field level, and file the gaps
- `#582` Move Astra to the current cheap model tier and send a per-user prompt cache key
- `#583` Make every Astra tool schema strict, with enums for every closed set of values
- `#584` Emit one PostHog LLM analytics event per Astra model call

### Batch 6: security, correctness and the deletions

- `#101` Cut the access token lifetime to 15 minutes and make logout actually revoke it
- `#102` Close the account enumeration timing split in the user provisioning path
- `#114` Partition the anonymous auth and waitlist rate limits by IP as well as email
- `#115` Cancel the Stripe and Play subscription when a user confirms account deletion
- `#568` Make destructive EF schema changes safe across rolling deploys
- `#753` Drop the legacy AdMob privacy disclosure once 1.3.35 is the minimum supported version
- `#765` Drop the ad reward profile field and user columns once 1.3.35 is the minimum supported version (expand-contract; waits on the same `MinSupportedVersion` raise as `#753`)
- `#732` Remove the legacy bulk replay lookup once the `#727` deploy has aged past the 30-day idempotency retention window
- `#718` Drop the habit-log slip insert trigger and make `IsSlip` non-nullable after the `#665` deploy replaces old instances
- `#621` Stop controllerActions reading as enforcement, because 51 capabilities declare it and nothing reads it at request time
- `#623` Give BuildLegacyMatchKey one definition, because the writer and the reader each carry their own copy
- `#626` Make the calendar reconciler and the suggestion writer agree on an unrepresentable projection
- `#660` Refuse access tokens without a session claim once pre-deploy tokens have expired
- `#685` Delete the colour-scheme write path once no supported client writes it (ORBIT-API-5)
- `#687` Confirm MCP over OAuth enforces the same Pro gate as API keys
- `#218` Delete the social layer (API), part 1: challenges and accountability
- `#235` Delete AI memory (API): UserFacts, AiFactExtractionBatches, the batch poller, 3 chat tools, 3 MCP tools and the Pro gate
- `#239` Delete the social layer (API), part 2: friend graph, feed, cheers, blocks, reports, public profile and the drop migration
- `#230` API gate parity, part 2: clear the hand-written pragmas and `SuppressMessage` attributes (after `#235` and `#239` delete the code they sit in)
- `#227` Habit model: split StartDate from NextDueDate and replace the three flags with enum HabitSchedule
- `#205` Behaviour test suite for Google Calendar import and auto-sync
- `#251` Re-exclude _next/static and _next/image from the web proxy matcher
- `#206` Serve a real robots.txt on the web app and stop the auth proxy swallowing root text files
- `#208` Turn on 3D Secure for the Stripe card flow
- `#262` The end-date reactivation gate is not exercised through UpdateHabitCommandHandler, so removing the new handler call would leave all added tests green and allow at-cap reactivation through PUT /api/habits/{id}.
- `#255` Parent-prompt follow-ups from ORB-86: isFlexible check, re-prompt guard cleared on every fetch, frozen test clock
- `#279` The privacy policy discloses no cookie or consent information, so the landing consent banner cannot obtain informed consent
- `#301` Sweep the 13 surviving social references ORB-201 part 1 left behind
- `#302` Legacy buddies-tab notifications fall to the default glyph after ORB-201 part 1

### Batch 7: the production readiness run

`/prod-readiness`, then fix what it finds, then ship. The launch chores that require the owner
(`#33` demo clips, `#89` account migration) sit here too.

- `#315` Run /prod-readiness once the board is clear
- `#31` Triage and root-cause every open orbit-api Sentry issue
- `#32` Triage and root-cause the open web and mobile Sentry issues
- `#33` Record the 7 demo clips and 2 landing videos
- `#89` Map and migrate every third-party account onto contact@useorbit.org
- `#311` Recheck the image-size advisories once a fixed version ships

## How the work runs

Use `/sleep` for unattended work and `/orchestrate` for one ticket at a time. Pullfrog reviews each pull request. Use the current head, latest review and required checks to decide readiness. `/handoff` updates this spec and overwrites `.claude/handoffs/NEXT.md`; it does not append a session chapter. Read `.claude/skills/orchestrate/SKILL.md`, `.claude/skills/handoff/SKILL.md` and `CLAUDE.md` for operating detail.

## Decision pointers

Open these brain notes BEFORE acting, through the Obsidian MCP (`mcp__obsidian__obsidian_list_notes`,
`mcp__obsidian__obsidian_get_note`, and `mcp__obsidian__obsidian_search_notes` when only the idea is
known); `cat` and `ls` miss the frontmatter and backlinks that record which decision superseded which.
They live under `2 Areas/20-29 Orbit Engineering/Decisions/`. A filename is a lead: list the directory
and copy the names that come back.

- `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (Batch M; supersedes the next one)
- `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` (Batch R owner decisions)
- `Every Astra write shows a preview the person approves first.md` (Batch R owner decision on Astra writes)
- `Pro is Astra without the daily ceiling, and goals leave the paywall.md` and `Price Orbit at 9.99 USD and gate depth never the core loop.md` (what the onboarding trial step and paywall sell, and at what price)
- `Keep Supabase and fix the unbounded habit-list query rather than migrate.md` (the egress batch; superseded for hosting)
- the redesign gate ADR (search the directory for `redesign gate ships a closed internal build`)
- `Run the rest of the redesign unattended and review it once as a whole.md`
- `Redesign PRs target redesign-main only until the redesign ships.md` and `The shipping branch outranks the redesign when the machine cannot run both.md` (branch routing)
- `An idempotency key for an AI tool retry binds to call position never to model-generated arguments.md`
- `An AI tool action reuses the app's own command never a raw repository call.md`
- `A shared timeless-text gate blocks a machine path an owner name and a dated anecdote across all three repos.md`
- `Gate new ticket work when shared CI and review capacity is full.md` and `An unattended run caps its own CI demand in code and waits on CI through a registered wake source.md`
- `A written instruction is the authorization ship on it without asking again.md` and the product-questions ADR (search for `product questions only, settle engineering calls`)
- `Reproduce a device bug on the exact shipped build before calling it fixed.md`
- `Put rn-primitives and Radix Primitives under Orbit's own styling instead of adopting a universal UI kit.md` (Batch 4)
- `The Orbit workflow decision register (D1 to D42).md` for the older numbered decisions

Current operational rules above take precedence when a record conflicts.

## Constraints

- `apps/mobile/android/` is Expo prebuild output. Native fixes belong in app config or a config plugin.
- Mobile ICU syntax treats an apostrophe before `{`, `}` or `#` as a quote. Double it when the apostrophe must render. Test mobile strings through the app's i18n instance.
- Account deletion deactivates with a bounded grace period. Sign-in cancels deactivation; never claim deletion has no recovery.
- A streak freeze is banked automatically and spent by hand. `RepairableGapDates` does not depend on the freeze bank.
- `useCalendarEvents` is a bounded manual-import feed, not a complete events endpoint. The events API reports the event timezone.
- Retrospective access is controlled by the API setting; clients read the server answer rather than hard-coding Pro access.
- A Server Action strips thrown errors to `digest`; return serializable `ActionResult` values across that boundary.
- An Android accessibility node with zero opacity or fully off-screen is ignored. Use `AccessibilityInfo.announceForAccessibility` for announcements.
- Expo SAF copy deletes an existing destination document. Copy into the directory with the correctly named source.
- Android's key map emits arrow keys but no Home or End key names.
- `Harness Calibration` hashes complete normalized file content. Reseed after changing calibrated files and reconsider the verdict.
- `local/*` lint rules run at `error` with zero violations. Do not restore a suppression baseline or weaken a rule. Sweep callers before changing a shared primitive.
- A closed allowlist only shrinks. When a fix removes suppressions, lower `orbit-api` `tools/suppression-allowlist.json` to the observed count.
- Put parity mirror hook pairs in `sonar.cpd.exclusions`. Shared logic belongs in a React-free core in `packages/shared`; each app keeps only its React wiring.
- SonarCloud's API refuses pull requests targeting `redesign/main`. Read its gate from the check run's `output.summary`.
- Run the `orbit-api` suite with `LANG` unset and with `LC_ALL=en_US.UTF-8` to catch host-culture formatting.
- Run both harness suites after `.claude/**` changes: `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`.
- Pullfrog readiness depends on the last review of the exact head and the newest `pullfrog-approval` check. Review body findings count even when unresolved thread count is zero.
- A `parity:exempt` label does not change a run created before the label. Trigger a fresh pull request event after applying it.
- Regenerate the surface manifest when a drawn surface changes; record deleted IDs with their decision in `tools/redesign-groups.json`.
- Use `npx turbo run type-check --force` for evidence when cache freshness matters. Run type checks from the repository root.
- Installed dependencies are read-only evidence. Check their integrity with `node tools/check-dependency-edits.mjs` before citing them.
- `orbit-api` no longer commits `architecture.json` or `architecture.html`; run `node tools/arch-map.mjs` there before reading the map. The `drift` job only proves the generator runs.
- Workers often forget the `parity:exempt` label on a one-sided mobile change; Cross-Platform Parity then fails until the label and a `## Parity` line are added (`#736` moves the check into delivery).
- A worker branch has a launch cap of two; a review-fix relaunch beyond it needs `--relaunch-reason`, or the launcher refuses without starting a worker.
- Admission refuses new ticket work when open pull requests plus live reservations exceed ten across the three repositories; review fixes on open pull requests are still admitted.
- Every deploy goes through the manual `release.yml` of its repository (`production` from `main`, `staging` from a selected branch, always dispatched with `--ref main`) and `android-release.yml` (open and production from `main`, internal from a selected branch), run by `/release`. Render auto-deploy is off for every service.
- Render provider v1.9.1 turns a digest image path into a tag on any web service update, so an existing web service is never updated through Terraform; the release workflows own web digests (`ignore_changes` on the digest) and the `#814` guard rejects in-place web service updates before apply.
- Staging services: `orbit-api-staging`, `orbit-web-staging` (`srv-dass1t0jo6nc73d5s340`) and `orbit-landing-staging` deploy only through `release.yml` with a selected branch; today they run `redesign/main`.
- Staging billing runs on Stripe test mode: product, four prices and the webhook exist, with ids and secrets in SSM `/orbit/staging/api/Stripe__*`; `Stripe:PublishableKey` was deleted because nothing read it.
- A `gh issue list --search` call spends the separate search rate limit and can fail while the GraphQL budget is fine; probe `rateLimit` before concluding GraphQL is exhausted, and filter REST issue listings locally instead.
- `useorbit.org` DNS is served by Cloudflare (zone `3f80ecc2735314886702b6643b15d150`, nameservers `candy` and `tom`). Cloudflare DNSSEC signs the zone (KSK key tag 2371, algorithm 13); its DS record (digest type 2, digest `550CC9A0902AC2319B30F903A53F7D487E2172A4B2E65C587348A0867EC2DC46`) is added at Spaceship > useorbit.org > DNSSEC. Never add a DS whose zone is not the delegated, signed one: that breaks resolution for validating resolvers.
- Apply Terraform only with `-target` lists that exclude the web services and the production API service unless the change is intended; a full plan still carries items that need a release first.
- The repositories stay public: GitHub-hosted CI is free only for public repositories (one day measured 21,300 Linux minutes across the three), and CodeQL's licence covers only open source code. Never commit Terraform state or a secret.
- Render free web services sleep after 15 minutes without inbound traffic; free Postgres expires 30 days after creation, has no backups and is limited to one per workspace. Staging is built around both limits.
- The Render MCP creates services, triggers deploys, edits environment variables and reads logs, metrics and read-only SQL; it cannot delete or change other settings, so those go through Terraform or the Render API.
- Google Play numbers versionCode once per package across every track, so staging and production builds share one sequence. A binary promoted between tracks keeps the API base it was built with.
- The worker launcher reads `.claude/orchestrator.json` from the orchestrating checkout, which runs on `redesign/main`. A launcher change merged on `main` reaches workers only after the `#556` sync carries it. Codex workers start with `--disable apps --ignore-user-config` once it does, which also skips the user-level Codex hooks in `$CODEX_HOME/hooks.json`.
- A worker's final report does not always use the `## Test evidence`, `## Assumptions`, `## Manual steps` and one-lane-per-line `## Review harness` shape that `merge-review-batch-body.mjs` reads, and its log prints the final message twice. Rebuild the report in that shape from the last copy before merging it into a pull request body.
- Count Codex hook events as `hook: <Event>` lines (`LC_ALL=C grep -a`); the bare word "hook" also matches source text in the log.
- Play Console validates every active track, so an old build on the internal track blocks a new declaration or upload on another track. Replace the internal build with the current one first.
- The `## Review harness` block has one line per lane. A pull request with no animation change writes the motion lane exactly as `not applicable: no changed animation`.
- Start `tools/launch-worker.mjs` and `tools/wait-ci.mjs` as background tasks with no pipe and no `&`; a pipe ends the process early and the wake notification never arrives.
- The `orbit-api` `Mutation (domain)` job can reach its 45-minute timeout on a large diff. It is not a required check; rerun it once and record the timeout on the pull request.
- A React inline style that sets a shorthand and then the same property's longhand to `undefined` loses half the shorthand: React writes the `undefined` key as an empty string on the client, while server HTML omits it, so only client-rendered elements break. Set both longhands explicitly.
- Web and Android mirror files (the icon map, the icon registries, a screen's options menu) read as duplication to Sonar; list each mirror pair in `sonar.cpd.exclusions`. Sonar's API refuses pull requests on `redesign/main`, so infer the duplicated files from the diff.
- The Orbit MCP `bulk_log_habits` tool takes no idempotency key, so a replay check against production cannot go through it; `#390` needs a device test.
- Keep decision logs with times in the scratchpad, outside the repository.
- Render's Hobby workspace allows exactly two environments per project (Production and Staging exist). A service created before its environment group is linked starts without that configuration; redeploy it after the link. Render's trigger-deploy API may answer 202 with no body.
- Terraform for Render lives in `orbit-api` `infra/`, with state in S3 bucket `orbit-terraform-state-713285551626` (us-east-2) and secrets read from SSM `/orbit/<environment>/<service>/<KEY>`. The imported production API ignores its own env vars (they override the linked `orbit-production-api` group until removed). The Render project's environments are keyed by their live names; a different key plans a destroy of the Production environment. An empty `custom_domains` must be null.
- Plan and apply Terraform from the `orbit-api` checkout with `RENDER_API_KEY=$RENDER_MCP_TOKEN`, `CLOUDFLARE_API_TOKEN` from the Keychain, the default AWS profile (`orbit-operator`), and an ignored `infra/local.tfvars` holding the web image digests; apply the web services only once their image exists.
- Vercel is retired: no Orbit domain and no Git connection remain on its two Orbit projects, and the team is on the free plan. The personal portfolio project there is not Orbit's and stays untouched.
- Dash Ban checks pull request titles and bodies too; strip em dashes from any worker report carried into a body.
- A worker order for `orbit-api` cannot file tickets itself (the ticket tools live in this repository); the orchestrator files what a worker reports. Tracked specs, prompts and skill output carry rules and current state without session history, dates, attribution or machine paths.
- The permission classifier blocks reading a live credential into the transcript unconditionally (`hard_deny`, Credential Materialization); no setting, permission mode or approval lifts it (https://code.claude.com/docs/en/auto-mode-config.md).
- Neither the Render API nor the Render Terraform provider exposes a service's deploy hook URL.
- AWS SES production access is requested (support case `179056896000159`); `sesv2 get-account` reports the review as `DENIED` while AWS owes the next reply, and the Support API needs a paid plan, so read the case in the AWS Support console.
- A leftover local `next-server` on port 3000 serves a stale build to a local smoke run. Check `lsof -nP -iTCP:3000 -sTCP:LISTEN` before starting one.
- Before a staging database replacement, the reseed workflow opens the Render Postgres allow list to the runner's own address only, restores the operator list after each step, and a separate reconciliation workflow repairs a run that timed out.

- Worker logs live in the OS temp directory (`orbit-workers` under `os.tmpdir()`), which a reboot empties; a worker killed by a reboot leaves commits but no report, so relaunch it with a continuation order naming its commits rather than writing its report by hand.
- An order composed before the main checkout fast-forwards lacks newer composer text (the Chromium Vitest carve-out arrived that way); recompose an order after every fast-forward before launching it.
- A Pullfrog raw model specifier passes through `resolveModel` unchanged, gets no effort rung from `resolveRunEffort`, and on the opencode harness sends no variant; `deriveSubagentModels` gives it no override, so `reviewfrog` inherits the main model. The Codex CLI harness (`PULLFROG_AGENT=codex`) disables `multi_agent`.
- `GitGuardian Security Checks` is a required context on `main` in `orbit-api` and `orbit-landing-page`; its check suite can sit queued for a long time in the vendor's backlog, and nothing but waiting clears it.
- Render's Hobby workspace keeps no HTTP request logs, so an empty request-log query proves nothing about whether a request arrived; use app logs, the browser's network panel or the API's own logging.
- The canvas drawings cannot render from a checkout (`support.js` and the design-system bundle are not committed), so compare against the drawing's markup, data block and report text, and against the design-system contracts in `design/canvas/_ds/<uuid>/components/*.d.ts`.
- A GitHub `Closes thomasluizon/orbit-tickets#N` line in an `orbit-api` or `orbit-landing-page` pull request closes the ticket on merge to `main`; use `Refs` when the ticket still has operations after the merge.
- A body edit on a pull request re-runs Guards, and the Review harness motion line must read exactly `not applicable: no changed animation`.

- The sweep's Chrome window usually reports `document.visibilityState` `hidden` (it sits behind other windows). In a hidden document requestAnimationFrame and CSS animations stall, so route transitions leave two layers on screen, a Base UI sheet can fail to move focus or to close on Escape, and a click can look dropped. Before filing any of those, run `document.getAnimations().forEach((a) => a.finish())` and re-check, or confirm in a visible window; static layout, text and computed styles are reliable either way.
- A web load at the wide width server-renders the compact shell and swaps to the wide shell after hydration (`#900`); screenshot a desktop page only after the sidebar shows.
- claude-in-chrome can be connected to more than one browser and may drive a remote one: run `list_connected_browsers` first and select the macOS browser local to this computer. That Chrome's smallest viewport is about 600px wide, which already renders the phone layout (web switches to the wide shell at 1024px); a window that will not resize and an `outerWidth` of 0 mean the session is driving the wrong browser. Read `innerWidth` and `innerHeight` after every resize, because a docked panel or a full-screen window changes the page viewport without changing `outerWidth`; a macOS full-screen window may refuse a narrower size, so leave full screen only through the window, never through a system setting. Staging refuses framing, so a same-origin iframe cannot emulate a width. A resize beyond the screen (1352 by 849 available) leaves the window hidden and frozen at its old size; stay within it (desktop 1352 by 820, phone 600 by 820). Closing the MCP group's last tab and calling `tabs_context_mcp` with `createIfEmpty` opens a fresh window at the last requested size, which is the way out of a frozen or full-screen window. The staging session cookie is host-scoped: the owner's Chrome holds a session on `app-staging.useorbit.org`. The extension may not act on `accounts.google.com`, and the run never reads a one-time code, so a lost staging session needs the owner's one sign-in.
- The hermetic layout harness serves an English profile (`test-support/hermetic/mock-api/fixtures/profile.ts`, `language: 'en'`): a layout spec reads English messages, and a `pt-BR` locale cookie makes the app reload mid-test. A spec that reads computed focus styles finishes running animations first (`document.getAnimations().forEach((a) => a.finish())`), because outline and shadow transitions start from `medium` and `currentColor` and a read right after focus sees values that never settle on screen. The harness returns no `/api/events/ticket`, so the server logs an `INVALID_RESPONSE_SCHEMA` there on every page; it is not a failure.
- Four web Vitest files launch headless Chromium for geometry (`apps/web/__tests__/support/chromium.ts` and its users); a worker order names that carve-out and requires the full Vitest run (`tools/compose-prompt.mjs`, `.claude/hooks/_lib/rules-worker.mjs`), so check the web file count in its evidence.
- The GitHub GraphQL budget is 5,000 points an hour, shared by every tool, worker and agent on the account. A loop over many tickets or worktrees (board repairs, worktree teardown) can spend it in minutes and stall every merge and review read until the reset; run such loops with a pause between calls and stop them on the first rate-limit error. `create-ticket.mjs`, `complete-ticket.mjs` and the board status helpers scan the whole project on each call and cost far more than a plain read, so file tickets in small groups and never loop `--repair-status` over a list; a `gh project item-list` of the whole board is expensive and its status column did not match the live status. `list-bot-threads.mjs` waits up to 900 seconds for a fresh review by default: pass `--wait-seconds 0` for a one-time read. Workers also spend this budget. REST endpoints (`gh api repos/...`) keep working while GraphQL is exhausted, and the REST `rate_limit` view can show a stale GraphQL figure: probe with `gh api graphql -f query='query{rateLimit{remaining resetAt}}'`.
- The ticket board's built-in "Item closed" workflow is off, so a ticket that GitHub closes from a merged pull request keeps its board Status and `teardown-worktree.mjs` refuses its worktree. Run `node tools/complete-ticket.mjs --issue <#N> --repair-status` on such a ticket; turning the workflow on would flip a `--cancel` close from Canceled to Done.
- The `orbit-staging-reseed` AWS role trusts the OIDC subject `repo:thomasluizon/orbit-api:environment:render-operations`; a job that assumes it must run in that environment.
- The Play Console users and permissions page does not persist changes made from a hidden automation window (the page renders with `document.visibilityState` hidden and froze once); grant Play permissions from a visible window, or ask the owner.
- On `orbit-api` `main` the `CodeQL` results check is not a required context (the `Analyze` jobs are); a verified false-positive alert is dismissed with a written reason (under 280 characters) and the CodeQL workflow rerun, as earlier `cs/user-controlled-bypass` alerts were.
- SonarCloud runs on every pull request, and its gate (new-code coverage at least 80 percent, reliability A) is part of green checks. Its API refuses pull requests on `redesign/main`, so read the gate from the check run's `output.summary` and compute coverage locally from lcov against the diff. Rule `css:S4662` flags any at-rule missing from its ignore list (`value,tailwind,screen,responsive,variants,apply,theme,source,utility,variant,custom-variant,reference,config,plugin,define-mixin,mixin`), so `@slot` inside a `@custom-variant` body is a MAJOR bug there; a Tailwind plugin (`@plugin`) carries such a variant instead.
- A worker order that carries the UI review sweep can loop its completeness critic past the 45-minute ceiling. A relaunch says: finish and test the started edits, run each lane once, list new out-of-scope findings as follow-ups.
- The hermetic mock API answers `{}` for any route it does not map (`apps/web/test-support/hermetic/mock-api/server.ts`), so a layout spec that visits Calendário routes `/api/habits/calendar-month` itself with a schema-parsed fixture, as `press-shape.spec.ts` does.
- Both shells render before hydration, so a layout locator for the tab bar uses `[data-shell-tab-bar]` and one for the sidebar `[data-shell-sidebar]`; a box read for a geometry assertion waits until it holds still (`readHitBoxOnceStill` in `press-shape.spec.ts`).
- claude-in-chrome sometimes reports a navigation that left the tab on its new-tab page; repeat the navigate call before reading the page.
- The staging and production Render web services have auto-deploy off (set through the Render API; Terraform's image runtime block has no auto-deploy field).

## Current state

The inventory below is a snapshot. Refresh it before acting with `gh pr list` in each repository.

Batch M is done except the Resend retirement (`#943`). Production: web `60a347e0` (web push notifications live; `/sw.js` answers 200), API `ce78ccb4` (a device's push subscription moves between accounts without deleting a newer claim). `main` holds unreleased work: `ui#1350` (Next.js 16.3.6) and the Pullfrog workflow changes (API and landing, workflow files only, nothing to deploy). Android 1.3.44 (103) is on the open track.

THE REDESIGN GATE is open: Batch R is in progress. Staging web runs `redesign/main` `ea06bc35`; the staging API runs `e0cec58a` (the `#746` carry of `#664`, `#668` and `#667`). The first Orbit Staging build (`org.useorbit.app.staging`) has not shipped; it waits on the `#556` carry. The Play Console app exists as a draft with the redesigned icon on its draft listing.

Open pull requests: `ui` `#1351`, `#1354`, `#1355`, `#1356`, `#1358` (base `redesign/main`), `#1357` (base `main`); none in `orbit-api` or `orbit-landing-page`. Their state is under Batch R.

Worker engine: Codex on `gpt-6.1-sol`, committed; the main checkout is clean and `check-calibration` exits 0. Pullfrog reviews on `openai/gpt-6.1-sol` with the opencode harness in all three repositories (console on "Custom (set in workflow)").

Waiting on the owner: the redesign approval at THE REDESIGN GATE; whether free accounts see a recurring Orbit Pro prompt (see Open questions); a device test of `#390` and `#134`; the delete click on the retired projects once `#943` lands (the two Vercel Orbit projects, the paused Supabase project, Resend).

Watch windows: `#565` closes seven days after the web deploy of `f0322e3a` and `#566` seven days after Android 1.3.37 went live, if Sentry shows no recurrence of ORBIT-WEB-C or ORBIT-MOBILE-5.

Worktrees: merged tickets' worktrees go with `node tools/teardown-worktree.mjs`, paced (each call scans the board and spends GraphQL budget). About fifty `orbit-ui-mobile` ticket worktrees belong to merged pull requests (`git worktree list`, then `gh pr list --head <branch> --state all`); tear them down in small batches.

## Open questions

- A recurring Orbit Pro prompt for free accounts (the owner floated "maybe once a week" and is undecided). Owner answers; it blocks only its own ticket. It sits against `DESIGN.md` `## Voice` ("describe, never sell") and the rule that a capacity state carries no upgrade call to action. Recommendation: no timed popup; show the upgrade route only where a free account meets a real Pro boundary (the Astra daily limit, a Pro-only action), plus the onboarding paywall already decided.
