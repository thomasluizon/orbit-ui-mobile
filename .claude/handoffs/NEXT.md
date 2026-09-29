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

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff time the board had 178 open tickets, all 178 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `ui#1275` (`#916`, `main`) all-done count survives an optimistic add or remove | CI running; merge to `main` on the bar, release production web, then cherry-pick it with `-x` into `ui#1268` |
| `ui#1268` (`#556` carry of `#878`) | CI green, one open P1 thread (the `#916` finding); after the cherry-pick, answer and resolve the thread, push, merge on a fresh approval; then open `#879`'s pull request (commit `cbbac9ee` on `fix/ticket-879-hoje-day-states`) |
| `ui#1272` (`#908` list options labels and glyphs) | its CI waiter finished at handoff; read the result and the Pullfrog verdict, merge on the bar; copy approved |
| `ui#1267` (`#858` neutral send) | merged forward to `a806a4ec`, CI green, a Pullfrog review of that head was requested; merge on approval; copy approved |
| `ui#1273` (`#890` streak tier label) | CI running; copy approved; merge on the bar |
| `ui#1262` (`#883` row skip asks first) | merged forward to `4735acd7`, P1 thread answered and resolved with the `#905` API evidence; needs a fresh approval; merge on the bar, then sweep the skip confirmation with the staging test habit "Alongar 3 vezes por semana" |
| `ui#1274` contract snapshot rebaseline (push device endpoint `#915`) | CI running; merge on green and approval |
| `orbit-api#650` (`#910`, `main`) Astra's today list counts done habits | opened at handoff; before merging, confirm its new `done` status does not reach a client that rejects it: `#921` (shared schema accepts `done`) ships first, or the API sends it only to clients that declare support; then release production API and carry with `#746` |
| `#906` Perfil groups | a worker (launcher pid 91777, worktree `ticket-906-perfil-groups-rows`) was opening its pull request at handoff, outcome unknown; its questions are decided on the ticket; approve its copy with `/second-opinion` before merge |
| `#907` compact menu rows | worktree `ticket-907-menu-row-height` and order ready; start after `ui#1272` merges (both edit the menu primitive) |
| `ui#1217` privacy (`#805`, `main`) | held until email runs on SES; worktree `ticket-805-privacy-processors` has 1 unpushed commit |
| Staging | web runs `00e3a7ba`, API runs `e009378f`; `orbit-api` `redesign/main` is at `106de867` (`#915`), unreleased: release the staging API before `#917` |
| Production | API `a624edac`, web `94bf8f66`, Android 1.3.40 (99) on the open track; `main` `1585e1eb` changed tools only |
| SES production access | case `179056896000159`: AWS owes the reply |
| Running workers | `#906` only (above) |
| Stashes | none in any of the three repositories |
| Uncommitted work | none found in the worktrees this run touched |
| Unpushed commits | `ticket-805-privacy-processors` (1) |
| Ignored files | `orbit-api/infra/local.tfvars`; Playwright Chromium in `~/Library/Caches/ms-playwright`; the scratch integration worktree `integ` in the previous session's scratchpad (removable) |
| Other worktrees | merged ticket worktrees listed in the spec's `## Current state`, removable with `node tools/teardown-worktree.mjs` |

## Then, in order

1. The in-flight rows above, top to bottom; merge each on the bar, release `redesign/main` web (and the staging API for `#915`) to staging after each merged batch, then sweep at desktop and phone width.
2. The spec's `### Batch R` filed tickets in their listed order (`#907`, `#921` then `#911`, `#912`, `#914`, `#918`, `#917`, `#919` then `#920`, and on), within the local cap, the one-minute load average (above 20 on 18 cores means no new worker) and the admission gate; start a ticket whose files overlap an open pull request only after that one merges; file what each sweep finds into Batch R, including the decided habit name ticket the spec lists last; repeat.
3. The rest of `### Batch M` (the SES switch, then Resend, then `#805`).
4. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
5. Everything else in the spec's order: `#903` and the rest of Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and the owner's instruction: carried.
- Goal: carried, with fresh counts (178 open, 178 placed).
- In flight: `ui#1271` done (merged `9cbd6362`). `ui#1268` carried (new P1, fix via `#916`). `ui#1266` done (merged `f7b36305`). `ui#1267` carried (merged forward, review requested). `ui#1269` done (merged `00e3a7ba` after a shared chat-store fix and a wide-width fix). `ui#1263` done (merged `1c0cfa9a`, copy approved). `ui#1264` done (merged `6a8e7a25`). `ui#1270` done (merged `9c331bca` after a zero-width non-joiner fix). `ui#1265` done (merged to `main` `1585e1eb`). `ui#1262` carried (thread answered, merged forward). `#746` carry done (`orbit-api#647` merged `e009378f`, carrying `#905` and `#913`). `#890` carried as `ui#1273`. `#879` carried. `ui#1217` carried. Staging carried with fresh values. Production carried with fresh values (API `a624edac`). SES, stashes, uncommitted work, unpushed commits, ignored files, other worktrees: carried with fresh results. Running workers: carried (`#906`).
- Step 1 (in-flight rows): carried, rewritten for the new rows. Step 2 (Batch R filed tickets): carried; `#906` in flight, `#908` as `ui#1272`, `#907` next. Steps 3 to 5: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
