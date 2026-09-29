/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md`, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instruction for this run

Every issue from the owner's staging review gets fixed, plus many sweeps until nothing is wrong: the redesign is far from acceptable right now. Treat that as the top priority beside Batch M's remaining merges. After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep.

The owner's double orange ring report (the palette field "Buscar ou executar") must be fixed in the whole app: `#895` (`ui#1256`) is the first item below.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff time the board had 176 open tickets, all 176 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `ui#1256` focus rings (`#895`) | at `2ae50c93`, waiting for Pullfrog; review-fix attempts used 2 of 3; the local hermetic guard run passed 25 of 25 and failed on the double rings with the fix reverted. Merge on approval |
| `ui#1247` Perfil (`#837`) | approved at `8724a60a`, green: merge |
| `ui#1257` Astra thread (`#881`) | approved at `db41a69c`, green: merge |
| `ui#1258` the `#556` carry of `#855` and `#875` | approved at `7db0a4ca`, green: merge, then close `#855` |
| `ui#1262` row skip asks first (`#883`) | one Pullfrog thread open; copy already approved with `/second-opinion`: clear the thread, merge |
| `ui#1263` Hoje date row (`#865`) | one Pullfrog thread open: clear, merge |
| `ui#1264` habit detail strip (`#901`) | one Pullfrog thread open: clear, merge |
| `ui#1261` reload banner (`#872`, `main`) | one Pullfrog thread open; also make the web store extend `createVersionGateStoreState` instead of copying it; merge, release production web |
| `api#645` the `#746` carry of `#640` `#642` `#874` `#876` | one Pullfrog thread open: clear, merge, release the staging API |
| `ui#1217` privacy (`#805`, `main`) | held until email runs on SES; worktree `ticket-805-privacy-processors` has 1 unpushed commit |
| `#879` Hoje day states | commit `cbbac9ee` on `fix/ticket-879-hoje-day-states`, no pull request; needs `#878` on `redesign/main` through the next `#556` sync (`main` `75809748`) |
| Staging | web still runs `fa84c529`; `redesign/main` is at `a27525df` with `#898` and `#900`; release after the approved merges above, then sweep at both widths |
| Production | API `35e141da`, web `75809748`, Android 1.3.40 (99) on the open track |
| SES production access | case `179056896000159`: AWS owes the reply |
| Running workers | none; CI waiters from the last session exit on their own |
| Stashes | none in any of the three repositories |
| Uncommitted work | none in any worktree |
| Unpushed commits | `ticket-805-privacy-processors` (1) only |
| Ignored files | `orbit-api/infra/local.tfvars` (web digests, database choice, storage providers); Playwright Chromium 151 installed in `~/Library/Caches/ms-playwright` for local guard runs |
| Other worktrees | merged ticket worktrees remain in both repositories (for example `ticket-878`, `ticket-898`, `ticket-900`, `api` `ticket-876`); tear down with `teardown-worktree.mjs`, one at a time |

## Then, in order

1. The in-flight rows above, top to bottom: merge the four approved pull requests, clear the four single-thread reviews, merge `api#645` and release the staging API, then release `redesign/main` to staging and sweep at desktop and phone width (start with the owner's palette field, Perfil, the skip question, Hoje's date row and habit detail).
2. `#904` (Batch 0b, harness): the worker order's Chromium carve-out, on `main`.
3. The spec's `### Batch R`: launch workers for its filed tickets in the listed order within the local cap, the CPU load (load average above 20 on 18 cores means no new worker) and the admission gate; start a ticket whose files overlap an open pull request only after that one merges; file what each sweep finds into Batch R; repeat.
4. The rest of `### Batch M` (the SES switch, then Resend, then `#805`).
5. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
6. Everything else in the spec's order: `#903` and the rest of Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and the owner's instruction: carried.
- Goal: carried, with fresh counts (176 open, 176 placed).
- In flight, `ui#1256`: carried (batch 1 and batch 2 pushed; guard extended to the palette and every listed surface). `#556` salvage: done (salvaged, opened as `ui#1258`, now approved). `ui#1255`: done (Sonar coverage fixed, merged, released to production web and Android). `ui#1247`: carried (redirect fix and merge-forward pushed, now approved). `api#644`: done (thread fixed, merged, production API released). `ui#1257`: carried (two fixes and a merge-forward, now approved). `#879`: carried. `ui#1217`: carried. Staging web: carried (not yet released). Production: done (API, web and Android released). SES, stashes, uncommitted work, unpushed commits, ignored files, other worktrees: carried with fresh results. Running workers: done (none).
- Steps 1 to 5: carried, with step 1 rewritten for the new in-flight rows and `#904` added as step 2.

Every identifier here came from a previous session: treat each as a lead to verify.
