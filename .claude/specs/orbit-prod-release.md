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
- Keep `CODEX_HOME` short enough for the macOS 104-byte socket limit; a longer path fails with `path must be shorter than SUN_LEN`.
- The beta fleet permits a simpler deploy order while the owner is the only user, including relaxing deploy-API-first. Keep the full code contract.
- `#74` owns existing copy. Never revisit the redesign gate's timing because of how many screens remain.

- Redesign fixes merge once the exact head has green checks, a Pullfrog approval of that head and zero unresolved threads, and then `redesign/main` is released to staging. No screenshot gate sits in front of a merge.
- Redesign quality is judged on the rendered app: sweep staging screen by screen, at desktop and phone width, against the `DESIGN.md` rules, the screen's drawing in `design/canvas/`, `BRAND.md` and the brain decisions, and file what is wrong. A code-only audit never counts as a sweep. Sweeps repeat after every batch of merged fixes until a full pass finds nothing.
- A sweep may create, log and delete test habits and send Astra messages in the owner's staging account. Never in production.
- Owner overrides of the drawings: Calendário is one centred column (month grid on top, the selected day below it, the view selector folded into the month header, 24px card padding), and the Calendário drawing is amended to match; the Perfil Suporte row opens the support form, not Astra; Perfil keeps its settings inline as drawn, and the duplicate Preferências and Avançado pages go; Sobre carries no internal naming note.
- A web release strands every open tab's next Server Action until `#834` ships; until then, release staging web while nobody is testing on it.

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

Tickets, in dependency order (`#793`, `#795`, `#796`, `#798`, `#799`, `#794`, `#804`, `#800`, `#802`, `#83`, `#803`, `#807` to `#814`, `#797`, `#801`, `#806`, `#84`, `#825`, `#826`, `#818`, `#828`, `#829`, `#832`, `#830`, `#827`, `#815` and `#834` are closed):

- `#831` Web release credentials: merged on `main` (`ui#1237`). `ui#1243` (each release job follows the deploy id from Render's 201 response to its own request and fails closed on any other status; runbook updated) is approved at its head with every check green: merge it on `main`. Then cherry-pick its squash with `-x` onto `ui#1240` (the carry into `redesign/main`), answer that pull request's thread, push, clear review and merge. Release production web once and close the ticket.
- `#833` Staging web host to `app-staging.useorbit.org`: the Terraform code merged (`api#640`) and GitHub closed the ticket on that merge, but none of the cutover has run: reopen it. Then add the `app-staging.useorbit.org` custom domain to `orbit-web-staging` through the Render API, apply the targeted plan (the DNS record, the Turnstile widget, the staging environment groups, the staging upload bucket CORS) and confirm no web service change, set `STAGING_NEXT_PUBLIC_SITE_URL` to `https://app-staging.useorbit.org`, add `https://app-staging.useorbit.org/auth-callback` to the Google OAuth web client, release staging API and web from `redesign/main`, verify `/api/health`, the 308 from `staging.useorbit.org`, email sign-in and the Google authorize request, then close it. The old host stays allowed in CORS and redirect lists by design.
- `#805` Web privacy disclosures (`ui#1217`): push the branch's unpushed commit (the LGPD safeguards sentence), answer its three threads, approve the wording with `/second-opinion`, and merge only after email runs on SES.
- The one production web release after `ui#1243` merges also ships `#815` (the first pageview after PostHog opts in, merged as `ui#1239`) and `#834` (stale Server Action recovery, merged as `ui#1241`): after it, confirm a `$pageview` with host `app.useorbit.org` through the PostHog MCP, and carry `#834` into `redesign/main` through `#556`.
- Operations still open, in order: when AWS grants SES production access (support case `179056896000159`; the latest message on it is Orbit's full answer to AWS's request for detail, so AWS owes the next reply; `aws sesv2 get-account` reports `DENIED` until then), set `production_email_provider` and `staging_email_provider` to `Ses` and the two dead-letter alert email variables in `infra/local.tfvars`, apply the targeted plan, release the API in both environments, and prove one real sign-in code arrives through SES; then cancel Resend Pro, merge `#805`, and list the retired projects for the owner's delete click (the two Vercel Orbit projects, the paused Supabase project, Resend).

### Batch R: the owner's redesign review, and sweeps until nothing is wrong

The owner reviewed staging (`redesign/main`) and found the redesign far from the drawings and `DESIGN.md`: the rules are written but only the mechanical ones are gated, and the per-screen visual review had been switched off. Everything he reported gets fixed, and the rendered sweeps (standing rule above) continue until a full pass finds nothing. This batch runs beside Batch M, because Batch M's remaining items wait on AWS or on merges; it outranks every later batch.

Filed, in this order. `#842`, `#845` and `#848` are shipped defects on `main`, so they land on `main` first and are carried through `#556`; every other ticket lands on `redesign/main`:

- `#843` Calendário rebuilt as the owner decided (one centred column at every width, the view switch in the month header, 24px card padding, the drawing and `DESIGN.md` amended to match): `ui#1248` open, failing `Redesign Review Harness` and carrying Pullfrog findings. It merges before `ui#1242`.
- `#835` Astra on desktop becomes the wide shell's 380px side panel from 1024px, with one composer focus ring: `ui#1242` open. Its one Pullfrog thread (at 1024px the old two-track calendar clips next to the panel) is answered by `#843`; merge only after `ui#1248`, then resolve the thread.
- `#838` Remove the internal naming note from Sobre and its drawing: `ui#1245` approved at its head with every check green; merge.
- `#840` Progresso: a new account's `400 NO_HABITS_FOR_PERIOD` shows the drawn empty state instead of a repeating toast, and the column is centred: `ui#1246` open with Pullfrog findings. Its copy (`Nada para medir ainda` / `Começar um hábito`) is approved: it is the drawing's own wording.
- `#837` Perfil: full-row hover and focus, group spacing, settings inline with Preferências and Avançado deleted, Suporte opening the form, and the approved copy (`Gerenciar chaves de API`, the trial heading): `ui#1247` open, failing `Sonar Paths`, `SonarCloud Code Analysis`, `Surface Manifest Drift`, `Upgrade layout geometry` and review. The drawn Clock row is left out until `#853` and `#854`. Also delete `/ai-settings` in this ticket: its two switches duplicate Perfil's Astra group, the same rule as Preferências and Avançado.
- `#836` The palette hint shows `Ctrl K` on a Mac: merged (`ui#1244`); close it after the next staging web release shows `⌘K`.
- `#839` Dialog action pills of equal width and confirmation labels that name the consequence (Recomeçar and every other dialog): no worker yet.
- `#846` Habit detail: the false slipping card on a new habit, `Setembro De 2026`, two scrollers side by side, and chevrons on the add sub-habit and delete rows. Drop its web one-shell scope item: the pushed-screen shell ticket below owns that shared header slot.
- `#850` The habit detail rescue card's full proposal and free upgrade card as drawn (blocked by `#846`; its copy needs `/second-opinion`).
- `#847` The create habit dialog: dismissal (Escape, the close X, backdrop), one focus ring per field, the understood block as drawn, the `Mais detalhes` row, and the discard prompt (`Continuar editando` needs copy approval).
- `#851` Every sheet's action row moves into the pinned footer and the mobile footer reserves its height (blocked by `#847` and `#839`).
- `#849` HabitRow side columns: the empty leading column only where drawn (Hoje keeps it by design; Habit Detail sub-habit rows drop it) and the drawn selection mode.
- `#844` Wrapped holds its 900px wide frame on desktop web (the cover stays start-aligned, as drawn).
- `#852` The Wrapped player pages and header as drawn (blocked by `#844`; new copy needs `/second-opinion`).
- `#841` The Astra dock, tab bar and Today column cap at 740 in the narrow shell (web 741px to 1023px, Android landscape).
- `#853` (`repo:api`) A person chooses a 12-hour or 24-hour clock through the profile API; `#854` then adds the Perfil Clock row and makes every time display follow it (blocked by `#853` and `#837`).
- `#842` Web push never worked: serve and register a service worker, exempt `/sw.js` from the auth proxy (on `main`).
- `#848` Notifications on `main` link to a `/progress` page that `main` does not have; map them to existing screens in the client (on `main`).
- `#845` A tab that returns without an event cursor refetches account data twice (on `main`).

Found by the rendered sweep and NOT yet filed; file each as its own ticket first:

- The account boundary strands queries (`main` first, web and Android). The first session check runs `getQueryClient().clear()` (`apps/web/stores/auth-store.ts:61`, `forgetPreviousAccountContent`; `endSessionLocally` at `:84`; `main` clears at `:28`, `:108`, `:133`, `:154`, `:188`, `:207`, `:232`, `:251`, `:297`; Android `apps/mobile/stores/auth-store.ts:242`, `:494` and `apps/mobile/lib/providers.tsx:139`). `QueryCache.clear()` destroys each query with a silent cancel (`@tanstack/query-core` 5.101.4, `src/queryCache.ts:158-164`, `src/query.ts:259-263`), so a mounted observer bound to a query that was mid-fetch stays `pending`/`fetching` until its component re-renders. Rendered on staging at a 600px viewport: Perfil stayed on "Carregando perfil" and Calendário on its grid skeleton for 20 seconds while their API calls answered 200; the live React tree showed four `["profile","detail"]` observers with data and the page's own one stuck pending. The upgrade screen hung the same way. Probably the same boundary, to prove in the ticket: on staging the first tap after a page load is dropped (row menu, habit row, log ring) while production's first tap works, and a logged habit rolled back to not done about 3 seconds after the tap while its 7.7-second Server Action was still in flight, although the server recorded the log. Fix with a reset that cannot strand an observer and keeps no previous-account data (including server-preloaded `initialData`), with red-capable tests for each symptom.
- Pushed screens render inside the destination shell (`redesign/main`, web; Android checked). Below 1024px the parent tab's app bar (`HOJE`, `PERFIL`, `CALENDÁRIO` with search) stacks above the pushed screen's own header (`apps/web/components/shell/destination-shell.tsx:288`), and the composer and chips render on pushed screens (`:276`, `:311`; Android `_layout.tsx:329`), while the drawings give pushed screens a header and the tab bar only (`Orbit Sobre.dc.html:32`, `Orbit Busca.dc.html:33`, `Orbit Avisos.dc.html:32`; habit detail keeps its drawn composer). Desktop Busca nests a second scroller (`command-menu.tsx:62`). The existing shell test missed it because its `Shell412` mock drops `header` (`destination-shell.test.tsx:54-68`).
- Avisos against its drawing: the header action reads `Marcar todas` where the drawing has `Marcar tudo como lido` / `Mark all read`, and rows lack the drawn mono target line (`Orbit Avisos.dc.html:206`, `:226`, report `links` paragraph).
- The Astra conversation's empty state shows the Astra glyph on an accent-tinted well (the drawing's accent roles do not include it: `Orbit Astra Conversation.dc.html:117`) and its title and prompt differ from the drawing (`:162-163`).
- `aria-expanded` stays `false` on a habit row's `Mais ações` button while its sheet is open.
- A rendered comparison of Busca, Avisos, Sobre, the upgrade screen, Onboarding, Entrar, the Astra conversation, Suporte, Recursos de IA and Google Calendar against their drawings was started and its result was not collected; run it again as part of the next sweep.

Not defects, closed by evidence: the staging SSE 503 and the RSC prefetch 503s come from the free staging web and API services during a page load burst or a wake (the same requests answer 200 when replayed, and no app log line exists); `MaxListenersExceededWarning` counts 11 close listeners per short request from Next's rewrite proxy and Sentry, with flat memory; the Hoje leaf-row leading column is drawn on purpose (`Orbit Hoje.dc.html:109-111`, `:347`); the Entrar send button is disabled on an empty email because the drawing blocks it (`Orbit Entrar.dc.html:360`).

Sweep coverage so far, rendered: Hoje, Progresso, the create dialog, Astra, habit detail, Calendário, Perfil, Busca, Avisos, Sobre, the upgrade screen, Wrapped, Onboarding and Entrar at desktop width; Hoje, Calendário, Progresso, Perfil, Busca, Avisos, Sobre, Suporte, Recursos de IA, Google Calendar, the upgrade screen, Wrapped, the Astra conversation and the habit row menu at a 600px phone-layout viewport. Still to sweep: Verificação, Estados, Offline, the overlays beyond the row menu, Celebração, and Assinatura as its own screen.

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

The contract rebaseline App (`#702`) is done: its pull requests now start every required check. The redesign rebaseline passes the App key to its reusable workflow (`#787`): dispatch `redesign-drift.yml` on `redesign/main` after each orbit-api `redesign/main` merge that changes the contract. Worktree teardown accepts clean local base merges (`#785`) and merged carry worktrees of the standing tickets listed in `tickets.standing` (`#786`); a closed, unmerged ledger row with a blocker and `closed: true` ends a sleep run BLOCKED (`#788`), and an explicit `closed: false` reopens it (`#789`).

### Batch 0c: live defects in the shipped product, on `main`

Defects a person hits in the shipped build today (web on `main`, Android from `main`, the `orbit-api`
`main` deploy). They target `main` under D99 and the route-by-subject rule; an Android fix is followed by
`/android-release` to the open track.

- `#566` Resolve orphan offline IDs before reorder mutations expire (merged; closes after seven days without ORBIT-MOBILE-5 on the carrying release)
- `#134` Habit row three-dot menu does not reliably open on Android (verify on a device, then close)
- File a ticket and fix: on production web Today, a habit's three-dot menu once stayed open while a second habit's menu opened below it, so two menus showed at once (not reproducible on demand; investigate the menu open state and outside-dismiss logic on both platforms)
- `#565` Root-cause the Today-page non-array map failure (map the minified frame from the release's own build first; never add a blanket guard)
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

- Render's Hobby workspace keeps no HTTP request logs, so an empty request-log query proves nothing about whether a request arrived; use app logs, the browser's network panel or the API's own logging.
- The canvas drawings cannot render from a checkout (`support.js` and the design-system bundle are not committed), so compare against the drawing's markup, data block and report text, and against the design-system contracts in `design/canvas/_ds/<uuid>/components/*.d.ts`.
- A GitHub `Closes thomasluizon/orbit-tickets#N` line in an `orbit-api` or `orbit-landing-page` pull request closes the ticket on merge to `main`; use `Refs` when the ticket still has operations after the merge.
- A body edit on a pull request re-runs Guards, and the Review harness motion line must read exactly `not applicable: no changed animation`.

- claude-in-chrome can be connected to more than one browser and may drive a remote one: run `list_connected_browsers` first and select the macOS browser local to this computer. That Chrome's smallest viewport is about 600px wide, which already renders the phone layout (web switches to the wide shell at 1024px); a window that will not resize and an `outerWidth` of 0 mean the session is driving the wrong browser. Staging refuses framing, so a same-origin iframe cannot emulate a width. Orca's embedded browser has no staging session, and signing it in would need the owner's one-time code, which the run never reads.
- The GitHub GraphQL budget is 5,000 points an hour, shared by every tool, worker and agent on the account. A loop over many tickets or worktrees (board repairs, worktree teardown) can spend it in minutes and stall every merge and review read until the reset; run such loops with a pause between calls and stop them on the first rate-limit error. REST endpoints (`gh api repos/...`) keep working while GraphQL is exhausted, and the REST `rate_limit` view can show a stale GraphQL figure: probe with `gh api graphql -f query='query{rateLimit{remaining resetAt}}'`.
- The ticket board's built-in "Item closed" workflow is off, so a ticket that GitHub closes from a merged pull request keeps its board Status and `teardown-worktree.mjs` refuses its worktree. Run `node tools/complete-ticket.mjs --issue <#N> --repair-status` on such a ticket; turning the workflow on would flip a `--cancel` close from Canceled to Done.
- The `orbit-staging-reseed` AWS role trusts the OIDC subject `repo:thomasluizon/orbit-api:environment:render-operations`; a job that assumes it must run in that environment.

## Rendered sweep findings to file

A rendered comparison of the staging screens against their drawings and the written rules. File each group as tickets (merge a finding into an existing ticket when it names the same root cause), place them in Batch R, and delete this section once every item is filed. A trailing number like `-7` names the screen capture the finding came from; re-render the screen rather than trusting the coordinates.

Scope: staging web on `redesign/main`, pt-BR, dark, Pro trial account with one habit ("Caminhar").
Drawing paths are relative to `design/canvas/`. Contract paths (`*.d.ts`) are relative to `design/canvas/_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/components/`.
Coordinates are screenshot pixels, not CSS pixels. Severity: high, medium, low. "uncertain" gives the reason.

Excluded because they are filed: stacked headers and the composer on pushed screens, stuck skeletons, Wrapped frame and pages (#844, #852), the Hoje empty leading column, the Mac palette hint, #840, #837, #846, #849, #850, #847, #841, #838.

Owner rulings applied: Astra takes feminine agreement in pt-BR, so a drawing string with "o Astra" is read as "a Astra". Calendário is one centred column. The Perfil Suporte row opens the support form. Perfil keeps its settings inline. Sobre has no naming note.

### Shell and composer (every screen)

- **X1 [high] The composer chips are a fixed list.** Rendered: the same four chips, "Registrar um hábito / Criar uma rotina / Como estou indo? / Planejar minha semana", on Hoje (-7 y≈569), Busca, Sobre, Suporte, Recursos de IA, Google Calendar and Astra. Rule: `DESIGN.md:67-69` (Information architecture, outranks every drawing): "3 to 6 suggestion chips built from live state, never from a static list"; `shell/Composer.d.ts:2-3`; the Hoje drawing picks chips by state and names real habits (`Orbit Hoje.dc.html:479-484`, `:2502-2505`). Source: `packages/shared/src/chat/index.ts:14-19` (`CHAT_STARTER_CHIP_KEYS`), `apps/web/hooks/use-chat-composer.ts:224-227`. Fix: build 3 to 6 chips from live state (overdue, streak at risk, habit with no goal) on both platforms, and delete the static keys.
- **X2 [medium] The send button carries the accent at rest.** Rendered: with an empty field, send is a dim accent-filled disc (-7 x≈555 y≈626; -0 x≈1251 y≈749). On Hoje it sits beside the accent FAB, so two accent discs show. Rule: `shell/Composer.d.ts:5-6`: the accent enters on the focus ring and on send "once there is something to send"; `DESIGN.md:628` "Fill exactly one action per view". Fix: render send neutral until the field or the tray has content.
- **X3 [low] Composer placeholder copy.** Rendered: "Pergunte para a Astra". Drawings: `placeholder: 'Peça algo ao Astra'` (`Orbit Hoje.dc.html:450`, `Orbit Astra Conversation.dc.html:151`, `Orbit Perfil.dc.html:151`, `Orbit Calendario.dc.html:430`), which reads "Peça algo à Astra" under the feminine ruling. Source: `packages/shared/src/i18n/pt-BR.json:215`. Fix: use the drawn placeholder with feminine agreement, and the en pair from the same drawings.
- **X4 [medium] The sidebar search entry is cut off.** Rendered: "O que v…" beside the keycap (-0, -1, -2 x≈75-140 y≈127). Rule: `shell/ShellWide.d.ts:64` (the entry's visible word, "Buscar"); every wide drawing passes `palette: 'Buscar'` (`Orbit Busca.dc.html:99`, `Orbit Avisos.dc.html:205`, `Orbit Sobre.dc.html:188`, `Orbit Pro.dc.html:276`, `Orbit Assinatura.dc.html:280`); `DESIGN.md:720` (keep a truncated value reachable). Fix: label the entry "Buscar" / "Search". The keycap hint is a separate filed fix.
- **X5 [low] The sidebar create label.** Rendered: "Criar" (-0 y≈757, -1 y≈681). Drawings: `create: 'Criar hábito'` (`Orbit Busca.dc.html:97`, `Orbit Avisos.dc.html:203`, `Orbit Sobre.dc.html:187`). Fix: "Criar hábito" / "Create habit".
- **X6 [medium, uncertain] Two header shapes ship on pushed screens.** Rendered: Busca, Sobre, Suporte, Upgrade, Recursos de IA and Google Calendar use a centred uppercase mono title with a chevron. Avisos uses a start-aligned sentence-case title with an arrow. The drawings for Busca, Sobre, Pro, Assinatura and Avisos all compose the Avisos shape: a 44px ghost back with `arrow-left` and a start-aligned title at `--fs-lg`/500 (`Orbit Busca.dc.html:382-388`, `Orbit Sobre.dc.html:523-530`, `Orbit Pro.dc.html:423-429`, `Orbit Assinatura.dc.html:501-506`, `Orbit Avisos.dc.html:384-392`). Uncertain: `navigation/NavHeader.d.ts:1` and `DESIGN.md:752` describe the centred mono header, and the filed stacked-header ticket can reshape these headers. Fix: use the drawn header on these screens, or settle the shape inside the stacked-header ticket.
- **X7 [low, uncertain] The account row is missing on Busca.** Rendered: the Busca sidebar ends at "Criar" (-0 y≈757) and has no account row. Avisos and Sobre show the account name. Drawing: `account` is always passed (`Orbit Busca.dc.html:42`). `apps/web/components/shell/destination-shell.tsx` (`getAccountLabel`) returns nothing while the profile loads. Uncertain: this is likely the filed query-cache bug. Fix: reserve the account row while the profile loads, so Criar does not move.

### Busca (-0 desktop, -13 phone; drawing Orbit Busca)

- **B1 [medium] Desktop /search renders the palette in the page.** Rendered: under "BUSCAR HÁBITOS", the field says "Buscar ou executar" and the page lists the palette groups HÁBITOS, CRIAR, AÇÕES (-0 y≈147-632). Drawing, wide: the page is the search surface, with the field "Buscar hábitos", a count line and result rows (`Orbit Busca.dc.html:40-45`, `:98`, `:262-284`). The palette is a 560px overlay on a scrim, opened from the sidebar or Ctrl K (`:371-379`, report `:61`). Only at 412 does the palette share the sheet (`:389-390`). Source: `apps/web/app/(app)/search/page.tsx:26` renders `CommandMenu resultsMode` at every width. Fix: at 1024 and wider, render the results surface on /search, and keep the palette as the overlay.
- **B2 [medium] Two loading indicators show with an empty field.** Rendered: "••• Buscando" and the HÁBITOS skeleton show together while the field is empty (-0 y≈228-410, -13 y≈171-330). Drawing: "Buscando" is the searching state of a typed query (`Orbit Busca.dc.html:59`, `:258`, `:264-270`). Palette loading shows only the habit-group skeleton (`:341-345`). Fix: show "Buscando" only while a typed query runs, with one indicator at a time. Uncertain: whether the skeleton ever resolves (stuck queries are filed for other screens).
- **B3 [low] Navigation loses its current position.** Rendered: no sidebar item (-0) and no tab (-13 y≈700) is active. Drawing: `active-id="hoje"` (`Orbit Busca.dc.html:42`) and `activeId: 'hoje'` (`:394-395`). Fix: keep the destination the person came from marked active.

### Avisos (-1 desktop, -14 phone; drawing Orbit Avisos)

- **A1 [medium] The row leads nowhere and has no target line.** Rendered: "Conquista Desbloqueada: Primeira Órbita / Crie seu primeiro hábito (+25 XP)" has a title, a body and a time, but no mono target line (-1 y≈195-225). Drawing: every row renders its target with an icon (`Orbit Avisos.dc.html:106-111`), "every row leads somewhere" (report `:128`, `:133`), and achievements live in Progresso (`Orbit Sobre.dc.html:160`). Source: `orbit-api` `src/Orbit.Application/Gamification/Services/GamificationService.cs:786` creates the notification with a null link. The level-up notification at `:805` does the same. Fix: the API links achievement and level-up notifications to `/progress`, and the row renders its target line.
- **A2 [medium] The notification title uses title case.** Rendered: "Conquista Desbloqueada:" (-1 x≈630-975 y≈195). Rule: `DESIGN.md:938` (sentence case) and banned pattern 15 at `DESIGN.md:967`. Source: `GamificationService.cs:782`. The same builder writes "Subiu de nível! …" (`:797`). That string breaks `DESIGN.md:928` and pattern 1 at `:954`, but this sweep did not render it. Fix: use sentence case and remove the exclamation mark, in both locales.
- **A3 [low] Mark-all label.** Rendered: "Marcar todas" (-1 x≈648 y≈116). Drawing: `markAll: 'Marcar tudo como lido'` (`Orbit Avisos.dc.html:206`). Source: `pt-BR.json:63`. Fix: use the drawn label.

### Sobre (-2 desktop, -15 phone; drawing Orbit Sobre)

- **S1 [medium] Title.** Rendered: "SOBRE E AJUDA" (-2 y≈67). Drawing: `titles.about: 'Sobre'` (`Orbit Sobre.dc.html:189`). The source string "Sobre e Ajuda" is also title case (`pt-BR.json:3095`), which `DESIGN.md:938` and `:967` ban. Fix: use "Sobre" / "About".
- **S2 [medium] Row labels.** Rendered: "Recursos, Suporte, Termos, Privacidade" (-2 y≈363-621). Drawing: "Guia do Orbit, Falar com o suporte, Termos de uso, Política de privacidade" (`Orbit Sobre.dc.html:193-198`). The report calls these labels load-bearing (`:159`). "Recursos" also collides with the separate "Recursos de IA" screen (`DESIGN.md:964`, synonym cycling). Source: `pt-BR.json:3096-3098`. Fix: use the drawn labels in both locales (en at `:271-276`).

### Upgrade (-3 desktop; drawings Orbit Pro and Orbit Assinatura)

Route decision: the route renders the **Orbit Pro** pitch in its trial state. `apps/web/app/(app)/upgrade/page.tsx:64` shows the dashboard only when `hasProAccess && !isTrialActive`. The rendered eyebrow "Faltam 7 dias de teste" and heading "As 50 por dia ficam, ou voltam a ser 5." match Pro `in trial` (`Orbit Pro.dc.html:233`, `:278-280`). **Uncertain drawing conflict:** Assinatura also draws a `trial` state on the dashboard (`Orbit Assinatura.dc.html:232`, `:239`, `:284`). The two drawings disagree about where a trial account lands. The app follows Pro.

- **U1 [medium] The header title does not match the content.** Rendered: "ASSINATURA" over the pitch (-3 y≈67). Drawing: the pitch's header is "Orbit Pro" with `translate="no"` (`Orbit Pro.dc.html:275`, `:428-429`). "Assinatura" belongs to the dashboard (`Orbit Assinatura.dc.html:279`). Source: `upgrade/page.tsx:291` uses one title for every state. Fix: use "Orbit Pro" for the pitch and "Assinatura" for the dashboard.
- **U2 [high] The desktop page drops the sidebar.** Rendered: no sidebar at 1352px. The page is centred with no navigation (-3). Drawings: both halves sit in `ShellWide` with the four destinations, `active-id="perfil"`, the account row and search, and no create button (`Orbit Pro.dc.html:126`, `Orbit Assinatura.dc.html:129`). Rule: `DESIGN.md:988-989` (sections stay one click away, and no breakpoint hides core functionality). Source: `apps/web/components/shell/destination-shell.tsx:86-88` excludes `/upgrade`. Fix: keep the sidebar on /upgrade and omit only the create action.
- **U3 [low, uncertain] The interval control hugs its labels.** Rendered: "Mensal | Anual" is about 145 CSS px wide (-3 x≈424-585 y≈806). Drawing, wide: the control sits in a `max-width:320px` wrapper at full width (`Orbit Pro.dc.html:170-171`). Uncertain: the contract does not state the fill behaviour, and the rest of the page is below the fold. Fix: let the control fill a 320px-max container.

### Onboarding (-6 desktop; drawing Orbit Onboarding)

- **O1 [low] The counter has no separator.** Rendered: "Orbit 01 / 03" (-6 x≈310-387 y≈46). Drawing: "Orbit · 01 / 03" (`Orbit Onboarding.dc.html:590`, report `:277`). Source: `apps/web/components/onboarding/onboarding-flow.tsx:134`. Fix: add " · ".
- **O2 [medium] The disabled Continuar gives no reason.** Rendered: "Continuar" is disabled with no text beside it (-6 x≈697 y≈537). Drawing: an empty field shows "Escreva o que você quer acompanhar." under the action (`Orbit Onboarding.dc.html:395`, `:603-604`). Rule: `DESIGN.md:911` (the reason for a disabled control sits beside it in visible text). The string is missing from `pt-BR.json`. Fix: add the reason line in both locales.
- **O3 [low] "Já tenho uma conta" is a centred text link in the content.** Rendered: a quiet link between the chips and the action (-6 y≈462). Drawing: a full-width ghost Button under the primary, in the pinned action slot (`Orbit Onboarding.dc.html:598-599`, `:606`). Source: `apps/web/components/onboarding/onboarding-welcome.tsx:35`. Fix: render it as the drawn ghost button in the action slot.
- **O4 [low] "Pular" and back are plain text.** Rendered: "Pular" has no ring (-6 x≈725 y≈46). Drawing: ghost `sm` Buttons (`Orbit Onboarding.dc.html:157`, `:161`). The ghost variant has an inset 1.5px `--hairline-strong` ring (`DESIGN.md:850`). Source: `onboarding-flow.tsx:134` (`QuietLink`). Fix: use `PillButton` ghost `sm`.
- **O5 [low, uncertain] Continuar hugs at the bottom right.** Rendered: about 125 CSS px wide (-6 x≈648-746). Drawing: `width: '100%'` in the ShellWide action slot (`Orbit Onboarding.dc.html:596-597`, `:641`). Uncertain: the width of the wide action slot is not drawn, and `DESIGN.md:852` caps a lone desktop CTA near 360px. Fix: check the slot width, then match the drawing.

### Entrar (orca-login.png; drawing Orbit Entrar)

- **E1 [low] Field label.** Rendered: "E-mail" under the heading "Entre com o seu email" (y≈491). Drawing: `emailLabel: 'Email'` (`Orbit Entrar.dc.html:195`). Rule: `DESIGN.md:939` and `:964` (one vocabulary per surface). Source: `pt-BR.json:337` (support repeats it at `:1664`). Fix: use "Email".
- **E2 [low] Placeholder.** Rendered: "voce@exemplo.com" (y≈575). Drawing: `placeholder="nome@exemplo.com"` (`Orbit Entrar.dc.html:54`), which matches the error example (`:196`). Source: `pt-BR.json:338`. Fix: use "nome@exemplo.com".

### Astra conversation (-25 phone; drawing Orbit Astra Conversation)

- **C1 [medium] The conversation has a back control and no close.** Rendered: a leading chevron and no trailing control (-25 x≈31 y≈23). Drawing: NavHeader "Astra" with a trailing close `x` (`Orbit Astra Conversation.dc.html:888-893`). The conversation is an overlay, not a destination (`DESIGN.md:73`). Fix: use a trailing close and no back.
- **C2 [high] The empty-state glyph takes the accent.** Rendered: an orange Astra glyph on a primary-tinted disc (-25 x≈213-283 y≈123-192). Drawing: `EmptyState` with `mark: 'astra'` (`:760`). Rule: `overlay/EmptyState.d.ts:1` (no accent on the mark, and the accent goes only on the action); `DESIGN.md:628` (never decorative on an icon that does not show state); `DESIGN.md:776`. Fix: render the AstraGlyph in `--fg-1` with no disc.
- **C3 [medium] Empty-state copy.** Rendered: the title "Como foi seu dia?" and the line "Posso resumir, planejar ou te ajudar a ajustar um hábito." (-25 y≈219-275). Drawing: the title "Fale com o Astra sobre a sua rotina" and the prompt "Algumas coisas que dá para pedir" at `--fs-sm` `--fg-3`, over the suggestions (`:162-163`, `:762`). Under the feminine ruling, the title reads "Fale com a Astra sobre a sua rotina". Source: `pt-BR.json:1111`, `:1139`. Fix: use the drawn strings in both locales.
- **C4 [medium] The suggestions do not match the drawing.** Rendered: three suggestions, "Meditei hoje / Criar um hábito de exercício toda manhã / Preciso fazer compras amanhã" (-25 y≈315-358). Drawing: four suggestions, and each opens one block kind: a log, the week's metrics, a breakdown, and goals (`:177`, `:765-766`). Source: `pt-BR.json:1140-1142`. Fix: use the drawn four and wire each to its block.
- **C5 [medium] Two suggestion sets stack.** Rendered: the composer chips show under the empty-state suggestions (-25 y≈521). Drawing: `NO_CHIPS` includes `'empty'` (`:489`), so the composer has no chips while the thread is empty. Fix: hide the composer chips while the thread is empty.
- **C6 [low, uncertain] Disclosure copy.** Rendered: "A Astra é IA e pode errar. Isto não é aconselhamento médico ou profissional." (-25 y≈399-411). Drawing: "O Astra não é conselho médico." (`:164`), which reads "A Astra …" under the ruling. Source: `pt-BR.json:3250`. Uncertain: the longer wording can be a deliberate legal choice. Fix: use the drawn line, unless legal wording governs.

### Suporte (-16 phone; drawing Orbit Sobre, support states)

- **P1 [medium] Intro copy.** Rendered: "Tem uma dúvida, encontrou um bug ou quer dar um feedback? É só escrever." (-16 y≈115). Drawing: "Conte o que aconteceu. Quanto mais concreto, mais rápido a gente resolve." (`Orbit Sobre.dc.html:242`). Source: `pt-BR.json:1662`. Fix: use the drawn intro.
- **P2 [medium] The form has an extra field and a different order.** Rendered: an editable "Nome" field first, then E-mail, then "Sobre o que é" (-16 y≈153-440). The message field is below the fold, and its source label is "Mensagem". Drawing: intro, subject (RadioRow), message "O que aconteceu" (6 rows), the disabled account email, send (`Orbit Sobre.dc.html:443-486`, strings `:243-256`). The drawing has no name field. Source: `pt-BR.json:1663`, `:1666`. Fix: remove the name field, put the fields in the drawn order, and label the message "O que aconteceu".
- **P3 [low] Email field label and reason.** Rendered: the label "E-mail" and the hint "A gente responde no e-mail da sua conta." (-16 y≈241-314). Drawing: the label "Resposta para" and the reason "Gerido pela sua conta. Para mudar, troque o email no Perfil." (`Orbit Sobre.dc.html:254-255`). Fix: use the drawn label and reason.

### Recursos de IA (-17 phone; drawing Orbit Perfil, Astra group)

- **R1 [medium, uncertain] A separate AI settings screen exists.** Rendered: a pushed "Recursos de IA" screen. Drawing: ai-settings folds into Perfil (`Orbit Perfil.dc.html:60`), and the two items are rows in Perfil's Astra group (`:388-391`). The owner ruling keeps settings inline. Uncertain: #837 (Perfil rows) can already remove this route. Fix: remove the sub-screen once Perfil carries the two rows.
- **R2 [high, uncertain cause] A Pro trial account sees both rows locked.** Rendered: a trailing lock and chevron on "Resumo diário" and "Alertas Astra" (-17 x≈444-470 y≈187, y≈267). Drawing: a Pro account gets two Switch rows (`Orbit Perfil.dc.html:388`, `:390`). Source: `apps/web/app/(app)/ai-settings/page.tsx:16` uses `profile?.hasProAccess ?? false`, so a profile that has not loaded renders as free. Rule: `DESIGN.md:908` (loading is a skeleton). Uncertain: the stuck profile query is filed; the default to locked is a separate defect. Fix: show a skeleton until the profile loads, and never default a gate to locked.
- **R3 [medium] The rows do not match the drawn rows on either plan.** Rendered: a leading feature icon, a two-line description, and a trailing lock and chevron, with no Pro badge. Drawing: free gets a ListRow with a leading lock, a trailing "Pro" badge and no chevron (`Orbit Perfil.dc.html:389`, `:391`). Pro gets a Switch labelled for its on state. The labels are "Astra avisa quando algo escapa" and "Resumo do dia pelo Astra" (`:112-113`, feminine ruling applies). The descriptions are supporting copy (`DESIGN.md:935`). Fix: use the drawn rows and labels, with no description.
- **R4 [low] The title shows twice.** Rendered: "RECURSOS DE IA" in the header and "Recursos de IA" as a heading (-17 y≈69, y≈124). Rule: `DESIGN.md:934` ("Say it once"). Fix: remove the in-page heading.

### Google Calendar sync (-18 phone; drawings Orbit Calendario and Orbit Perfil)

- **G1 [medium, uncertain] A separate sync screen exists.** Rendered: a pushed "GOOGLE CALENDAR" screen under Calendário. Drawing: sync lives in Calendário itself, with the connection line, the last sync time and the "Sincronizar sozinho" switch beside the day's events (`Orbit Calendario.dc.html:336-337`, `:423-424`). Perfil's calendar row routes to that place (`Orbit Perfil.dc.html:66`, `:421-422`). Uncertain: #843 (the Calendário rebuild) can absorb this. Fix: fold the sync controls into Calendário.
- **G2 [high, uncertain] The copy imports events as habits.** Rendered: "Entre com o Google para importar os eventos do seu calendário como hábitos." (-18 y≈401). Drawing: imported events are read only, carry their source, and are "never mistaken for a habit" (`Orbit Calendario.dc.html:336`). Source: `pt-BR.json:1022`, `:1037`. Uncertain: this is feature behaviour, not only copy. Fix: show events read only beside habits, and remove the "como hábitos" import copy.
- **G3 [medium] The link glyph takes the accent.** Rendered: a link icon on a primary-tinted disc (-18 x≈220-272 y≈300-355). Rule: `overlay/EmptyState.d.ts:1`; `DESIGN.md:628`, `:776`. Fix: use a neutral glyph or the EmptyState mark.
- **G4 [low] A disabled switch comes before the connect action.** Rendered: a disabled "Google Calendar" switch with "Conecte sua conta Google antes…" (-18 y≈169-189). The connect action is below it and hidden behind the composer. Drawing: the switch "Sincronizar sozinho" shows only once connected, with the connection line (`Orbit Calendario.dc.html:337`, `:424`). Fix: show connect first, and show the switch after connection with the drawn label.

### Hoje (-7 phone; drawing Orbit Hoje)

- **H1 [high] A trial upsell line sits on Hoje.** Rendered: "7 dias restantes Assinar" in mono under the date, with "Assinar" linking to /upgrade (-7 y≈153). Drawing: Hoje draws no plan or trial line. The only line above the list is Astra's proactive line, above the date (`Orbit Hoje.dc.html:36-45`, report `:332`, `:334`). Rules: `DESIGN.md:916` ("Describe, never sell"); `DESIGN.md:176` (the slot is absent when there is nothing to say). Source: `apps/web/app/(app)/today-page-view.tsx:114` (`TrialBanner`), `apps/web/components/ui/trial-banner.tsx:33-39`. Fix: remove the banner from Hoje, and leave trial state to the Upgrade eyebrow and the Perfil plan row.
- **H2 [medium] The date control's type and alignment.** Rendered: "segunda-feira" in lower case, at about 14px sans, centred between the chevrons (-7 y≈74-92). Drawing: a start-aligned, capitalised weekday in Space Grotesk 22/500 over the mono date (`Orbit Hoje.dc.html:52-54`, `:2631`). Fix: use the drawn size, family, alignment and capitalisation.
- **H3 [low] The list controls use a kebab.** Rendered: a vertical three-dot button on the date row (-7 x≈559 y≈82). It looks like the row overflow at x≈557 y≈232. Drawing: `adjustments-horizontal` (`Orbit Hoje.dc.html:62`). Fix: use the drawn glyph.
- **H4 [low, uncertain] Hoje carries a shell header.** Rendered: a "HOJE" title bar with a search button above the date (-7 y≈27). Rule: `shell/Shell412.d.ts:20-21` ("A screen with no header passes NOTHING … which is what Hoje does"). The Hoje drawing passes no header (`Orbit Hoje.dc.html:33`). Uncertain: this bar is the only visible search entry at 412, and the filed stacked-header ticket can touch it. Fix: remove the bar on Hoje, and give search an entry the drawings define.

### Wrapped cover (-20 phone; drawing Orbit Wrapped)

- **W1 [low] Cover subtitle.** Rendered: "Escolha um período para começar." (-20 y≈294). Drawing: "Os registros do período, uma página de cada vez." (`Orbit Wrapped.dc.html:140`). Fix: use the drawn subtitle.
- **W2 [low] Empty-period line.** Rendered: "Registre alguns hábitos primeiro para ver seu Wrapped." (-20 y≈389-407). This tells a person who has a habit to register habits. Drawing: "Nada registrado nesse período. Escolha outro período para ver um fechamento." (`Orbit Wrapped.dc.html:144`, report `:81`). Fix: use the drawn line, which names the way out.
- **W3 [low, uncertain] The period chips are under 44px.** Rendered: about 38 CSS px tall (-20 y≈324-355). Drawing: `height: 44` (`Orbit Wrapped.dc.html:514`). Rule: `DESIGN.md:1138` (44 minimum). Uncertain: this was measured from a scaled JPEG. Fix: give the chips a 44px height.

## Current state

The inventory below is a snapshot. Refresh it before acting with `gh pr list` in each repository.

Batch M is nearly done. Production runs entirely on the new stack (API, web and landing on Render, Postgres on Render, uploads on S3, DNS and DNSSEC on Cloudflare). Every release reads `RENDER_API_KEY` only from `main`-only GitHub environments, and no repository-level Render key remains in any of the three repositories. The staging API runs `redesign/main` at the credential carry, the staging reseed and access reconciliation authenticate to AWS through the `render-operations` environment, and the staging host rename's code is merged while its cutover has not run. Production web still waits for one release that ships the deploy correlation fix, the first-pageview fix and the stale Server Action recovery.

Email still goes through Resend: AWS has not granted SES production access, and AWS owes the next reply on the case.

THE REDESIGN GATE is open and failing: the owner's review found the redesign far from the drawings and the written rules (Batch R). The internal Android build 1.3.39 (98) from `redesign/main` is on the internal track. Staging web runs `7b8b071c` (the Today hydration carry); `redesign/main` has moved to `07a8e019` (the Mac palette hint), not yet released to staging. The rendered sweep found the redesign's worst defect: the account boundary's cache clear strands queries, so screens hang on skeletons and first taps and logs are undone on staging (Batch R, first unfiled finding).

Open pull requests: `ui#1243` (production deploy correlation, approved, green), `ui#1245` (Sobre note, approved, green), `ui#1240` (web credential carry, one thread), `ui#1242` (Astra side panel, waits for `ui#1248`), `ui#1246` (Progresso, review findings), `ui#1247` (Perfil, five failing checks), `ui#1248` (Calendário, review harness and findings), `ui#1217` (privacy, held for SES).

Waiting on the owner:

- The redesign approval at THE REDESIGN GATE, after Batch R.
- Where an account on a Pro trial lands on `/upgrade`: today it sees the Pro pitch (`apps/web/app/(app)/upgrade/page.tsx:64` shows the Assinatura dashboard only to paid Pro), while `Orbit Assinatura.dc.html:232`, `:239` also draws a trial state on the dashboard. The two drawings disagree, so this is the owner's call; until he answers, keep the current behaviour.
- A device test of `#390` (bulk log replay) and `#134` (three-dot menu) on the current open-track build.
- The delete click on the retired projects once he is satisfied: the two Vercel Orbit projects, the paused Supabase project, and Resend after its cancellation.

Watch windows: `#565` closes seven days after the web deploy of `f0322e3a` and `#566` seven days after Android 1.3.37 went live, if Sentry shows no recurrence of ORBIT-WEB-C or ORBIT-MOBILE-5.

Stale worktrees: 58 ticket worktrees remain in `orbit-ui-mobile`, 48 in `orbit-api` and 3 in `orbit-landing-page`; many belong to merged pull requests whose closed tickets still show a Todo board Status (repair it first, see Constraints), and the rest are live work. Tear them down one ticket at a time with `node tools/teardown-worktree.mjs`, which refuses anything unmerged. The detached `orbit-ui-mobile` worktree `ticket-822-web-health-retry` sits on a merged `main` commit and is removable. The GitHub environments `Preview` and `Production – orbit-landing-page` style entries left by Vercel in `orbit-ui-mobile` and `orbit-landing-page` are stale.
