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
- Supabase egress is the first priority until it is fixed: the project hit its monthly egress quota. Measure egress per query shape, rank by bytes, and fix the largest waste first (N+1 calls where one bulk call serves, over-fetching rows or columns, unbounded list queries, polling) with before and after evidence. A plan upgrade does not replace the optimization.
- Batch M (the move to the new stack) outranks every other batch; everything else waits until staging and production both run on the new stack.
- Operate every platform through Terraform, CLIs, APIs and MCPs. A console step goes through `claude-in-chrome` only when no API covers it. The owner does only account creation, passwords, 2FA, payment and legal identity.
- A secret that only a browser can create (a first API token) is stored by the owner in the macOS Keychain; commands read it with `security find-generic-password -s <service> -w` and never print it. Keychain services in use: `orbit-cloudflare-api-token`, `orbit-stripe-test-secret-key`.
- After a migration is verified live, nothing stale stays active: cancel the retired subscriptions and delete the retired projects, after a final backup. A permanent deletion that only a browser can do is the owner's click.
- The production database copy loses zero rows: writes frozen during the dump, every table verified by row count and checksum, the old database paused until the owner signs off.
- Before the public launch, a production outage keeps its place in the batch order; it jumps the queue only after launch.
- Record every infrastructure decision and research result in the brain (`/brain`) as it is made.
- A merge to `main` never deploys production once Batch M lands. Staging deploys automatically from the integration branch (`redesign/main` while THE REDESIGN GATE is open, `main` after it). Production deploys only through the manual release workflows, behind the GitHub Environment `production` with the owner as required reviewer, and the `/release` skill runs them.
- Play internal and closed tracks carry staging builds (staging API baked in); open and production tracks carry production builds. Never promote a binary between tracks.
- After a verified cutover, cancel the plans Orbit no longer uses (Vercel Pro, Resend Pro) and pause what is left on retired platforms (Supabase). Permanent deletion of an old project or its data stays the owner's.
- Android fixes merged to `main` ship to the open track through `/android-release` (through `/release` once Batch M lands); the owner approved releasing them.
- Route redesign-only work to `redesign/main`; route shipped defects, performance and egress fixes, harness work, CI and security work to `main`. If a shared fix depends on redesign code, land it on `redesign/main` and backport it to `main`.
- Keep `redesign/main` synced with `main` in both code repositories: #556 carries `orbit-ui-mobile` and #746 carries `orbit-api`. Sync pull requests merge by squash, so `main` never becomes an ancestor of `redesign/main`; each sync cherry-picks with `-x` only the `main` commits added since the last one, skipping any already carried, and changes no behaviour beyond carrying them.
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
- The orchestrator merges a pull request with `gh pr merge --squash --match-head-commit <sha>` after the exact head has green checks, a Pullfrog approval submitted after its push, and zero unresolved threads. Redesign-only work merges to `redesign/main`; other work merges to `main`. Production auto-deploy is off: a merge to `main` deploys nothing, and production deploys only through the release workflows after the owner approves the `production` environment.
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

## The order

Reconcile the open board with these batches before each handoff. Place each new ticket exactly once. A batch completes before the next begins. Within a batch, use dependency order; drive already open pull requests first.

### Batch M: move to the new stack, before everything

The decision and its research: brain ADR `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. File one ticket per coherent piece (`repo:api`, `repo:ui` or `repo:landing`, `needs:no-conversation`) and place every one here. The batch ends when staging and production both run on the new stack, every item below is verified live, and the retired plans are cancelled.

1. Tooling: DONE. Terraform, the AWS CLI, the Render CLI, libpq (`psql`, `pg_dump`) and the Render MCP (user scope, next session) are installed and proven by read calls; AWS, Cloudflare, Render, PostHog, Sentry and Supabase all answer.
2. Infrastructure as code in `orbit-api` `infra/`: the official Render Terraform provider (`render-oss/render`) for the production and staging services, Postgres and environment groups; the AWS provider for SES; the Cloudflare provider for DNS (move `useorbit.org` DNS from Spaceship to Cloudflare, which Turnstile needs anyway). Terraform state never enters a repository (they are public): an S3 backend with native locking in the AWS account, and a local state file outside every repository until that account exists (`terraform init -migrate-state` moves it). Import the existing production API service (`srv-d6tc2isr85hc739bf75g`, Ohio) so its URL does not change.
3. Production: API web service, Next.js web service (standalone Docker image built in GitHub Actions, pushed to GHCR, deployed by digest), landing as a Render static site, Render Postgres 17 in the same region. Size from measured use (the API averaged 0.004 CPU and 343 MB over 30 days): API and web at 0.5 CPU / 512 MB, Postgres 1 GB; raise the API to 1 CPU / 2 GB when memory nears its limit.
4. Staging: web on the free plan; API on the free plan with a scheduled `/health` ping every 5 minutes only between 08:00 and 24:00 America/Sao_Paulo (the 750 free instance hours a month are shared by every free service); Postgres on the free plan, recreated and re-seeded by a scheduled workflow every 4 weeks (free databases expire 30 days after creation). Staging deploys automatically from the integration branch.
5. Data: copy the production database from Supabase to Render Postgres (schema and data, including `hangfire`) in a short maintenance window, verify row counts table by table, switch the API connection string, and verify the live app end to end.
6. Google sign-in in the API, web and Android, including the calendar scopes, replacing Supabase Auth. Keep the Supabase Auth path working for installed Android builds until `AppConfig.MinSupportedVersion` passes the first build with the new sign-in (expand, then contract). Add the new redirect URIs to the existing Google OAuth client.
7. Email on Amazon SES: verified domain with DKIM through Terraform, production access, bounce and complaint handling, and the waitlist contacts moved from Resend into Orbit's own database.
8. Release workflows: `orbit-api` `deploy-api.yml` (build, EF Core migration bundle, deploy, health check, GitHub Deployment record); `orbit-ui-mobile` `deploy-web.yml` and `android-release.yml` mapping the track to the API base (internal and closed to staging, open and production to production). Turn off Render auto-deploy and Vercel auto-deploy.
9. The `/release` skill in `orbit-ui-mobile`: compare each service's last production deployment with the current head (API, web, Android), deploy only the services with undeployed changes, in the order API, web, Android, wait for each and verify it; it also serves staging.
10. Cutover and retirement: move `app.useorbit.org` and `useorbit.org` to Render, then cancel Vercel Pro and remove its domains; cancel Resend Pro after SES is live; pause the Supabase project after its Auth path is retired, keeping a final database dump. Once the owner signs off on the verified migration, delete the retired projects and cancel every retired subscription so nothing stale stays active; a permanent deletion that only a browser can do is the owner's click. Record each step in the brain.

Owner rules for Batch M: the production copy loses zero rows (writes frozen during the dump, every table verified by row count and checksum, Supabase paused until sign-off); staging seeds sample data for the owner's account only; PostHog replaces Vercel Analytics and Speed Insights; both databases stay reachable through the Render MCP and `psql`; MCPs, CLIs and APIs come before the browser.

Tickets, in dependency order (`#793`, `#795`, `#796`, `#798`, `#799`, `#794`, `#804`, `#800`, `#802`, `#83`, `#803`, `#807` to `#813` are done):

- `#814` Reject Terraform plans that update a web service in place (api, `api#631` open); Render provider v1.9.1 turns a digest image path into a tag on any service update, so a checked-in guard runs on every saved plan before apply, locally and as tests in `terraform.yml`
- `#801` Staging keep-alive and 4-weekly database recreate and reseed (api, `api#626`: approved, blocked only on the GitGuardian false positive the owner clears); after merge, move `render_postgres.staging` into the separate `infra/staging-database` state with the documented `state rm` and `import`
- `#806` File uploads from Supabase Storage to S3, with a stable API read route that redirects to a fresh presigned GET (api, `api#625`: blocked only on accepting SonarCloud `terraform:S6258` for the access-log bucket); `Storage:Provider` switches to S3 only after the web CSP (`#807`, merged) is live on the serving web host; Supabase Storage already answers HTTP 402
- `#797` Email through Amazon SES with bounce and complaint handling (api, `api#628`: approved, SonarCloud still red on new-code findings); then apply its Terraform (SES identities and DKIM records in Cloudflare), request SES production access, and switch `production_email_provider` and `staging_email_provider` in `local.tfvars`
- `#84` The analytics opt-out toggle on web and mobile (ui, targets `redesign/main`, placed in the marketing-consent section of the Perfil settings surface)
- `#815` Capture the first web pageview after PostHog opts in (ui, `main`): app.useorbit.org sends `$opt_in` and `$pageleave` but no `$pageview`, so the dashboard's app pageview, sign-in funnel and Web Vitals tiles stay empty until it lands
- `#805` Web privacy disclosures for the Render, SES, S3 and PostHog processors (ui, `ui#1217`); merges only at cutover, once those processors are live; its transfers sentence says the LGPD safeguards, not adequacy decisions or standard contractual clauses (owner decision in the ticket's comment)
- Operations after the code lands, in order: copy the production database from Supabase to Render (the owner authorized this unattended as the next run's first step; zero rows lost, writes frozen, every table verified by count and checksum); switch the production API connection to Render Postgres and remove the imported API's duplicated direct variables once the linked group is verified; create `orbit-web` from the first production image (built by the owner-approved `deploy-web.yml` run) and set `RENDER_WEB_SERVICE_ID`; cut `app.useorbit.org`, `useorbit.org` and `www` over to Render and set `PRODUCTION_WEB_CUTOVER=true`; switch uploads to S3 and email to SES; cancel Vercel Pro and Resend Pro; pause Supabase after its Auth path is retired and the owner signs off; the owner deletes the retired projects

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

The gate runs on the new staging after Batch M: staging deploys `redesign/main` of both repositories, and the closed test build goes to the internal and closed tracks with the staging API baked in. The run deploys it, verifies it, and stops for the owner's approval.

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
- Production deploys only through `deploy-api.yml`, `deploy-web.yml` and `android-release.yml` (open and production tracks), run by `/release`, each waiting for the owner's `production` approval. Render auto-deploy is off for the production API. Applying Terraform to `render_web_service.production_api` makes Render deploy the branch head outside that gate: cancel that deploy (`POST /v1/services/{id}/deploys/{deployId}/cancel`) unless an approved release of the same commit is intended. Environment group updates start no deploy; the service picks them up at its next deploy.
- Render provider v1.9.1 turns a digest image path into a tag on any web service update, so an existing web service is never updated through Terraform; the release workflows own web digests (`ignore_changes` on the digest) and the `#814` guard rejects in-place web service updates before apply.
- The staging API (`orbit-api-staging`, free) auto-deploys `orbit-api` `redesign/main`; the staging web (`orbit-web-staging`, `srv-dass1t0jo6nc73d5s340`) takes each image `web-image.yml` builds on a push to `orbit-ui-mobile` `redesign/main`. Health: `https://orbit-api-staging-uqu2.onrender.com/health` and `https://orbit-web-staging-eakn.onrender.com/api/health`; the custom hosts `api-staging.useorbit.org` and `staging.useorbit.org` resolve through Cloudflare. The GHCR package `orbit-web` is public, so Render pulls it without a credential.
- Staging billing runs on Stripe test mode: product, four prices and the webhook exist, with ids and secrets in SSM `/orbit/staging/api/Stripe__*`; `Stripe:PublishableKey` was deleted because nothing read it.
- `useorbit.org` DNS is served by Cloudflare (zone `3f80ecc2735314886702b6643b15d150`, nameservers `candy` and `tom`). Cloudflare DNSSEC signs the zone (KSK key tag 2371, algorithm 13); its DS record (digest type 2, digest `550CC9A0902AC2319B30F903A53F7D487E2172A4B2E65C587348A0867EC2DC46`) is added at Spaceship > useorbit.org > DNSSEC. Never add a DS whose zone is not the delegated, signed one: that breaks resolution for validating resolvers.
- Apply Terraform only with `-target` lists that exclude the web services and the production API service unless the change is intended; a full plan still carries items that need the approved release first.
- The repositories stay public: GitHub-hosted CI is free only for public repositories (one day measured 21,300 Linux minutes across the three), CodeQL's licence covers only open source code, and GitHub Environment required reviewers are free only on public repositories. Never commit Terraform state or a secret.
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
- The Vercel landing project does not build any more (Ignored Build Step "Don't build anything"); the Vercel web project still deploys `main` until cutover.
- Dash Ban checks pull request titles and bodies too; strip em dashes from any worker report carried into a body.
- A worker order for `orbit-api` cannot file tickets itself (the ticket tools live in this repository); the orchestrator files what a worker reports. Tracked specs, prompts and skill output carry rules and current state without session history, dates, attribution or machine paths.

## Current state

The inventory below is a snapshot. Refresh it before acting with `gh pr list` in each repository.

Batch M is most of the way through. On the new stack now: the API runs on Render with auto-deploy off and deploys only through `deploy-api.yml` (the first run waits for the owner's approval, so production still serves the code merged before the release gate); Terraform owns Render, Cloudflare and AWS; `useorbit.org` DNS is delegated to Cloudflare with every record identical to the old Spaceship zone; staging web and API run on Render from `redesign/main`, with Stripe test billing configured; production web still runs on Vercel, the production database is still Supabase Postgres, uploads still target Supabase Storage (which answers HTTP 402, so uploads fail today), and email still goes through Resend.

Shipped on `main` and live on Vercel web: Google sign-in through the API authorization-code exchange (Supabase Auth is no longer used by web), PostHog client analytics behind the `analytics` flag row (enabled in production), signed-out `/ingest` requests, one open habit row menu at a time, the web CSP with the S3 bucket and API image origins, the `/release` skill, the public-host check after cutover, and the uncached mobile pre-commit lint. The Android side of these ships with the next open-track build.

Staging login is broken: the email code is never sent (staging email configuration), and Google sign-in on staging still goes through Supabase because `redesign/main` does not yet carry `#1219`; the `#556` carry of `main`'s newest seven commits is the fix for the second.

Open pull requests:

- `api#628` SES (approved; SonarCloud red on new-code findings), `api#631` web plan guard (first review round), `api#626` staging lifecycle (approved; GitGuardian false positive), `api#625` S3 uploads (SonarCloud `terraform:S6258` on the access-log bucket), `ui#1217` privacy processors (held until cutover).

Waiting on the owner:

- Approve the waiting `Deploy API` run in `orbit-api` (production environment).
- Accept SonarCloud `terraform:S6258` on `api#625` and resolve GitGuardian incident 37676070 on `api#626` as a test credential; both are false positives only a signed-in human can clear.
- The redesign approval at THE REDESIGN GATE, on staging.
- A device test of `#390` (bulk log replay) and `#134` (three-dot menu) on the current open-track build.
- After the migration is verified: the final delete click on the Supabase project, the Vercel projects and Resend.

Watch windows: `#565` closes seven days after the web deploy of `f0322e3a` and `#566` seven days after Android 1.3.37 went live, if Sentry shows no recurrence of ORBIT-WEB-C or ORBIT-MOBILE-5.

Stale worktrees: every worktree of a merged branch is clean and removable with `node tools/teardown-worktree.mjs`; list them with `git worktree list` in each repository and verify each before removing it.
