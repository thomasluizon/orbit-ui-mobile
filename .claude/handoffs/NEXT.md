/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instruction for this run

**Everything related to the redesign gets done. Every single thing.** Every open redesign ticket (the spec's `### Batch R` and every other ticket whose work lands on `redesign/main` in any repository) is implemented, merged and closed, and staging runs all of it: web, API and landing released from `redesign/main`, and an internal Android build from `redesign/main` against the staging API once Batch R lands. After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep. The redesign is done only when the board holds no open redesign ticket, every staging service runs the `redesign/main` head, and a full sweep at both widths finds nothing. THE REDESIGN GATE then stays for the owner: never merge `redesign/main` to `main`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done and on staging, as above. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 180 open tickets, all 180 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `ui#1275` (`#916`, `main`) all-done count during habit changes | head `3f6ceea6`, all checks green, Pullfrog approved: merge to `main`, release production web, then cherry-pick its squash commit with `-x` into `ui#1268` |
| `ui#1268` (`#556` carry of `#878`) | one P1 thread (the `#916` finding); after the cherry-pick, merge `redesign/main` into it (overlaps the merged `#883`), answer and resolve the thread, push, merge on a fresh approval; then open `#879`'s pull request (commit `cbbac9ee` on `fix/ticket-879-hoje-day-states`) |
| `ui#1279` (`#923`) web pills lose their start padding | CI running; layout spec observed red without the fix, green with it; check every client-rendered pill surface, then merge on the bar |
| `ui#1272` (`#908`) list options labels and glyphs | head `f9f4540e`, Pullfrog approved, Sonar duplication cleared; merge on green; then start `#907` and `#918` |
| `ui#1276` (`#906`) Perfil groups | head `95bc47ef`, Pullfrog approved, copy approved (verdict posted); `Surface Manifest Drift` red: regenerate with `node tools/surface-manifest.mjs`, push, merge on a fresh approval; then `#917` and `#920` |
| `ui#1277` (`#921`) done status schema and capability | CI running; merge on the bar; then `#911` |
| `ui#1278` (`#912`) composer early text | CI running (`parity:exempt`); merge on the bar; then `#914` |
| `orbit-api#651` (`#919`) active API key count | head `e76ad50f`, P1 fixed and resolved, needs a fresh approval; after merge dispatch `redesign-drift.yml` and merge its contract rebaseline, then `#920` |
| `orbit-api#652` (`#746` carry of `#910`) | CI running; merge on the bar, then release the staging API |
| `ui#1217` privacy (`#805`, `main`) | held until email runs on SES; worktree `ticket-805-privacy-processors` has 1 unpushed commit |
| Board closures | `#858`, `#883`, `#890` merged into `redesign/main` but still open: close each with `node tools/complete-ticket.mjs --issue "#N"` |
| Staging | web `19a85c61`, API `106de867`, landing unchanged; release after each merged batch |
| Production | API `4c108bd0` (with `#910`), web `94bf8f66`, Android 1.3.40 (99) on the open track |
| SES production access | case `179056896000159`: AWS owes the reply |
| Running workers | none (every launched worker exited and delivered) |
| Waiters | two `wait-ci.mjs` processes from the previous session may still be alive; they end on their own |
| Stashes | none in any of the three repositories |
| Uncommitted work | none found |
| Unpushed commits | `ticket-805-privacy-processors` (1) |
| Prepared worktrees, no commits | `ticket-907-menu-row-height`, `ticket-922-habit-name-schedule`, `ticket-885-delete-confirm`: fast-forward to `redesign/main` and recompose the order before launch |
| Ignored files | `orbit-api/infra/local.tfvars`; Playwright Chromium in `~/Library/Caches/ms-playwright`; the scratch worktree `integ` in the previous session's scratchpad (removable with `git worktree remove`, no `--force`) |
| Other worktrees | merged ticket worktrees listed in the spec's `## Current state`, removable with `node tools/teardown-worktree.mjs` |

## Then, in order

1. The in-flight rows above, top to bottom; merge each on the bar (a behind pull request merges on one combined local merge-result check, spec standing rule), release `redesign/main` web and the staging API after each merged batch, then sweep at desktop and phone width.
2. The spec's `### Batch R` filed tickets in their listed order (`#922`, `#924`, `#907`, `#911`, `#914`, `#918`, `#917`, `#920`, `#884`, `#885`, `#882`, and on), within the local cap, the one-minute load average (above 20 on 18 cores means no new worker) and the admission gate (10 open pull requests plus live reservations); start a ticket whose files overlap an open pull request only after that one merges; file what each sweep finds into Batch R; repeat until the redesign is done as defined above.
3. Every other ticket whose work lands on `redesign/main` (`orbit-api` and `orbit-landing-page` included), then release every staging service from `redesign/main` and ship an internal Android build from `redesign/main` through `/android-release`.
4. The rest of `### Batch M` (the SES switch, then Resend, then `#805`).
5. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
6. Everything else in the spec's order: `#903` and the rest of Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried.
- The owner's instruction (fix every staging review issue, sweep until nothing is wrong): carried and widened by the owner's new instruction above.
- Goal: carried, with fresh counts (180 open, 180 placed).
- In flight: `ui#1275` carried (P1 fixed in `6600f2af`, Sonar coverage fixed in `3f6ceea6`, approved). `ui#1268` carried. `ui#1272` carried (Sonar duplication fixed, approved). `ui#1267` done (merged `6feb63ec`). `ui#1273` done (merged `19a85c61`). `ui#1262` done (merged `384f2508`; skip confirmation verified on staging). `ui#1274` done (merged `490aaff3`). `orbit-api#650` done (P1s fixed with a client capability and slip exclusion, merged `4c108bd0`, released to production); its carry is `orbit-api#652`. `#906` done as a pull request: `ui#1276`, carried. `#907` carried (after `ui#1272`). `ui#1217` carried. Staging carried with fresh values (web `19a85c61`, API `106de867` released). Production carried with fresh values (API `4c108bd0`). SES, stashes, uncommitted work, unpushed commits, ignored files, other worktrees: carried with fresh results. Running workers: none.
- Step 1 (in-flight rows): carried, rewritten for the new rows. Step 2 (Batch R filed tickets): carried; `#921` is `ui#1277`, `#912` is `ui#1278`, `#919` is `orbit-api#651`; the habit name ticket is filed as `#922`; the sweep filed `#923` (`ui#1279`) and `#924`. Steps 3 to 5: carried, plus the new step 3.

Every identifier here came from a previous session: treat each as a lead to verify.
