/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run. Start every worker as a harness background task with no pipe and no trailing `&`.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instructions for this run

**Fix `#944` first**: the owner reported, again, that the last card on a screen (Perfil's "Apagar a conta") sits flush on the divider above the composer, with no space. The shell scroller has no bottom clearance, so fix it once in the shell on web and Android, remove per-page duplicates, and prove it with a layout spec over every destination at both widths. Every sweep from now on scrolls each screen to its end and checks that clearance.

Everything related to the redesign gets done. Every single thing. Every open redesign ticket (the spec's `### Batch R` and every other ticket whose work lands on `redesign/main` in any repository) is implemented, merged and closed, and staging runs all of it: web, API and landing released from `redesign/main`, and an internal Android build from `redesign/main` against the staging API once Batch R lands. After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep. The redesign is done only when the board holds no open redesign ticket, every staging service runs the `redesign/main` head, and a full sweep at both widths finds nothing. THE REDESIGN GATE then stays for the owner: never merge `redesign/main` to `main`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done and on staging, as above. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 149 open tickets, all 149 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `#944` shell scroller clearance | a worker was running on `fix/ticket-944-scroller-clearance` (log `#944-1790693156363.log` in the harness worker log directory); outcome unknown: read the worktree, deliver or salvage, then merge on the bar |
| `ui#1324` (`#942`) Modelos row | open at `ebaa47ea`, copy approved: wait for CI and review, then merge (merge-result check if behind) |
| `ui#1316` (`#939`) settled skips | open at `d0a674a5` (shared coverage test added): wait for CI and a fresh review, merge; then `#940` on `main` |
| `ui#1313` (`#870`) calendar sync fold | open at `15e45e62` (merge-forward, Sonar and coverage fixed): wait for CI and a fresh review, merge |
| `ui#1319` (`#884`) type names | open at `fb0ae33d` (review fix and merge-forward): wait for CI and a fresh review, merge |
| `ui#1318` (`#929`) weekday fit | a review-batch worker was running (log `#929-1790693632704.log`, launched detached so its exit wakes nothing): read the worktree; carry its report, resolve the P1, push |
| `ui#1321` (`#894`) Astra preview state | a review-batch worker was running (log `#894-1790693928758.log`): read the worktree; carry its report, resolve both P1s, push |
| `ui#1217` (`#805`, `main`) privacy | open at `c57afd16` (merged with `main`, threads answered, copy approved): wait for CI and a fresh Pullfrog approval, merge to `main`, release production web |
| `#943` Resend retirement | filed, not started (`repo:api`, `main`) |
| Staging web | release run 36586893361 of `redesign/main` `8eb6594d` was running: confirm `/api/health` reports that commit, then sweep |
| Staging API | `40efecfb`, running SES |
| Production | web `24160e3a`, API `a78ba3aa` (SES), Android 1.3.43 (102) open track |
| Waiters | a `wait-ci.mjs` and a `wait-release.mjs` from the previous session may still be alive; they end on their own |
| Stashes | none in any of the three repositories |
| Uncommitted work | none in the main checkouts; the running workers' worktrees above may hold theirs |
| Unpushed commits | none on the open pull request branches |
| Detached HEADs | `ticket-822-web-health-retry` and the scratch `integ` worktree under the previous session's scratchpad: removable with `git worktree remove` (no `--force`) |
| Ignored files | `orbit-api/infra/local.tfvars` now sets both email providers to `Ses` and both alarm emails; the previous session's decision log stayed in its scratchpad |

## Then, in order

1. `#944`, then the in-flight rows above, top to bottom; merge each on the bar (pull requests behind `redesign/main` merge on one combined local merge-result check), release `redesign/main` web and the staging API after each merged batch, then sweep at desktop and phone width, scrolled to the end.
2. The spec's `### Batch R` filed tickets in their listed order, starting with `#941`, `#893`, `#936`, `#869`, `#868`, `#841`, `#850`, `#847`, `#851`, `#892`, `#934`, `#935`, `#932`, then the `main` tickets, plus the unfiled sweep findings listed there (file them first), within the local cap, the one-minute load average (above 20 on 18 cores means no new worker) and the admission gate (10 open pull requests plus live reservations).
3. `#940` on `main` after `#939` merges, then release production web and an Android open-track build.
4. Every other ticket whose work lands on `redesign/main` (`orbit-api` and `orbit-landing-page` included), then release every staging service from `redesign/main` and ship an internal Android build from `redesign/main` through `/android-release`.
5. The rest of `### Batch M`: `#805`, then `#943`, then the retired-project list for the owner.
6. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
7. Everything else in the spec's order: Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried (plus the no-trailing-`&` launch rule).
- The owner's `#942` instruction: done in `ui#1324` (drawn geometry, restored glyphs, layout spec, label decided and approved); merge carried. A new owner instruction (`#944`) now leads.
- The owner's instruction to finish everything redesign and sweep until nothing is wrong: carried.
- Goal: carried, with fresh counts (149 open, 149 placed).
- In flight: `ui#1316` carried (P1 fixed, coverage fixed). `ui#1317` done (merged `55d813e8`). `ui#1313` carried (merge-forward, Sonar, coverage). `ui#1320` done (merged `4bd58eb7`). `ui#1318` carried (worker running). `ui#1319` carried (P1 fixed, merge-forward). `ui#1321` carried (worker running). `ui#1322` done (merged `8eb6594d`). `ui#1323` done (merged `3c58ceb6`). `ui#1217` carried (unblocked by SES). Board closures `#916`, `#919` done, plus `#871`, `#928`, `#930`, `#852`. SES production access: done (granted, switched, verified, Resend Pro cancelled). Staging and production: carried with fresh values. Stashes, uncommitted work, unpushed commits, detached HEADs, ignored files: carried with fresh results.
- Step 1 (`#942`, then in-flight rows, sweep): carried as step 1 with `#944` first. Steps 2 to 7: carried; step 5 now lists `#943`.

Every identifier here came from a previous session: treat each as a lead to verify.
