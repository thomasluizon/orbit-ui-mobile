/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md`, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first (the previous record carries 21 remaining tickets and a 24-row readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instruction for this run

Every issue from the owner's staging review gets fixed, plus many sweeps until nothing is wrong: the redesign is far from acceptable right now. Treat that as the top priority beside Batch M's remaining merges. Every reported issue and every sweep finding is in the spec's `### Batch R` and its `## Rendered sweep findings to file`. After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep.

The owner's review asked for these, and every one must reach staging: Calendário as one centred column (on staging); Perfil with full-row hover and focus, correct group spacing, settings inline, the duplicate Preferências, Avançado and Recursos de IA pages removed, Suporte opening the support form, and clear copy for the API keys row and the trial heading (`ui#1247`); Sobre without its internal naming note (on staging); Astra on desktop as a side panel with one focus ring (`ui#1242`); Progresso without the repeating error toast and with a centred column (on staging); `⌘K` on a Mac (on staging); a stale page after a web release that recovers (production; `ui#1252` carries it); dialog pills of equal width with confirm labels that name the consequence (`ui#1251`). His gap decisions (search icon in the Hoje date row, Google import kept inside Calendário, trial accounts see the Pro pitch, every Astra write previewed first) are standing rules in the spec.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff time the board had 157 open tickets, all 157 placed in the spec's `## The order` (0 unplaced, 0 placed twice; `#852`, `#854` and `#868` are placed inline in the bullets of `#844`, `#853` and `#866`).

## In flight (verify each first)

| item | disposition |
|---|---|
| `ui#1242` Astra side panel (`#835`) | approved at head `d6b3c84c`, every check green, one commit behind `redesign/main` (spec and prompt only): confirm zero unresolved threads with `list-bot-threads.mjs --wait-seconds 0`, then merge |
| `ui#1249` account boundary reset (`#855`, `main`) | review fix `549e1c4c` committed in worktree `ticket-855-account-boundary-reset`, not pushed; its report is already merged into the body: resolve the one Pullfrog thread (`fixed in 549e1c4c`), push, wait for approval, merge, release production web, then carry into `redesign/main` |
| `ui#1250` habit detail (`#846`) | review fix `fabf2881` committed in worktree `ticket-846-habit-detail-fixes`, not pushed; report merged into the body: resolve its two Pullfrog threads, push, wait for approval, merge |
| `ui#1247` Perfil (`#837`) | SonarCloud review fix pushed at `9a4370a5`, body updated: wait for the SonarCloud gate and a fresh Pullfrog approval; request one with `--re-review` if the incremental review posts none |
| `ui#1252` carry of `#834` | manifest regenerated and pushed at `407f1246` (Surface Manifest Drift was the only red): wait for checks and a fresh approval, merge |
| `ui#1251` dialog pills (`#839`) | Pullfrog commented at `c5004d5f`: `user-facts.delete` lacks a consequence label, and SonarCloud reads 78.7% new-code coverage. Compose one `--review-batch` worker for both (label in both locales, red test first, coverage past 80%), approve the copy with `/second-opinion`, file nothing |
| `ui#1253` pushed-screen shell (`#856`) | opened by its worker at `7f403a88` with the broad suites green: read the worker log tail for `NEEDS_DECISION`, read the body's assumptions, then drive review; file the object-view heading follow-up its body names |
| `ui#1217` privacy (`#805`) | held until email runs on SES; local commit `48bdf5a1` unpushed in worktree `ticket-805-privacy-processors`; three threads open |
| `#838` Sobre note | merged (`ui#1245`) and on staging: close it with `complete-ticket.mjs` |
| Sweep findings | none filed; the spec's `## Rendered sweep findings to file` holds a 19-step filing plan with verified evidence: file N1 API and N1 UI first (both `main`), then S3-1 (Calendário drops a logged habit, API, `main`), then the rest in order, in small groups |
| Staging release | staging web runs `redesign/main` at `1709e5e0` (released and health checked); release again after the next redesign merges, then sweep |
| SES production access | case `179056896000159`: `aws sesv2 get-account` still reports `DENIED`; AWS owes the reply |
| Sweep browser | local Mac Chrome ("Browser 2"); the MCP group now lives in a normal, resizable window, not the owner's full-screen one; stay within 1352 by 849 (spec Constraints) |
| Staging data | "Caminhar" and the test habit "Beber água" are both logged today in the owner's staging account; delete "Beber água" when the sweeps no longer need it |
| GraphQL budget | exhausted during the session; it resets hourly. Probe with `gh api graphql -f query='query{rateLimit{remaining resetAt}}'`; use REST reads and file tickets in small groups |
| Running workers | none (the `#837`, `#846`, `#855` and `#856` workers all exited; their results are the rows above) |
| Stashes | none in any of the three repositories |
| Uncommitted work | none in the three main checkouts or in the in-flight worktrees |
| Ignored files | `orbit-api/infra/local.tfvars` holds the web digests, the Render database choice, the landing apex-only domain list, and both storage providers set to `S3` |
| Other worktrees | ticket worktrees of merged tickets remain (for example `ticket-834-stale-server-action`); tear them down per the spec, one at a time |

## Then, in order

1. The in-flight rows above: merge `ui#1242`, deliver the `ui#1249` and `ui#1250` review fixes, drive `ui#1247`, `ui#1252`, `ui#1253` to approval, send the `ui#1251` review batch, merge what meets the bar, release production web after `ui#1249`, release staging web after the redesign merges.
2. The spec's `### Batch R`: file the sweep findings by the filing plan (N1 first, on `main`), launch workers for the open Batch R tickets in the listed order within the local cap, the CPU load (load average above 20 on 18 cores means no new worker) and the admission gate, merge and release as they pass, then sweep staging at desktop and phone width and repeat.
3. The rest of `### Batch M` (the SES switch, then Resend, then `#805`).
4. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
5. Everything else in the spec's order: the rest of Batch E, Batch 0b and Batch 0c.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and the owner's instruction: carried, with the review list updated to what reached staging and the new Astra write decision added.
- Goal: carried, with fresh counts (157 open, 157 placed).
- In flight, `ui#1249`: carried (review fix finished and merged into the body; push waits on resolving its thread).
- In flight, `ui#1250`: carried (review fix finished and merged into the body; push waits on resolving its threads).
- In flight, `ui#1247`: carried (Sonar fix finished and pushed at `9a4370a5`; the worker was relaunched twice, once after the session end killed it, once for the owed UI review sweep).
- In flight, `#856`: carried as `ui#1253` (the worker was relaunched after the session end killed it and opened the pull request).
- In flight, `ui#1252`: carried (its red was the surface manifest, regenerated and pushed).
- In flight, `ui#1251`: carried (Pullfrog commented, it did not approve; the review batch is the next step).
- In flight, `ui#1242`: carried (approved at its head; merge after the thread check).
- In flight, `ui#1217`: carried.
- In flight, `#838`: carried (still open).
- In flight, second sweep findings: carried, now verified and folded with the third sweep's into one filing plan in the spec.
- In flight, staging release: done (staging web released at `1709e5e0`, health `ok`).
- In flight, SES, sweep browser, staging data, GraphQL budget, running workers, stashes, uncommitted work, ignored files, other worktrees: carried with fresh results.
- Steps 1 to 5: carried in the same order.

Every identifier here came from a previous session: treat each as a lead to verify.
