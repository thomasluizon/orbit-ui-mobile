/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

This session is the nominated successor of a context relay: adopt the run with `adoptRelayRun` as the sleep skill says, and do not replan the queue.


## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Priority: the owner's mobile review, research done, Codex arm and questions next

The owner reviewed Orbit Staging on his phone and found the redesign crowded and desktop-like. The spec's Batch R section "The owner's mobile review on his phone" lists every defect and its standing rule states the principle (native mobile feel, less on each screen, sheets and menus for secondary content, breathing room, padded hover and press fills, no wrapped or ellipsized labels). Every fix lands on Android and web. This outranks everything below except merging pull requests that are already approved.

1. The research Workflow is done; its full synthesis is in the brain vault at `0 Inbox/raw/orbit-mobile-review/research-final.json` and, if the workflow agent finished it, in the note `2 Areas/20-29 Orbit Engineering/Research - native mobile feel for the Orbit redesign.md`. Read the JSON first. If the note is missing, write it from the JSON through the Obsidian MCP (report, then the DESIGN.md changes, drawing changes, tickets, owner questions, sweep checklist and departures).
2. Once `ui#1507` (`#1128`, the research-only launcher mode) merges, run the Codex research arm through it on the same question (mobile design philosophy first, the brain record first), then reconcile its findings with the JSON and record the reconciliation in the brain note.
3. Then run one `/questions` round with the owner (his instruction; it overrides the sleep skill's never-ask rule for this round only, and never during a relay) on the three questions in the spec's `## Open questions`, recommendation first. Keep workers busy on unaffected tickets while it waits.
4. Then correct `DESIGN.md` and the affected drawings to his answers, file the tickets the JSON proposes (one per coherent defect, adjusted to the answers), place each in Batch R, and fix every item on both platforms.
5. Then a full sweep of every screen and every component, every line of UI code on both platforms, against the corrected rules, fixing everything it finds, then rendered sweeps (phone, foldable, desktop) until a full pass finds nothing.

## First: the open pull requests

1. `ui#1503` (`#1123`): its worktree `ticket-1123-action-rows` holds a local merge of `redesign/main` plus three review-fix commits ending at `81b5cf2b`, all unpushed; the hermetic `action-rows.spec.ts` passes 65 of 65 locally on that tree. A red proof of the spec on the unfixed base was running at handoff (scratch worktree `red-p1503` under the old session scratchpad; rerun `red-spec.sh p1503 81b5cf2b action-rows.spec.ts msgs` if it is gone). Then merge the three workers' final reports into the body with `merge-review-batch-body.mjs` (`--ui-scope`), push once, clear the fresh review, check the diff against `DESIGN.md` and the canvas, approve its new copy with `/second-opinion`, merge on the bar.
2. `ui#1501` (`#1125`) at `53251411`: every check green; Pullfrog posted no review of this head, so a plain `@pullfrog review` comment asked for one. Read it with `--wait-seconds 0 --no-request`, merge on the bar.
3. `ui#1504` (`#1129`), `ui#1505` (`#1127`, red proven), `ui#1506` (`#1130`), `ui#1507` (`#1128`): delivered, assumptions accepted; read CI and review, clear findings, merge on the bar (combined merge check when behind; `ui#1504` and `ui#1507` change tools and hooks, so run both harness suites).
4. `ui#1508` (`#1131`, on `main`): two `release.yml` lines passing `NEXT_PUBLIC_PLAY_PACKAGE_NAME` per environment. Merge to `main` on the bar before the next staging web release.
5. `#1121`: measure queryid 2057064764435677686 again (before: 445 calls, 1,147,845 rows at the release), compute the delta, record before and after on `orbit-api#691`, close `#1121`.
6. Close each ticket with `node tools/complete-ticket.mjs --issue "#N"` after its merge into `redesign/main`.
7. When `#1129` merges, the open session chain can close at the next owner handoff.

## Then: the owner's review, the sweep, the gate

1. Release `redesign/main` web to staging after each batch of merges (after `#1131` is on `main`) and ship an Orbit Staging internal build (the next is 1.3.60 (119)).
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

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the owner's mobile review (Codex research arm, one `/questions` round, `DESIGN.md` corrected, every defect fixed on both platforms), the seven open pull requests merged, `#1121` measured and closed, a staging release and internal build, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). This run filed `#1128` to `#1131` and placed them in Batch R; the research's proposed tickets are not filed yet (they wait for the owner's answers).

## In flight

| item | disposition |
|---|---|
| `ui#1501` (`#1125`) at `53251411` | green; review requested; merge on the bar |
| `ui#1503` (`#1123`) | three unpushed review-fix commits to `81b5cf2b`, spec 65/65 locally; red proof, body merge, push, review, merge |
| `ui#1504` (`#1129`) | waiting on CI and review |
| `ui#1505` (`#1127`) | red proven; waiting on CI and review |
| `ui#1506` (`#1130`) | waiting on CI and review |
| `ui#1507` (`#1128`) | waiting on CI and review |
| `ui#1508` (`#1131`, `main`) | waiting on CI and review |
| `#1121` | released and carried; after measurement, then close |
| Research | done; synthesis in `0 Inbox/raw/orbit-mobile-review/research-final.json`; Codex arm after `#1128`; questions round after |
| Merged this run | `ui#1502` (`447185f6`), `ui#1500` (`3500e4f7`), `orbit-api#691` (`822f3038`, `main`), `orbit-api#692` (`7821c3f2`) |
| Closed this run | `#1124`, `#1126`, `#961` |
| Production | API `822f3038` (released this run), web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Staging | web `2ffd2b9c`, API `b36bf45d`; Orbit Staging 1.3.59 (118) internal |
| Waiters | the CI waiters die with this session; restart them |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none |
| Uncommitted work | none in the main checkouts; `ticket-1123-action-rows` has unpushed commits only |
| Unpushed commits | `fix/ticket-1123-action-rows` (base merge plus `3c6999a8`, `7a798256`, `81b5cf2b`) |
| Branches with no pull request | none |
| Detached HEADs | scratch merge-check and red-proof worktrees in the old session scratchpad (`mc-1502`, `red-p1505`, `red-p1503`); `git worktree prune` clears them once gone |
| Chrome | not used this run |
| Throwaway AVD | `Orbit_Repro_Throwaway` still exists; delete it once no repro needs it |
| Ignored files | the session decision log stayed in the scratchpad; durable facts are in the spec and the brain inbox JSON |
| Session chain | still open; it closes at the first owner handoff after `#1129` merges |
| Owner questions | the three research questions in the spec's `## Open questions` |

Workers launched by a session die when it ends: read each worktree before relaunching. The gate, red-proof and merge-check helper scripts live in the previous session's scratchpad; copy them with the session id replaced.

## Previous prompt, disposition

- Opening reading list, entry point, Sleep section, the authorization paragraph, the relay paragraph and owner instructions 1 to 12: carried verbatim.
- Priority 1 (research Workflow): done for the Claude arm (synthesis saved to the brain inbox JSON); the Codex arm is carried as Priority 2, because its sanctioned launcher (`#1128`) was built this run and is in review.
- Priority 2 (one `/questions` round): carried as Priority 3; never asked during a relay.
- Priority 3 and 4 (`DESIGN.md`, tickets, full sweep): carried as Priority 4 and 5.
- First 1 (`ui#1500`): done, merged as `3500e4f7` after a review fix that keeps subagent tool calls out of the relay.
- First 2 (`ui#1501`): manifest regenerated and pushed; carried as First 2.
- First 3 (`ui#1502`): done, merged as `447185f6`.
- First 4 (`orbit-api#691`): merged, released to production and carried (`orbit-api#692`); the after measurement is carried as First 5.
- First 5 (`ui#1503`): carried as First 1 with three review fixes made.
- First 6 (`#961`): done, closed with the staging log evidence.
- First 7 (close tickets): carried as First 6.
- First 8 (handoff parser): filed as `#1129`, delivered as `ui#1504`; carried as First 3 and 7.
- Then 1 (Play manage-link defect): filed as `#1130`, delivered as `ui#1506`, plus `#1131` (`ui#1508`) for the `main` workflow; carried as First 3 and 4.
- Then 2 (`#1127`): delivered as `ui#1505`, red proven; carried as First 3.
- Then 3 to 6: carried as Then 1 to 4.

Every identifier here came from a previous session: treat each as a lead to verify.
