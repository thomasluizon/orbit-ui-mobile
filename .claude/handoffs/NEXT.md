/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md`, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instruction for this run

Every issue from the owner's staging review gets fixed, plus many sweeps until nothing is wrong: the redesign is far from acceptable right now. Treat that as the top priority beside Batch M's remaining merges. After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff time the board had 175 open tickets, all 175 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `ui#1271` Layout Guard fix (`#909`) | at `3c1a8d57`, waiting for CI and Pullfrog; the full hermetic layout project passed locally (115). Merge first: `redesign/main`'s Layout Guard is red without it, so every other `redesign/main` pull request carries that red check |
| `ui#1268` `#556` carry of `main`'s all-done fix | approved at `7677c71e`; after `ui#1271` merges, merge `redesign/main` into it, push, merge on the fresh green run |
| `ui#1266` composer fit (`#896`) | approved at `3f49b4aa`; same merge-forward, then merge |
| `ui#1267` neutral send (`#858`) | approved at `c40daf91`, copy approved; shares `composer.tsx` with `ui#1266`: merge-forward after it, then merge |
| `ui#1269` empty goals and no back-to-top (`#891`) | approved at `a95b2e0f`, copy approved; same merge-forward, then merge |
| `ui#1263` Hoje date row (`#865`) | at `e8a33998` after a merge-forward, waiting for Pullfrog; clear the review, merge |
| `ui#1264` habit detail strip (`#901`) | at `d9cd23c0`, review fix pushed, waiting for Pullfrog; merge-forward after `ui#1271`, merge |
| `ui#1270` palette focus and Busca (`#887`) | at `189eff9c`, waiting for CI and Pullfrog; copy approved |
| `ui#1265` Chromium carve-out (`#904`, `main`) | at `5d03b2df`, both threads fixed and resolved, waiting for Pullfrog; merge to `main`, then carry with `#556` |
| `ui#1262` row skip asks first (`#883`) | one P1 thread open; its API fix `#905` is merged on `orbit-api` `main` and live in production: carry it with `#746`, release the staging API, answer the thread, merge |
| `#746` carry of `orbit-api` `main` `8ccf2278` | not started (admission was full); start it as soon as a slot frees |
| `#890` tier tile label | worktree `ticket-890-tier-tile-label` and order ready, not launched |
| `#879` Hoje day states | commit `cbbac9ee` on `fix/ticket-879-hoje-day-states`, no pull request; open it after `ui#1268` merges |
| `ui#1217` privacy (`#805`, `main`) | held until email runs on SES; worktree `ticket-805-privacy-processors` has 1 unpushed commit |
| Staging | web runs `15f5b183` (no `#881` yet); API runs `64643afe`; release both after the merges above, then sweep at both widths starting with Astra's thread and every surface the merges change |
| Production | API `8ccf2278`, web `94bf8f66`, Android 1.3.40 (99) on the open track |
| SES production access | case `179056896000159`: AWS owes the reply |
| Running workers | none; CI waiters from this session exit on their own |
| Stashes | none in any of the three repositories |
| Uncommitted work | none in any worktree |
| Unpushed commits | `ticket-805-privacy-processors` (1) only |
| Ignored files | `orbit-api/infra/local.tfvars` (web digests, database choice, storage providers); Playwright Chromium in `~/Library/Caches/ms-playwright` for local guard runs |
| Other worktrees | merged ticket worktrees listed in the spec's `## Current state`; a detached scratch worktree `integ` outside the repository and the detached `ticket-822-web-health-retry` are removable |

## Then, in order

1. The in-flight rows above, top to bottom: merge `ui#1271`, merge-forward and merge the approved pull requests, clear the pending reviews, start the `#746` carry, release `redesign/main` of both repositories to staging, then sweep at desktop and phone width.
2. The spec's `### Batch R`: its filed tickets in the listed order (`#906`, `#907` and `#908` first, from the latest sweep) within the local cap, the CPU load (load average above 20 on 18 cores means no new worker) and the admission gate; start a ticket whose files overlap an open pull request only after that one merges; file what each sweep finds into Batch R; repeat.
3. The rest of `### Batch M` (the SES switch, then Resend, then `#805`).
4. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
5. Everything else in the spec's order: `#903` and the rest of Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and the owner's instruction: carried.
- Goal: carried, with fresh counts (175 open, 175 placed).
- In flight, `ui#1256`: done (merged; the palette field draws one ring on staging). `ui#1247`: done (merged). `ui#1257`: done (merged after a type-test fix). `ui#1258`: done (merged; `#855` closed). `ui#1262`: carried (waits on the `#746` carry of `#905`). `ui#1263`: carried (review fix and merge-forward pushed). `ui#1264`: carried (review fix pushed). `ui#1261`: done (merged to `main`, production web released). `api#645`: done (merged, staging API released). `ui#1217`: carried. `#879`: carried. Staging: done for `15f5b183` and swept; carried for the next release. Production: carried with fresh values. SES, stashes, uncommitted work, unpushed commits, ignored files, other worktrees: carried with fresh results. Running workers: done (none).
- Step 1 (in-flight rows): carried, rewritten for the new rows. Step 2 (`#904`): carried as `ui#1265`. Steps 3 to 6: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
