/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then the brain ADR `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log) through the Obsidian MCP. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md`, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instruction for this run

Every issue from the owner's staging review gets fixed, plus many sweeps until nothing is wrong: the redesign is far from acceptable right now. Treat that as the top priority beside Batch M's remaining merges. Every reported issue is in the spec's `### Batch R` (filed tickets and findings still to file). After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep: of five tried, two gave up and one called a drifted screen close.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 132 open tickets, all 132 placed in the spec's `## The order` (0 unplaced, 0 placed twice); `#833` is placed although GitHub closed it, because its cutover has not run and it must be reopened.

## In flight (verify each first)

| item | disposition |
|---|---|
| `api#641` API credential carry to `redesign/main` (`#746`, `#830`) | approved and green at `f1c201ec`: merge, release staging API from `redesign/main`, run `Staging Postgres access reconciliation`, delete the `orbit-api` repository-level `RENDER_API_KEY`, close `#830` |
| `ui#1238` Today first-tap and hydration carry (`#827`, `#556`) | approved at `a79ec9c4`; its body's motion line was fixed and one infrastructure unit-test failure re-run: confirm green, merge, release staging web, close `#827` |
| `ui#1243` production web deploy correlation on `main` (`#831`) | new, CI and review pending: drive to merge, release production web once |
| `ui#1240` web credential carry to `redesign/main` (`#556`, `#831`) | one Pullfrog thread (the production correlation): after `ui#1243` merges, cherry-pick its squash with `-x` onto this branch, resolve the thread, push, merge; then close `#831` |
| `ui#1239` PostHog first pageview on `main` (`#815`) | approved at `5abe7c39`, cancelled checks re-run: merge, release production web, confirm a `$pageview` for `app.useorbit.org` in PostHog |
| `ui#1241` stale Server Action recovery on `main` (`#834`) | approved; approve its new copy (`errors.api.appUpdated`) with `/second-opinion` before merge; then carry to `redesign/main` through `#556` |
| `ui#1242` Astra desktop (`#835`) | the worker's side-panel commit `228bd140` is local and unpushed in worktree `ticket-835-astra-desktop-column`; its report is in `$TMPDIR/orbit-workers/#835-*.log` (newest): merge the report into the body, push, clear review |
| `ui#1244` palette hint (`#836`) | opened by a worker; CI and review not read |
| `ui#1217` privacy (`#805`) | held until email runs on SES; local commit `48bdf5a1` unpushed; three threads open |
| `#833` staging host rename | code merged in `api#640`, ticket auto-closed on merge; reopen it and run the cutover in the spec's Batch M |
| SES production access | AWS case `179056896000159` waits on AWS; reading it needs the owner's console sign-in; `sesv2 get-account` still reports `DENIED` |
| Tickets `#834` to `#840` | filed; `#837`, `#838`, `#839`, `#840` have no worker yet |
| Sweep findings not yet filed | listed in Batch R: Calendário rebuild, the create dialog, habit detail, the Hoje row indent, Wrapped centring, web push, the Astra dock width, staging sync and overfetch; file each first |
| Running workers | none |
| Stashes | none in any of the three repositories |
| Uncommitted work | none in the three main checkouts; unpushed commits exist only in `ticket-835-astra-desktop-column` (`228bd140`) and `ticket-805-privacy-processors` (`48bdf5a1`) |
| Ignored files | `orbit-api/infra/local.tfvars` holds the web digests, the Render database choice, the landing apex-only domain list, and both storage providers set to `S3`; the provider cache under `infra/.terraform` in the `ticket-833-app-staging-host` worktree is disposable |
| Other worktrees | every other worktree belongs to a merged branch (about 145 in `orbit-ui-mobile`, 100 in `orbit-api`, 17 in `orbit-landing-page`); the detached `ticket-822-web-health-retry` sits on a merged `main` commit; tear them down per the spec's stale worktree note |

## Then, in order

1. The in-flight rows above: merges and releases first (they are ready), then the two carries, then `#833`'s cutover at a time nobody is testing on staging.
2. The spec's `### Batch R`: file the unfiled findings, launch workers for every open Batch R ticket within the local cap, merge and release as they pass, then sweep staging again and repeat. Start the next sweep with the screens not yet swept (listed in Batch R) and the phone width.
3. The rest of `### Batch M`, ending with its operations line (the SES switch, then Resend, then `#805`).
4. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
5. Everything else in the spec's order: the rest of Batch E, Batch 0b and Batch 0c.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried, extended with the owner's merge-and-release rule for redesign fixes and the staging test data permission.
- Goal: carried, with fresh counts (132 open, 132 placed).
- In flight, `#829` / `landing#95`: done (merged `69a983d`; production and staging landing releases passed on environment keys; repository key deleted; ticket closed).
- In flight, `#830` / `api#639`: merged (`828b14bf`); the rest carried through `api#641`.
- In flight, `#831` / `ui#1237`: merged (`fded1d9`); `android-internal` created, `staging` restricted to `main`, repository key deleted; the rest carried through `ui#1243` and `ui#1240`.
- In flight, repository-level `RENDER_API_KEY`: done for landing and web; carried for the API.
- In flight, `ui#1238`: carried (fixed for the Lighthouse regression, approved, now waiting on a re-run).
- In flight, `landing#94` / `#828`: done (rebuilt as a pure carry, merged `aa65bd7`; the staging landing release found the build marker; ticket closed). Its sync-only marker fix became `#832` on `main` (`landing#96`, merged `2720224`, ticket closed).
- In flight, `ui#1217`: carried.
- In flight, SES: carried (still `DENIED`, case unread without the owner's sign-in).
- In flight, local branch `carry-next-dlq-alarm`: done (deleted; its content is on `redesign/main`).
- In flight, detached scratch worktrees `merge-api-583` and `merge-api-584`: done (their staged files matched `main`; all seven detached `orbit-api` scratch worktrees removed).
- In flight, stashes and ignored files: carried (unchanged).
- In flight, other worktrees: carried.
- Step 1 (in-flight rows): mostly done, the rest carried above. Step 2 (Batch M): carried; `#818` closed, the host rename filed as `#833`, `#815` in review. Step 3 (gate): carried. Step 4 (other batches): carried. Step 5 (owner decisions): carried in the spec's standing rules, with the new review decisions added there.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
