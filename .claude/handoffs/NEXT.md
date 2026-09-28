/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log) and `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md`, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instruction for this run

Every issue from the owner's staging review gets fixed, plus many sweeps until nothing is wrong: the redesign is far from acceptable right now. Treat that as the top priority beside Batch M's remaining merges. Every reported issue and every sweep finding is in the spec's `### Batch R` and its `## Rendered sweep findings to file`. After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep.

The owner's review asked for these, and every one must reach staging: Calendário as one centred column (merged); Perfil with full-row hover and focus, correct group spacing, settings inline, the duplicate Preferências, Avançado and Recursos de IA pages removed, Suporte opening the support form, and clear copy for the API keys row and the trial heading (`ui#1247`); Sobre without its internal naming note (merged, on staging); Astra on desktop as a side panel with one focus ring (`ui#1242`); Progresso without the repeating error toast and with a centred column (merged); `⌘K` on a Mac (on staging); a stale page after a web release that recovers (production; `ui#1252` carries it); dialog pills of equal width with confirm labels that name the consequence (`ui#1251`). His three gap decisions (search icon in the Hoje date row, Google import kept inside Calendário, trial accounts see the Pro pitch) are standing rules in the spec.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff time the board had 157 open tickets, all 157 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `ui#1249` account boundary reset (`#855`, `main`) | Pullfrog CAUTION: Android sign-out teardown refetches and a 401 can skip refresh-token revocation. A review-fix worker finished with local commit `549e1c4c` in worktree `ticket-855-account-boundary-reset` (unpushed): merge its final report into the body (`merge-review-batch-body.mjs`), resolve the thread, push, wait for approval, merge, release production web, then carry into `redesign/main` |
| `ui#1250` habit detail (`#846`) | Pullfrog found the rescue gate reads the history date and mixes timezones. A review-fix worker was running (log `#846-1790621710078.log` in the worker log folder); worktree `ticket-846-habit-detail-fixes` holds unpushed commits ending at `fabf2881` at handoff: read the worker exit, then report, resolve, push |
| `ui#1247` Perfil (`#837`) | approved at `bec75678`; SonarCloud gate fails (coverage 75.7% of 80%, duplication 8.6% of 3%). A review-fix worker was running (log `#837-1790621283673.log`); worktree `ticket-837-perfil-rows-settings` was dirty mid-run: read its exit and commits, then report, push |
| `#856` pushed-screen shell | a worker was running (log `#856-1790621350538.log`, branch `fix/ticket-856-pushed-screen-shell`, 75-minute ceiling); worktree dirty mid-run: read its exit; it opens its own pull request or needs salvage |
| `ui#1252` carry of `#834` into `redesign/main` | open with its review harness, waiting on CI and Pullfrog: merge on the bar |
| `ui#1251` dialog pills (`#839`) | open, copy approved (`/second-opinion` AGREE), waiting on CI and Pullfrog: merge on the bar |
| `ui#1242` Astra side panel (`#835`) | merged forward with Calendário (`d6b3c84c`), thread resolved; needs a fresh Pullfrog approval at its head: merge on the bar |
| `ui#1217` privacy (`#805`) | held until email runs on SES; local commit `48bdf5a1` unpushed in worktree `ticket-805-privacy-processors`; three threads open |
| `#838` Sobre note | merged (`ui#1245`) and on staging: close it with `complete-ticket.mjs` |
| Second sweep findings | 25 findings (N1 to N25) in the spec's `## Rendered sweep findings to file`, not yet filed: file N1 (unlog of a habit logged today fails, shipped on `main`) first |
| Staging release | staging web runs `4966c19d`; `redesign/main` now carries Calendário, Progresso and the credential carry: release staging web after the next merges, then sweep |
| SES production access | case `179056896000159`: AWS owes the reply; `aws sesv2 get-account` reported `DENIED` |
| Sweep browser | the owner's local Chrome holds a staging session on `app-staging.useorbit.org` and is in full screen (1352 by 758): test that a phone-width resize changes `innerWidth` before the phone sweep |
| Staging data | Caminhar is logged for today on the owner's staging account; test habits from the sweep are deleted; the sweep's logs earned XP and three new notifications exist |
| GraphQL budget | exhausted twice; it resets hourly. Use REST reads, `--wait-seconds 0` on `list-bot-threads.mjs`, and file tickets in small groups (spec Constraints) |
| Running workers | the four above (`#855` finished; `#846`, `#837`, `#856` running at handoff); outcome unknown until each exit is read |
| Stashes | none in any of the three repositories |
| Uncommitted work | none in the three main checkouts; worker worktrees `ticket-837-perfil-rows-settings` and `ticket-856-pushed-screen-shell` were dirty mid-run |
| Ignored files | `orbit-api/infra/local.tfvars` holds the web digests, the Render database choice, the landing apex-only domain list, and both storage providers set to `S3` |
| Other worktrees | ticket worktrees of merged tickets remain; tear them down per the spec, one at a time |

## Then, in order

1. The in-flight rows above: read each worker exit, deliver the review fixes, merge what meets the bar, release production web after `ui#1249`, release staging web after the redesign merges.
2. The spec's `### Batch R`: file the second sweep's findings (N1 first, on `main`), launch workers for the open Batch R tickets in the listed order within the local cap, the CPU load and the admission gate, merge and release as they pass, then sweep staging at desktop and phone width and repeat.
3. The rest of `### Batch M` (the SES switch, then Resend, then `#805`).
4. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
5. Everything else in the spec's order: the rest of Batch E, Batch 0b and Batch 0c.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and the owner's instruction: carried, with the review list updated to what reached staging.
- Goal: carried, with fresh counts (157 open, 157 placed).
- In flight, `ui#1243`: done (merged `393062c0`; production web released at it, smoke passed; PostHog shows `$pageview` on `app.useorbit.org` after the release).
- In flight, `ui#1240`: done (carried `#1243` and `#1239` too, merged `ec20250e`; `#831` closed).
- In flight, `ui#1245`: done (merged `4966c19d`, on staging); the ticket close carried as `#838`.
- In flight, `ui#1248`: done (merged `28b9ff1e`; `#843` closed).
- In flight, `ui#1242`: carried (merged forward, thread resolved, awaiting approval).
- In flight, `ui#1246`: done (merged `f4129ffc`; `#840` closed).
- In flight, `ui#1247`: carried (review fixed and approved; SonarCloud gate carried).
- In flight, `ui#1217`: carried.
- In flight, `#836`: done (staging shows `⌘K`; closed).
- In flight, `#833`: done (cutover run and verified; evidence on the ticket; the email code sign-in on the new host was not verified by the run).
- In flight, SES: carried.
- In flight, rendered sweep findings (49): done (filed as `#857` to `#871`, plus `#856`; X7 and B2 no longer reproduce).
- In flight, unfiled Batch R findings: done (`#855`, `#856`, `#866`, `#868`, `#869`, and comments on `#849`, `#852`).
- In flight, board status of closed tickets: superseded (the whole-board list was wrong; repair per ticket from a fresh read, spec Current state).
- In flight, staging data, stashes, uncommitted work, ignored files, other worktrees: carried with fresh results.
- Steps 1 to 5: carried in the same order.

Every identifier here came from a previous session: treat each as a lead to verify.
