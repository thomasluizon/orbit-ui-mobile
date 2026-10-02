/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

This session is the nominated successor of a context relay: adopt the run with `adoptRelayRun` as the sleep skill says, and do not replan the queue.


## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Priority: the owner's mobile review, the Codex arm, then the questions

The owner reviewed Orbit Staging on his phone and found the redesign crowded and desktop-like. The spec's Batch R section "The owner's mobile review on his phone" lists every defect and its standing rule states the principle (native mobile feel, less on each screen, sheets and menus for secondary content, breathing room, padded hover and press fills, no wrapped or ellipsized labels). Every fix lands on Android and web. This outranks everything below except merging pull requests that are already approved. The owner is following the run and chose to wait for the Codex arm before the questions round.

1. The research Workflow is done. Its synthesis is `0 Inbox/raw/orbit-mobile-review/research-final.json` in the brain vault, and the note `2 Areas/20-29 Orbit Engineering/Research - native mobile feel for the Orbit redesign.md` now holds the report and every section, with a pending "Codex research arm and reconciliation" section.
2. When `ui#1507` (`#1128`) merges, fast-forward the main checkout, then run the Codex research arm as a background task: `node tools/launch-worker.mjs --research --order <scratchpad>/order-codex-research.md --out <scratchpad>/codex-research.md`. The order is in the previous session's scratchpad; copy it into this session's scratchpad (if it is gone, recompose it: brain record first, mobile design philosophy from primary sources with URL and date, a pattern per defect, then verdicts on the JSON's 13 principles and 3 owner questions, plus missed items). Then write the reconciliation (agreements, disagreements, missed items) into the note's Codex section.
3. Then run one `/questions` round with the owner (his instruction; it overrides the sleep skill's never-ask rule for this round only, and never during a relay) on the three questions in the spec's `## Open questions`, recommendation first, adjusted by the Codex reconciliation. Keep workers busy on unaffected tickets while it waits.
4. Then correct `DESIGN.md` and the affected drawings to his answers, file the tickets the JSON proposes (one per coherent defect, adjusted to the answers), place each in Batch R, and fix every item on both platforms.
5. Then a full sweep of every screen and every component, every line of UI code on both platforms, against the corrected rules, fixing everything it finds, then rendered sweeps (phone, foldable, desktop) until a full pass finds nothing.

## First: the open pull requests

1. `ui#1501` (`#1125`, `53251411`), `ui#1503` (`#1123`, `81b5cf2b`), `ui#1505` (`#1127`, `5388e793`) and `ui#1506` (`#1130`, `d9127bc9`): each green, Pullfrog APPROVED at that head, zero threads, but behind `redesign/main` (`568a1b37`). Run one combined merge check (scratch worktree at `origin/redesign/main` with all four heads merged; the `merge-check.sh` helper in the previous scratchpad runs every step by exit code), then merge each with `gh pr merge --squash --match-head-commit <head>` after re-reading its review and readiness (`ready.sh` helper: review read, delivery with `--wait-ci 150`, ticket sync, `record-readiness`). A merge in between moves the base; re-read before each. `ui#1503`'s copy approval is posted; its layout spec is red-proven.
2. `ui#1507` (`#1128`, `1b348313`): review fix and base merge pushed; waiting on CI and a fresh review. Merge on the bar, then start the Codex arm.
3. `ui#1509` (`#1132`, the relay fix): waiting on CI and review. Its tools and hooks change, so run both harness suites in the combined check if it is behind. Merge on the bar. Until it merges, start no background Workflow or background Agent in a session near the relay threshold.
4. Close each ticket with `node tools/complete-ticket.mjs --issue "#N"` after its merge into `redesign/main`. Record every merge sha on the run-state ledger row.
5. The open session chain closes at the next owner handoff (`#1129` is merged).

## Then: the owner's review, the sweep, the gate

1. Release `redesign/main` web to staging after each batch of merges (`#1131` is on `main`, so staging web now gets the staging Play package) and ship an Orbit Staging internal build (the next is 1.3.60 (119)).
2. Finish the rendered sweep of staging: the foldable widths (840, 1100) for the Perfil sub-screens, Avisos, Busca, Sobre, Orbit Pro, habit create and habit detail, plus the rest of the spec's Sweep coverage list, filing and fixing until a full pass finds nothing. Recheck the production content rating certificate code once Google's review finishes.
3. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
4. Then the spec's order: Batch 0c, Batch E, Batch 0b. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree runs Orca's setup `npm install` on creation: wait until no `npm install` or `npm ci` process has its working directory in that worktree, then run `npm ci` there and check its exit code (retry once if it races the setup install; orbit-api worktrees have no Node lockfile and skip it). Pass `tools/create-worktree.mjs` an absolute `--repo path:`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); request a fresh Pullfrog review with a plain `@pullfrog review` comment and read it later with `--wait-seconds 0 --no-request`. A waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it; a SonarCloud quality-gate failure on new-code coverage is a real red to fix. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`; an order carrying the UI review sweep may launch with 75 from the start. A branch that used its two launches needs `--relaunch-reason`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build and the tree, written to the ticket with `comment-ticket.mjs`, never accepted on the worker's code reading alone. On `main`, `tools/test-tools.mjs` takes no arguments (`--only` exists only on `redesign/main`). Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it, and rebuild a worker report without machine paths before merging it into a body. An `orbit-api` or `orbit-landing-page` pull request whose ticket still has work after the merge links it with `Refs`, not `Closes`. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`; a ticket GitHub closed from a `main` merge needs `--repair-status`. Before merging any pull request behind its base, run the combined merge check (scratch worktree at the base with every head merged: `npm ci`, `npx turbo run type-check --force`, i18n usage, surface manifest, Sonar paths, the three Vitest suites, both harness suites when tools or `.claude` change, the web build and the hermetic layout project, all by exit code), or merge at the approved head under D115 when the base's newer commits share none of its files; for `orbit-api`, `dotnet build` and `dotnet test` with `LANG` unset and with `LC_ALL=en_US.UTF-8`. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Every headless `claude` call on untrusted text runs with `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`. Configure every external service from its current documentation, never from memory, and never pick a legacy option. Do visible-window Chrome work whether or not the owner is using the Mac: sleep mode lasts until he turns it off.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Google Cloud Pub/Sub, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden, whether or not the owner is at the Mac), mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

The context relay is live: when the Stop hook reports the threshold, launch nothing, drain the workers, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`, exactly as its message says. Until `#1126` lands, measure the transcript before a width sweep or other long work.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work continues.
2. No recurring Orbit Pro prompt for free accounts (decided); a visible Pro entry in Perfil is not a prompt. Habit detail keeps the Astra composer (decided).
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon.
4. The owner's latest review comes first (shipped defects before redesign items), then the rest of the redesign.
5. Onboarding follows the ADR named above.
6. The second Claude Max account (`#1090`) is bought only when the Codex credits run out; until then the move off OpenAI waits and Codex stays the worker engine.
7. The owner's Orbit Staging license-tester purchase (`#961`) succeeded; verify it on the staging API and close `#961`. His production and staging Google sign-ins work (`#1010` closed). Resend is deleted (Batch M done).
8. Fix everything in the owner's latest review in this session.
9. Do visible-window Chrome work (sweeps, Play Console, Google account steps) whether or not the owner is at the Mac or talking to the session; sleep mode lasts until he turns it off.
10. The owner keeps finding buttons of different sizes in improvised alignments: `#1123` fixes the rule, the component default, every caller and the guards.
12. The owner's mobile review (Priority section above) comes first: research Workflow with sub-agents and Codex, one `/questions` round, then `DESIGN.md` corrected and every screen swept and fixed on Android and web.
11. On Orbit Staging's subscription screen, "Ver na Google Play" opens Play's page for the production app's subscription ("Não foi possível encontrar a assinatura de Orbit: AI Habit Tracker (Orbit Pro)"): the manage link must use the running app's package. File it and fix it in this run. The rest of the purchase flow works.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the owner's mobile review (Codex research arm, one `/questions` round, `DESIGN.md` corrected, every defect fixed on both platforms), the six open pull requests merged, a staging release and internal build, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). Work order reconciliation: 134 open tickets, 134 placed in the spec, 0 unplaced (each open number is referenced in the spec; placement is one batch each by its own rules). The research's proposed tickets are not filed yet (they wait for the owner's answers).

## In flight

| item | disposition |
|---|---|
| `ui#1501` (`#1125`) at `53251411` | approved, green, behind; combined merge check, then merge |
| `ui#1503` (`#1123`) at `81b5cf2b` | approved, green, behind, red-proven, copy approved; combined check, then merge |
| `ui#1505` (`#1127`) at `5388e793` | approved, green, behind; combined check, then merge |
| `ui#1506` (`#1130`) at `d9127bc9` | approved, green, behind; combined check, then merge |
| `ui#1507` (`#1128`) at `1b348313` | review fix pushed; waiting on CI and review; then the Codex arm |
| `ui#1509` (`#1132`) | relay fix; waiting on CI and review; merge on the bar |
| Merged this run | `ui#1508` on `main` (`b0729b89`), `ui#1504` (`568a1b37`), earlier `ui#1502`, `ui#1500`, `orbit-api#691`, `orbit-api#692` |
| Closed this run | `#1121` (measured, numbers on `orbit-api#691`), `#1129`, `#1131`, earlier `#1124`, `#1126`, `#961` |
| Production | API `822f3038`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Staging | web `2ffd2b9c`, API `b36bf45d`; Orbit Staging 1.3.59 (118) internal |
| Waiters | three CI waiters (`ui#1507`, `ui#1509`, and the four approved) die with this session; restart them |
| Running workers | none (the `#1132` worker finished and delivered `ui#1509`) |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none |
| Uncommitted work | none in the main checkouts; worktrees clean |
| Unpushed commits | none |
| Branches with no pull request | none (merged tickets' local branches are retained by teardown as possible stack bases) |
| Detached HEADs | scratch merge-check and red-proof worktrees in old session scratchpads; `git worktree prune` clears them once gone |
| Chrome | not used this run |
| Throwaway AVD | `Orbit_Repro_Throwaway` still exists; delete it once no repro needs it |
| Ignored files | the decision log, the helper scripts (`gated-launch.sh`, `merge-check.sh`, `ready.sh`, `red-spec.sh`, `worktree-ci.sh`, `psql-prod.sh`) and `order-codex-research.md` stay in the previous session's scratchpad; copy them with the session id replaced |
| Session chain | still open; it closes at the next owner handoff |
| Owner questions | the three research questions in the spec's `## Open questions`, after the Codex arm |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Previous prompt, disposition

- Opening reading list, entry point, Sleep section, the authorization paragraph, the relay paragraph and owner instructions 1 to 12: carried verbatim.
- Priority 1 (read the JSON, write the note if missing): done; the note is written from the JSON with every section.
- Priority 2 (Codex arm after `#1128`): carried as Priority 2; `ui#1507` review fix pushed, order prepared.
- Priority 3 to 5: carried as Priority 3 to 5.
- First 1 (`ui#1503`): red proof, body merge, push, review, copy approval done; carried as First 1 for the merge.
- First 2 (`ui#1501`): Pullfrog approved; carried as First 1 for the merge.
- First 3 (`ui#1504`, `ui#1505`, `ui#1506`, `ui#1507`): `ui#1504` merged (`568a1b37`); `ui#1505` and `ui#1506` approved, carried as First 1; `ui#1507` carried as First 2.
- First 4 (`ui#1508`): done, merged to `main` as `b0729b89`.
- First 5 (`#1121`): done, measured and closed.
- First 6 (close tickets): carried as First 4.
- First 7 (chain closes after `#1129`): carried as First 5.
- Then 1 to 4: carried as Then 1 to 4.
- New owner instruction this run: the relay must never interrupt background workflows or subagents: filed as `#1132`, delivered as `ui#1509`, carried as First 3.

Every identifier here came from a previous session: treat each as a lead to verify.
