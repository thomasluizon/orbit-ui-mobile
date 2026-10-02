/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`, and the note `2 Areas/20-29 Orbit Engineering/Research - native mobile feel for the Orbit redesign.md` (its "Codex research arm and reconciliation" section). Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately. No relay successor is nominated: this prompt starts a fresh run.

## Priority: the owner's mobile review on Android and web

The owner found the redesign crowded and desktop-like on his phone. The research, the Codex arm and his `/questions` round are done; his answers are binding rules in the spec's standing rule on native mobile feel and in each mobile review ticket's "Owner answers and research reconciliation" section. The spec's Batch R section "The owner's mobile review on his phone" lists the 19 tickets (`#1133` to `#1151`) and their state. This outranks everything below except merging pull requests that are already approved.

1. Drive the in-flight items below to merge.
2. Launch the not-started mobile review tickets in the spec's order, file-disjoint first: `#1136` (`orbit-api`), `#1140`, `#1144`, `#1146`, `#1147`, `#1148`, `#1150`; then `#1143` after `#1142`, `#1138` after `#1137`, `#1141` after `#1140`; then `#1134` and `#1149` (they touch every surface) once the first wave is merged; `#1151` (the whole-app sweep) after `#1133`.
3. Every fix lands on Android and web. A layout spec a pull request adds is proven red locally on the unfixed base before merge.
4. Then a full sweep of every screen and every component, every line of UI code on both platforms, against the corrected rules, fixing everything it finds, then rendered sweeps (phone, foldable, desktop) until a full pass finds nothing.

## In flight

| item | disposition |
|---|---|
| `ui#1511` (`#1133`, `DESIGN.md` native mobile rule and drawings) at `d4ce1d89` | waiting on CI and Pullfrog; the `#1133` ticket comment adds the large-text rule (one line at default text, wrap allowed above font scale 1.3, never ellipsized or clipped); if the pull request lacks it, add it in the review batch; merge on the bar |
| `ui#1512` (`#1139`, tab bar padding and dashboard icon) at `6fb79c22` | waiting on CI and Pullfrog; prove any added layout spec red on the unfixed base; merge on the bar |
| worker `#1137` (one-line composer) | died with the session: worktree `ticket-1137-one-line-composer`, branch `fix/ticket-1137-one-line-composer`, 1 pushed commit plus uncommitted edits; log `orbit-workers/#1137-77854-1790966110657.log` in the OS temp directory; read the worktree, then relaunch with a continuation order |
| worker `#1145` (Perfil row icons), second launch | died with the session: worktree `ticket-1145-perfil-row-icons`, 2 pushed commits plus uncommitted edits, no pull request yet; its decision (large-text wrap) is on the ticket; log `#1145-82473-1790968104447.log`; relaunch needs `--relaunch-reason` |
| worker `#1135` (Hoje proactive line) | died with the session: worktree `ticket-1135-proactive-line-target`, no commits, uncommitted edits; log `#1135-88953-1790968266216.log`; read, then relaunch |
| worker `#1142` (Calendário header), second launch | died with the session: worktree `ticket-1142-calendar-header-menu`, 3 commits, clean; its decision (keep "Mostrar hábitos que se repetem", never "Recorrentes") is on the ticket; log `#1142-93183-1790968360369.log`; relaunch needs `--relaunch-reason` |
| Staging release | API released from `redesign/main` (`7821c3f2`, success); next: web `release.yml` staging with `redesign/main` (`3aedb4a7` or later), then `android-release.yml` internal on `redesign/main` as 1.3.60 (119) |
| Merged this chain | `ui#1503`, `ui#1501`, `ui#1505`, `ui#1507`, `ui#1510`, `ui#1506`, `ui#1509` this session; earlier `ui#1508` on `main`, `ui#1504`, `ui#1502`, `ui#1500`, `orbit-api#691`, `orbit-api#692` |
| Closed this chain | `#1123`, `#1125`, `#1127`, `#1128`, `#1130`, `#1132`; earlier `#1131`, `#1121`, `#1129`, `#1124`, `#961`, `#1126` |
| Production | API `822f3038`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none in the three repositories |
| Uncommitted work | none in the main checkouts; worker worktrees above hold uncommitted edits |
| Unpushed commits | none (worker commits are pushed) |
| Branches with no pull request | `fix/ticket-1137-one-line-composer`, `fix/ticket-1145-perfil-row-icons`, `fix/ticket-1135-proactive-line-target`, `fix/ticket-1142-calendar-header-menu` (workers above) |
| Detached HEADs | scratch merge-check worktrees in old session scratchpads; `git worktree prune` clears them once gone |
| Waiters | the `ui#1511` and `ui#1512` waiter died with this session; restart it |
| Ignored files | the decision log and helpers (`gated-launch.sh`, `prep-launch.sh`, `merge-check.sh`, `ready.sh`, `overlap-pr.sh`, `worktree-ci.sh`, `mk-ticket.sh`, `build-tickets.mjs`) stay in the previous session's scratchpad; copy them with the session id replaced |
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

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the owner's mobile review (all 19 tickets merged and closed on both platforms, `DESIGN.md` corrected), a staging release and the 1.3.60 internal build, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). Work order reconciliation against the spec's `## The order`: 147 open tickets, 147 placed, 0 unplaced, 0 placed twice.

## Previous prompt, disposition

- Opening reading list, entry point, Sleep section, the authorization paragraph and owner instructions 1 to 6, 9: carried (reading list gains the new ADR and the research note; instruction 7 updated: `#961` closed this chain).
- Relay adoption with `adoptRelayRun`: done (this session adopted); superseded for the next run, which starts fresh.
- Priority 1 (research JSON and note): done.
- Priority 2 (Codex arm after `#1128`): done; `ui#1507` merged, the arm ran, the reconciliation is in the note.
- Priority 3 (`/questions` round): done; answers in the ADR and the spec.
- Priority 4 (correct `DESIGN.md`, file the tickets, fix every item): tickets filed (`#1133` to `#1151`); `DESIGN.md` correction is `ui#1511`; fixing carried as Priority 1 to 3.
- Priority 5 (full sweep, then rendered sweeps): carried as Priority 4.
- First 1 (combined check and merge of `ui#1501`, `ui#1503`, `ui#1505`, `ui#1506`): done; `ui#1506` merged after a base-merge order moved its tests to the `sm` pill.
- First 2 (`ui#1507`): done, merged.
- First 3 (`ui#1509`): done, merged after a review fix.
- First 4 (close tickets, record merge shas): done.
- First 5 (chain closes at the next owner handoff): done by this handoff.
- Then 1 to 4: carried as Then 1 to 4.
- Owner instructions 8, 10, 11, 12: carried as 8, 10 and 11 (`#1130` merged); new instruction 12 from the owner's delegation on the bell placement.

Every identifier here came from a previous session: treat each as a lead to verify.
