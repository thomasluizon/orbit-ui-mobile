/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md`, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instruction for this run

Every issue from the owner's staging review gets fixed, plus many sweeps until nothing is wrong: the redesign is far from acceptable right now. Treat that as the top priority beside Batch M's remaining merges. After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep.

The owner reported again, on staging, an input with two orange borders (the palette field "Buscar ou executar": its own focus ring inside the wrapper's ring), and said it must be fixed in the whole app. That is `#895` (`ui#1256`), now the first Batch R item: every focusable control in the app draws exactly one focus indicator, proven by a layout guard, and checked on every surface before merge (spec standing rules).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff time the board had 178 open tickets, all 178 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `ui#1256` focus ring base layer (`#895`) | approved at `96dc2d86`; a review batch is committed locally in worktree `ticket-895-focus-ring-layer` (1 commit ahead, not pushed): read the newest `#895-*.log` report, merge it into the body with `merge-review-batch-body.mjs --ui-scope`, push, get a fresh approval; walk every focusable field (palette, Busca, create form, sheets, Entrar, support form, Perfil inline controls) and extend the guard to the palette field before merge |
| `#556` carry of `#855` and `#875` | the worker hit the 45 minute ceiling in worktree `ticket-556-carry-account-reset` (branch never pushed): 8 commits plus 4 staged test files; salvage under `/orchestrate` step 7, open the pull request (`Refs #556`, `Closes #855`), drive review |
| `ui#1255` all-done celebration (`#878`, `main`) | approved at `9a56e5cf`; SonarCloud red on that head: fix in one review batch, merge, release production web, carry to `redesign/main` |
| `ui#1247` Perfil (`#837`) | merge-forward at `11740651` pushed; waiting for a fresh Pullfrog approval |
| `api#644` Calendário logged habit (`#876`, `main`) | at `6918f7a6`, Pullfrog commented with one open thread on that head: read, fix or file, merge; then release production API (carries `#640`, `#642`, `#874`) and production web (`#875`, `#878`); then carry `#874` and `#876` into `orbit-api` `redesign/main` (`#746`) and release the staging API |
| `ui#1257` Astra thread (`#881`) | opened by its worker at `05aac950`; drive review |
| `#879` Hoje day states | copy commit `cbbac9ee` pushed on `fix/ticket-879-hoje-day-states`, no pull request; waits for `#878` on `redesign/main` |
| `ui#1217` privacy (`#805`) | held until email runs on SES; local commit unpushed in worktree `ticket-805-privacy-processors` |
| Staging web | runs `redesign/main` at `fa84c529` (health `ok`); release again after the next redesign merges, then sweep |
| Production | web runs `main` at `ffae0d88` (`#855`); API runs `828b14bf` (behind `orbit-api` `main` by `#640`, `#642`, `#874`) |
| SES production access | case `179056896000159`: `aws sesv2 get-account` reported `DENIED`; AWS owes the reply |
| Sweep browser | local Mac Chrome ("Browser 2"); the window reports `visibilityState` `hidden`: finish animations before judging transitions, focus moves or Escape (spec Constraints); stay within 1352 by 849 |
| Staging data | "Caminhar" and "Beber água" are logged today in the owner's staging account; delete "Beber água" when sweeps no longer need it |
| Running workers | none known after handoff (the `#881` and `#556` workers exited; read their worktrees above) |
| Stashes | none in any of the three repositories |
| Uncommitted work | 4 staged test files in `ticket-556-carry-account-reset`; none elsewhere |
| Unpushed commits | `ticket-895-focus-ring-layer` (1), `ticket-805-privacy-processors` (1), `ticket-556-carry-account-reset` (branch never pushed) |
| Ignored files | `orbit-api/infra/local.tfvars` holds the web digests, the Render database choice, the landing apex-only domain list, and both storage providers set to `S3` |
| Other worktrees | many ticket worktrees of merged tickets remain in both repositories (for example `ticket-834`, `ticket-835`, `ticket-839`, `ticket-846`, `ticket-855`, `ticket-856`, `ticket-875`, `api` `ticket-874`); tear them down one at a time with `teardown-worktree.mjs`, never an unmerged one |

## Then, in order

1. The in-flight rows above, top to bottom: `#895` first, then the `#556` salvage, then the approvals and merges, then the production API and web releases, then the `#746` carry and the staging API release.
2. The spec's `### Batch R`: launch workers for its filed tickets in the listed order within the local cap, the CPU load (load average above 20 on 18 cores means no new worker) and the admission gate; merge and release as they pass; release `redesign/main` to staging after each batch of merges and sweep at desktop and phone width; file what the sweep finds into Batch R; repeat.
3. The rest of `### Batch M` (the SES switch, then Resend, then `#805`).
4. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
5. Everything else in the spec's order: the rest of Batch E, Batch 0b and Batch 0c.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and the owner's instruction: carried, with the owner's new double-ring report added.
- Goal: carried, with fresh counts (178 open, 178 placed).
- In flight, `ui#1242`: done (merged, `#835` closed). `ui#1249`: done (merged to `main`, released to production web). `ui#1250`: done (merged, `#846` closed). `ui#1252`: done (merged). `ui#1251`: done (merged after the review batch and a local merge test, `#839` closed). `ui#1253`: done (merged after the CodeQL and layout guard fixes, `#856` closed). `ui#1247`: carried (merge-forward pushed, awaiting approval). `ui#1217`: carried. `#838`: done (closed).
- In flight, sweep findings: done (all filed as `#874` to `#899`; `#880` cancelled as not reproduced; the unverified ones are listed in Batch R). Staging release: done (released at `fa84c529` and swept; findings filed as `#900` to `#902`). SES, sweep browser, staging data, GraphQL budget, workers, stashes, uncommitted work, ignored files, other worktrees: carried with fresh results.
- Steps 1 to 5: carried, with step 1 rewritten for the new in-flight rows.

Every identifier here came from a previous session: treat each as a lead to verify.
