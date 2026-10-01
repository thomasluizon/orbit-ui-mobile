/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Pro is Astra without the daily ceiling, and goals leave the paywall.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Price Orbit at 9.99 USD and gate depth never the core loop.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Priority one: Orbit Staging must install, with the right name and icon

Before any other work, fix Orbit Staging (`org.useorbit.app.staging`) end to end. The owner accepted the internal test invite and the Play Store shows "org.useorbit.app.staging (unreviewed)" with no icon, then "Não foi possível baixar org.useorbit.app.staging" when he taps install. The spec's Batch R opens with what is known and what is required: diagnose the download failure from Play Console and the AAB; complete the app setup in Play Console (mirror production Orbit's declarations, store listing name "Orbit Staging", the redesigned icon `design/brand/exports/play-icon-512.png`) and send it for review so the real name and icon show; ship the most up to date internal build from the current `redesign/main` head through `/android-release` (merge every approved redesign pull request you can first, so the build carries them); prove the install from Play. The owner's own install check goes in the report as the first line when it is ready, with a push notification.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch (spec standing rules). Run only one local hermetic Playwright run at a time; a worker allowed to run a layout spec waits until `pgrep -f "playwright test"` finds nothing. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once (fold pull requests into one waiter with several `--pr` flags); a waiter started right after a push can end on `HEAD_MOVED` before GitHub registers the push, so restart it once. A merge commit a worker brings in, or a body edit, re-runs checks: read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows up in the rollup beside its passing twin. A pull request GitHub reports as `CONFLICTING` starts no CI at all: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten, so drive open pull requests to merge first. A long ticket can hit the 45 minute hard ceiling inside its commit hooks: relaunch it from its tree with `--hard-ceiling-minutes 75` and an order that says to finish and commit what is there. Never chain a base merge and a push in one command: a failed merge must stop before the push. Check every pull request body for machine paths and em or en dashes before posting it, and stop on a failed check instead of posting. Until `#1019` merges, append to every worker order a note that generated `architecture.*` files stay uncommitted (they are gitignored), or a worker stops on the contradiction.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome`; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after the proof; the recipe is in the spec's Constraints). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

Three more rules for this run. A worker cannot run Playwright, so when a pull request adds or edits a hermetic layout case, run that spec locally before merging it and prove a new case red on the unfixed base (spec, Current state). In this shell `ls` is aliased to eza; scripts use `command ls`. The orchestrator guardrail refuses a redirect whose target holds a variable or command substitution: redirect to a literal path or use a helper script in the scratchpad.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge and installable, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop there.
2. No recurring Orbit Pro prompt for free accounts (decided). Light-mode opaque hover is decided and shipped (`#970`).
3. Orbit Staging must be the most up to date build possible, installable, with the redesigned icon and the name "Orbit Staging" (priority one above).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is an installable Orbit Staging (priority one), then the whole redesign done, on staging and on an internal Android build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 151 open tickets, all 151 placed in the spec's `## The order` (0 unplaced, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| Orbit Staging install | broken: "Não foi possível baixar"; draft app with setup unfinished; internal track Active with 1.3.49 (108); manifest has no authority or permission collision with production: priority one |
| `ui#1422` (`#892`, `#1069`) at `3fa15597` | Pullfrog APPROVED, checks green, 0 threads; behind `redesign/main` and edits layout specs: a combined merge-result check (`mc-1422` scratch worktree) was running at handoff and died with the session: rerun it, then merge on the bar |
| `ui#1428` (`#1053`) at `cf5eebe0` | Pullfrog APPROVED; SonarCloud coverage run failed one flaky mobile test (mock switching hooks on a module flag); a mechanical fix worker was running: worktree `ticket-1053-skip-undo-toast`, local commit `2dc18635` unpushed, log `orbit-workers/#1053-*.log` (newest); read the worktree, push or relaunch as a continuation |
| `ui#1431` (`#1013`) at `d272a960` | orchestrator review fix pushed (touch release asserted before mouse cleanup), thread resolved; waiting on the review of `d272a960`; merges before `ui#1439` |
| `ui#1439` (`#1028`) at `b94e3233` | Pullfrog APPROVED; unpushed local commit `e116a254`; after `ui#1431` merges, one batch (base merge, `selection-tray.tsx`, the 1280 case), run `press-shape.spec.ts` locally, push |
| `ui#1441` (`#1057`) at `2ed20299` | Pullfrog APPROVED; layout spec proven red on base and green on head locally; merge on the bar (merge-result check if the base overlaps) |
| `ui#1442` (`#1071`) at `c90d049d` | Pullfrog APPROVED; an extension worker (selected row meta and disabled reason to `fg-2`) was running: worktree `ticket-1071-radio-description-contrast` dirty with no commit; read it, finish or relaunch as a continuation, then a fresh review |
| `ui#1443` (`#1067`) at `f958bb68` | Pullfrog APPROVED; merge on the bar |
| `ui#1444` (`#1001`) at `6aba04cf` | Pullfrog APPROVED; its `CLAUDE.md` docs-registry line conflicts with `redesign/main`: base-merge order, fresh review, merge |
| `#1074` (filed this run) | worker was running: worktree `ticket-1074-freeze-bank-fallback`, local commit `83c43c86`, no pull request yet; read it, push and open the pull request or relaunch as a continuation |
| Staging | web `b6479b88` (current for web; `#1046` was mobile only); API `52c8db97`; landing current; release web after the next web merges |
| Production | web `e3de6780` (behind `main` by `#987`); API `3d1a71aa`; landing `ebbebb2a`; Android 1.3.48 (107) on the open track |
| `#961` staging billing | the license-tester purchase is the owner's; then `#1040` |
| `#1009` staging pinger | apply blocked on the Cloudflare token's Workers Scripts Edit (owner) |
| `#987` carry | merged on `main` (`983e17ee`); carried to `redesign/main` by `#556` (Batch 0b) |
| Open pull requests elsewhere | none in `orbit-api` or `orbit-landing-page` |
| Stashes | none in any repository |
| Uncommitted work | none in the main checkouts; `ticket-1071-radio-description-contrast` dirty (extension worker) |
| Unpushed commits | `fix/ticket-1028-controls-44` (`e116a254`), `fix/ticket-1053-skip-undo-toast` (`2dc18635`), `fix/ticket-1074-freeze-bank-fallback` (`83c43c86`, no remote branch yet) |
| Detached HEADs | `mc1` under an older session scratchpad and `mc-1422` under this session's: scratch merge checks holding no unique work; remove with `git worktree remove` (no force), then `git worktree prune` |
| Branches without a pull request | `fix/ticket-1074-freeze-bank-fallback` (worker in progress); older ticket worktrees as the spec's Current state describes |
| Ignored files | the session decision log stayed in its scratchpad; durable rules and decisions are in the spec (Batch R, Constraints, Current state) |

Workers launched by this session die when it ends: read each worktree before relaunching, because a finished worker leaves commits, a dirty tree, or nothing.

## Then, in order

1. Priority one: Orbit Staging installs with the right name and icon from the newest `redesign/main` build.
2. The in-flight rows above, top to bottom: merge what is approved on the bar (merge-result checks where the base overlaps), deliver or relaunch the three worker worktrees, answer each review. Release `redesign/main` web to staging after each merged batch, and ship a new Orbit Staging internal build after each batch of redesign merges.
3. The spec's `### Batch R` list in its order, checking file overlap with open pull requests and running workers before each launch; the unverified findings there (Habit detail disclosure, not-found chips, Astra "Próximas perguntas") get reproduced in a visible window and filed.
4. A full rendered sweep of staging at desktop, phone and foldable widths after the batch reaches staging, covering what the last sweep could not reach (spec, Sweep coverage), filing and fixing until a full pass finds nothing. Then an Orbit Staging internal build after the last redesign merge.
5. When the redesign is done, tell the owner (instruction 1) and stop at THE REDESIGN GATE; do not merge `redesign/main` to `main`.
6. The rest of `### Batch M` (`#943`, then the retired-project list for the owner), then Batch 0c (including `#1040` and `#1043`), the rest of Batch E and Batch 0b (`#556` with the `#987` carry, `#746`, `#926`, `#1019`, `#1018`, the `#1070` backport, `#1072`), as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried; added the guardrail redirect note and the red-on-base proof for new layout cases.
- Owner instruction 1: carried, now requiring an installable Orbit Staging build. Owner instruction 2: carried. New owner instruction 3 and the priority-one section come from the owner's install report.
- In flight: `ui#1438` done (merged `b6479b88`), `ui#1437` done (merged `12ab8ee8` after a clean merge-result check), `ui#1440` done (merged to `main` `983e17ee`, `#987` closed). `ui#1422` carried (history batch approved, merge check owed). `ui#1428` carried (Undo batch approved, CI flake fix in flight). `ui#1431` carried (Linux touch harness fixed, review fix pushed). `ui#1439` carried unchanged. Staging superseded (released `b6479b88`). Production, `#961`, `#1009`, `#1070` backport, other rows: carried.
- Then, in order, steps 1 to 5: carried as steps 2 to 6, with Orbit Staging as step 1; `#1057`, `#1071`, `#1067` and `#1001` moved from filed tickets to open pull requests; `#1073` and `#1074` placed in Batch R.

Every identifier here came from a previous session: treat each as a lead to verify.
