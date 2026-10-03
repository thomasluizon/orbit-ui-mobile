/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`, and the note `2 Areas/20-29 Orbit Engineering/Research - native mobile feel for the Orbit redesign.md` (its "Codex research arm and reconciliation" section). Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately. No relay successor is nominated: this prompt starts a fresh run.

## Priority: the owner's mobile review on Android and web

The owner found the redesign crowded and desktop-like on his phone. The research, the Codex arm and his `/questions` round are done; his answers are binding rules in the spec's standing rule on native mobile feel and in each mobile review ticket's "Owner answers and research reconciliation" section. The spec's Batch R section "The owner's mobile review on his phone" lists the tickets (`#1133` to `#1152`) and their state. This outranks everything below except merging pull requests that are already approved.

1. Drive the seven open pull requests below to merge: read each review, answer every finding (fix in a review batch, file the rest), read CI on the exact head, run the combined merge check for heads behind their base, merge on the bar, close each ticket with `complete-ticket.mjs`.
2. Launch the not-started mobile review tickets in the spec's order, file-disjoint first: `#1144`, `#1150`; then `#1152` after `#1144`; `#1138` after `#1137`; `#1141` after `#1140`; `#1143` and `#1148` after `#1142`; `#1146` after `#1139` and `#1140`; `#1147` after `#1135` and `#1140`; then `#1134` and `#1149` (they touch every surface) once the first wave is merged; `#1151` (the whole-app sweep) after `#1133`.
3. Every fix lands on Android and web. A layout spec a pull request adds or edits is proven red locally on the unfixed base before merge.
4. Then a full sweep of every screen and every component, every line of UI code on both platforms, against the corrected rules, fixing everything it finds, then rendered sweeps (phone, foldable, desktop) until a full pass finds nothing.

## In flight

| item | disposition |
|---|---|
| `ui#1511` (`#1133`, native mobile rule, now with the large-text rule) at `2db0f277` | no Pullfrog review published (its waiter hit the ceiling): read with `--wait-seconds 0 --no-request`, request with `@pullfrog review` if absent, then merge on the bar |
| `ui#1512` (`#1139`, tab bar) at `6fb79c22` | approved, but Layout Guard (`foldable-layout.spec.ts:94`, `press-shape.spec.ts:120`) and SonarCloud are red; review-batch commit `40d97695` is unpushed in `ticket-1139-tab-bar-padding`: run both specs locally green on it (and red on `6fb79c22`), rebuild the worker report from log `#1139-68900-1790969670667.log`, merge it into the body, push, re-review |
| `ui#1513` (`#1135`, one-target proactive line) at `5d5b36ee` | approved; read CI, combined merge check, merge |
| `ui#1514` (`#1145`, Perfil row icons) at `6f3c0ff6` | approved; read CI, combined merge check, merge |
| `ui#1515` (`#1137`, one-pill composer) at `592468e1` | no review yet; read it, then merge on the bar |
| `ui#1516` (`#1142`, Calendário header) at `2dbd0639` | changes requested: one review batch |
| `ui#1517` (`#1140`, Hoje and sidebar bell) at `129cfa64` | changes requested: one review batch |
| `orbit-api#693` (`#1136`) | merged to `redesign/main` (`912cf6e7`); `#1136` closed; release the staging API |
| Staging release | web `fe7b9dc2` live on staging; API `7821c3f2` is one commit behind `orbit-api` `redesign/main`; Orbit Staging 1.3.59 (118); next: staging API release, then `android-release.yml` internal on `redesign/main` as 1.3.60 (119) after the open pull requests merge |
| Production | API `822f3038`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none in the three repositories |
| Uncommitted work | none in the main checkouts or worker worktrees |
| Unpushed commits | `40d97695` on `fix/ticket-1139-tab-bar-padding` (row above) |
| Branches with no pull request | none |
| Detached HEADs | scratch merge-check worktrees in old session scratchpads (`git worktree prune` clears them once gone); `questions-manual-steps` holds a local merge of `pr/1441` that no remote branch contains: read it before deleting |
| Running workers | none (all seven exited and delivered) |
| Waiters | none live; start one per batch of pull requests, at most three |
| Ignored files | decision log and helpers (`gated-launch.sh`, `prep-launch.sh`, `prep-launch-api.sh`, `merge-check.sh`, `ready.sh`, `overlap-pr.sh`, `worktree-ci.sh`, `red-spec.sh`, `assemble.sh`, `reconcile.mjs`, `inventory.sh`) stay in the previous session's scratchpad; copy them with the session id replaced |
| Throwaway AVD | `Orbit_Repro_Throwaway` still exists; delete it once no repro needs it |
| Chrome | not used this session |
| Session chain | closed by this owner handoff |
| Owner questions | none |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Then: the sweep and the gate

1. Release `redesign/main` web to staging after each batch of merges and ship an Orbit Staging internal build (the next is 1.3.60 (119)).
2. Finish the rendered sweep of staging: the foldable widths (840, 1100) for the Perfil sub-screens, Avisos, Busca, Sobre, Orbit Pro, habit create and habit detail, plus the rest of the spec's Sweep coverage list, filing and fixing until a full pass finds nothing. Recheck the production content rating certificate code once Google's review finishes.
3. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
4. Then the spec's order: Batch 0c, Batch E, Batch 0b. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree runs Orca's setup `npm install` on creation: wait until no `npm install` or `npm ci` process has its working directory in that worktree, then run `npm ci` there and check its exit code (retry once if it races the setup install; orbit-api worktrees have no Node lockfile and skip it). Pass `tools/create-worktree.mjs` an absolute `--repo path:`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); request a fresh Pullfrog review with a plain `@pullfrog review` comment and read it later with `--wait-seconds 0 --no-request`. A waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it; a SonarCloud quality-gate failure on new-code coverage is a real red to fix. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`; an order carrying the UI review sweep may launch with 75 from the start. A branch that used its two launches needs `--relaunch-reason`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build and the tree, written to the ticket with `comment-ticket.mjs`, never accepted on the worker's code reading alone. On `main`, `tools/test-tools.mjs` takes no arguments (`--only` exists only on `redesign/main`). Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it, and rebuild a worker report without machine paths before merging it into a body (`tools/merge-review-batch-body.mjs` takes absolute paths). An `orbit-api` or `orbit-landing-page` pull request whose ticket still has work after the merge links it with `Refs`, not `Closes`. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`; a ticket GitHub closed from a `main` merge needs `--repair-status`. Before merging any pull request behind its base, run the combined merge check (scratch worktree at the base with every head merged: `npm ci`, `npx turbo run type-check --force`, i18n usage, surface manifest, Sonar paths, the three Vitest suites, both harness suites when tools or `.claude` change, the web build and the hermetic layout project, all by exit code), or merge at the approved head under D115 when the base's newer commits share none of its files; for `orbit-api`, `dotnet build` and `dotnet test` with `LANG` unset and with `LC_ALL=en_US.UTF-8`. When a combined check is red only in one head's new tests, merge the others on a check without that head and send that head a base-merge order. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution, including inside a heredoc command: use literal paths, the Write tool, or a helper script. In this shell `ls` is eza: scripts use `command ls`. Every headless `claude` call on untrusted text runs with `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`. Configure every external service from its current documentation, never from memory, and never pick a legacy option. Do visible-window Chrome work whether or not the owner is using the Mac: sleep mode lasts until he turns it off.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Google Cloud Pub/Sub, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden, whether or not the owner is at the Mac), mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

The context relay is live: when the Stop hook reports the threshold, launch nothing, drain the workers, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`, exactly as its message says. The relay now waits for this session's background Workflow runs and subagents too.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work continues.
2. No recurring Orbit Pro prompt for free accounts (decided); a visible Pro entry in Perfil is not a prompt. Habit detail keeps the Astra composer (decided).
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon.
4. The owner's latest review comes first (shipped defects before redesign items), then the rest of the redesign.
5. Onboarding follows the ADR named above.
6. The second Claude Max account (`#1090`) is bought only when the Codex credits run out; until then the move off OpenAI waits and Codex stays the worker engine.
7. Resend is deleted (Batch M done); `#961` and `#1010` are closed.
8. Fix everything in the owner's latest review in this run.
9. Do visible-window Chrome work (sweeps, Play Console, Google account steps) whether or not the owner is at the Mac or talking to the session; sleep mode lasts until he turns it off.
10. The owner keeps finding buttons of different sizes in improvised alignments: the `#1123` rule (merged) binds every new surface.
11. The owner's mobile review comes first: every defect fixed on Android and web, `DESIGN.md` corrected, every screen swept and fixed.
12. Where a control sits on a screen is the run's decision for the end user, never an owner question.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the owner's mobile review (all 20 tickets, `#1133` to `#1152`, merged and closed on both platforms, `DESIGN.md` corrected), a staging release and the 1.3.60 internal build, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). Work order reconciliation against the spec's `## The order`: 147 open tickets, 147 placed, 0 unplaced, 0 placed twice (`#1152` placed in Batch R after `#1144`; `#1136` removed as closed).

## Previous prompt, disposition

- Opening reading list, entry point, Sleep section, the authorization paragraph, Then 1 to 4, Goal and owner instructions 1 to 12: carried.
- Priority 1 (drive in-flight items): carried as Priority 1; `ui#1511` gained the large-text rule (`2db0f277`), `ui#1512` got its layout review batch (`40d97695`, unpushed).
- Priority 2 (launch not-started tickets): `#1136` done (`orbit-api#693` merged); `#1140` delivered as `ui#1517`; the rest carried as Priority 2 with the file-overlap order.
- Priority 3 and 4: carried.
- In-flight workers `#1137`, `#1145`, `#1135`, `#1142`: relaunched with continuation orders and delivered as `ui#1515`, `ui#1514`, `ui#1513`, `ui#1516`.
- Staging release: web done (run 37053755308, `/api/health` commit `fe7b9dc2`); staging API and 1.3.60 (119) carried.
- Waiter restart: done, then ended at its ceiling; carried as "start waiters per batch".

Every identifier here came from a previous session: treat each as a lead to verify.
