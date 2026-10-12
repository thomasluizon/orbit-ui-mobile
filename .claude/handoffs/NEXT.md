/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`, including the owner's gate review paragraph) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Freeze the redesign at 22 tickets and send later polish past the gate.md`, `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, the decision log, the gate findings and the pt-BR audit in `ptbr/` and `gate-tickets/`) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, then check `grep -n "^SP=" mc-prep.sh mc-check.sh gated-launch.sh prep-ticket.sh` names the new scratchpad. New helpers: `prep-ticket.sh <ui|api> <repo path> <issue> <name> <branch> <base> [--layout-guard]` (worktree, contract branch, prompt), `gated-launch.sh <launch-worker arguments>`, `pr-bar.sh <repo name> <pr>` (head, merge state, the latest non-green check per name, the Pullfrog review at the head, open threads). The earlier helpers and the shell cautions in the spec's `## Current state` still apply.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the owner's gate findings fixed and on his phone: the nine Batch R gate tickets merged, staging released, the next Orbit Staging internal build dispatched, and the owner told which findings each build fixes. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order` (`reconcile.mjs`): 141 open, 141 placed, 0 unplaced, 0 placed twice for the tickets filed in this run. The run ends only when the spec is done or for an external cause.

## Then: the in-flight work, in this order

1. Close the tickets whose pull requests merged, with `tools/complete-ticket.mjs`: `#1370` (`orbit-api#709`), `#1372` (`orbit-api#710`), `#1371` (`ui#1724`). Tear down their worktrees (`t1370-api-ptbr-copy`, `t1372-staging-allowlist`, `t1371-android-backup`) with `node tools/teardown-worktree.mjs`, one at a time.
2. Restart CI waiters for the seven open pull requests (at most three waiters, several `--pr` each) and read each with `pr-bar.sh`.
3. Merge on the bar in this order, each later i18n pull request merging forward and passing a combined check first: `ui#1726` (`#1364`), `ui#1730` (`#1369`), `ui#1723` (`#1368`), `ui#1725` (`#1367`), then `ui#1727` (`#1365`), `ui#1729` (`#1366`), `ui#1728` (the Layout Guard flake). A `calendar-day-habit-rows.spec.ts:26` red is the flake `ui#1728` fixes and a `conversation-thread-scroll.spec.ts:24` red is `#1356`: rerun once. A `Web image build` red reading `public.ecr.aws ... 429` is a registry limit: rerun. Any layout case a pull request adds or edits is proven red on the base and green on its head before the merge.
4. After the merges: release staging with `node tools/release-plan.mjs --environment staging --branch redesign/main` (web, and the API copy fix from `orbit-api` `main`), dispatch the next Orbit Staging internal build, then tell the owner in one short report which of his findings each build fixes and what he can retest. A progress report leads with how many of the 22 plus the nine gate tickets remain.
5. Keep answering the owner's screenshots: each finding becomes a Batch R ticket and a worker at once.
6. Then the rest of `## The order` after THE REDESIGN GATE, which still holds until the owner approves it.

## In flight

| item | disposition |
|---|---|
| `ui#1723` `71c69fbd` (`#1368` pt-BR copy) | test alignment pushed by the orchestrator; CI running; needs Pullfrog approval at this head (step 3) |
| `ui#1725` `b75d7d3b` (`#1367` Google sign-in) | surface manifest regenerated and pushed; CI running; Pullfrog approved the previous head `9371eaa4`, needs one at this head (step 3) |
| `ui#1726` `7beccfc0` (`#1364` segments) | approved at head, 0 threads; reruns requested for `Web image build` (ECR 429) and Layout Guard (`conversation-thread-scroll`) (step 3) |
| `ui#1727` `61335424` (`#1365` onboarding back arrow) | CI and review pending; the worker's full suite ran out of time, CI is the evidence (step 3) |
| `ui#1728` `c253969d` (Layout Guard flake) | CI and review pending (step 3) |
| `ui#1729` `abdd630c` (`#1366` Hoje arrows) | CI and review pending (step 3) |
| `ui#1730` `a1a92a3a` (`#1369` weekday articles) | CI and review pending (step 3) |
| Merged this session | `orbit-api#709` (`#1370`) as `d69b1347` and `orbit-api#710` (`#1372`) as `f4c2ce95` on `main`; `ui#1724` (`#1371`) as `8b360dc1` on `redesign/main`; tickets still open (step 1) |
| Tickets filed this session | `#1364` to `#1372` (Batch R); the pt-BR final lists are comments on `#1368` and `#1370` |
| Infra changed this session | `STAGING_POSTGRES_IP_ALLOW_LIST` deleted after `#1372`; Cloudflare: `app-staging.useorbit.org` proxied and the `orbit-staging-assetlinks` Worker serves `/.well-known/assetlinks.json` (by the `#1367` worker; verified 200 and Google `linked: true`) |
| Staging | API `86e7467c`, web `bba283a7`, landing `a50de090`, Orbit Staging 1.3.78 (137) on internal; release owed (step 4) |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; nothing released this session |
| Open pull requests | `orbit-ui-mobile` the seven above; `orbit-api` none; `orbit-landing-page` none |
| Workers, subagents, workflows | none running at handoff; worker logs are in the system temporary directory under `orbit-workers/` |
| CI waiters | stopped by the relay tool; restart (step 2) |
| Stashes | none in the three checkouts |
| Uncommitted work | none in the ticket worktrees; the main checkout holds only this handoff until its commit |
| Unpushed commits | none in any gate worktree |
| Branches with no pull request | none new |
| Detached HEADs | scratch build worktrees `mc-*` only; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água |
| Session chain | open; this is an automatic relay |
| Owner questions | none open; the gate approval waits on his testing |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner is awake and testing: answer each of his messages before other work, file a screenshot finding as a Batch R ticket and start its worker at once, never a question back. A progress report leads with how many redesign tickets remain and whether that fell since the last report, never with a merge count.

Carry the standing operating detail: start every worker, waiter and check as a harness background task; gate each launch (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation launches and relaunches; a CI or harness order with no UI review sweep heading launches without `--allow-subagents`; a branch that used its two launches is finished by the orchestrator as a review fix (strings, test assertions, a regenerated manifest) when the remaining change is mechanical; one hermetic Playwright run at a time; at most three GitHub-calling waiters; read `gh run list --commit <sha>` before calling a check red, because a body edit leaves cancelled duplicate runs; a stale-base red never clears on a rerun; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A worker's `NEEDS_DECISION` on copy is answered from `BRAND.md`, `DESIGN.md` Voice and the pt-BR rule, logged, and written to the ticket as a comment before the relaunch. A Surface Manifest Drift red is regenerated by the orchestrator (`node tools/surface-manifest.mjs`), with both harnesses run after it. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: file his gate findings as tickets now and start fixing, without waiting for him to finish testing; fix the GitHub Actions failures he sees (the staging Postgres reconcile is fixed; the Layout Guard flake is `ui#1728`); no literal pt-BR translation anywhere in the app; no option row that wraps to a second line. THE REDESIGN GATE holds until he approves: never merge `redesign/main` to `main`. Where a control sits is the run's call.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph and the relay line: carried.
- Steps 1 to 5 (`ui#1713`, `ui#1716`, `ui#1719`, `ui#1721`): done; all four merged and `#1352`, `#1337`, `#1340`, `#1351` closed (`redesign/main` reached `bba283a7`).
- Step 6, staging release, Orbit Staging build and the full rendered sweep: done (staging web `bba283a7`, Orbit Staging 1.3.78 (137), sweep `sweep-bba283a7.md` clean, owner notified at THE REDESIGN GATE).
- Owner instruction to finish the frozen 22 and stop at the gate: done; superseded by his gate review instructions above.
- Step 7, the rest of the order: carried as step 6.

Every identifier here came from a previous session: treat each as a lead to verify.
