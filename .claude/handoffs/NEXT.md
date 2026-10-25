/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep. Read `TESTING.md` `## Astra capability eval` before any `#26` segment.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `crank: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is MAX WORKERS, MAX SPEED: crank is on (section below). The owner is awake and reporting: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him; when an MCP reaches the wrong account, use `claude-in-chrome`. The permission classifier refused reading a staging sign-in code from Gmail in Chrome: do not retry that route, and do not sign in to staging web through Google in Chrome.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 100 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id. Read the previous session's carried `prev-sleep-decisions-e27e3737.md` first (D1 onward), then `prev-sleep-decisions-fe3810c1.md`. Every helper, procedure and rule in the previous prompts still binds: read them with `git show HEAD~1:.claude/handoffs/NEXT.md` through `git show HEAD~3:.claude/handoffs/NEXT.md` for the full helper list (`log.sh`, `launch-new-ticket.sh`, `launch-review-round.sh`, `new-worktrees.sh`, `answer-push.sh`, `base-overlap.sh`, `mc-full.sh`, `joblogs.sh`, `close-released.sh`, `release-carry.sh`, `staging-ai-limits.sh` now with `raise-messages`) and the Render (workspace `tea-ctg9ljtumphs73dep1o0`; production API `srv-d6tc2isr85hc739bf75g`), Play, Sentry and Gmail details. New in the carried scratchpad: `run-26c.sh` and `diag-26/grader-probe.mjs`, `desktop-1560/verify-minisign.mjs` (Tauri updater signature check). The only current `#26` credentials file is `eval-env/eval-credentials.json` in the `fe3810c1` scratchpad, which `run-26c` rotates; after `run-26c/DONE` appears, move it into the new scratchpad and point everything at that one copy. The `run-26c` checkout is `eval26/` in the `1e50c797` scratchpad at `728b83aca` with two untracked scratch files (`promptfooconfig.diag*.yaml`, `diag-dump.mjs`, `diag-grader.mjs`); the gate run uses a fresh checkout of `main`. Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`; new tickets through `tools/create-ticket.mjs`; thread ids come from `tools/list-bot-threads.mjs` output. In Bash, a redirect target must be a literal path (the guardrail refuses variable targets and process substitution), and a command line naming the worker engine's exec subcommand is refused.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 48, placed 48 (`#1708`, `#1709` in Batch 0c and `#1710` in Batch 0b are new; `#1699`, `#1705`, `#1707` closed and removed), unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `6b725006c`, API `main` is `dec1187a`, landing `main` is `0d5e3df4`. Staging and production web `7d000848a` (verified); staging and production API `dec1187a`. Android Open 1.3.96 (155). Open pull requests: UI `#2047`, `#2045`, `#2039`, `#1984`, `#1989` (relay docs); API `#911`, `#903`; landing none. No worker is running.

| Item | Disposition |
| --- | --- |
| `ui#2047` (`#1710`, `/crank`) | Pushed by the worker; diff read (skill, validator and relay carry, calibration, registry row). CI and Pullfrog, then merge first, close `#1710`; from then on `.claude/skills/crank/SKILL.md` governs the pace. |
| `ui#2039` (`#1700`) | `main` merged twice (`e125f7fba` resolved `DESIGN.md` with `main`'s spinner paragraph; `ce5557a4b` brings the test split). CI and a fresh approval at `ce5557a4b`, merge. |
| `ui#1984` (`#577`) | After `ui#2039`: main carry at `deep` (conflicts in both `menu.tsx` and both `menu.test.tsx`; keep the `#1700` labels and the headless menus), CI, approval, merge; then `#579`. |
| `ui#2045` (`#1562`) | Round 1 pushed `bd2f32bbf`, both threads resolved, body updated. CI, fresh approval, `/second-opinion` on the `## Copy` strings (claimed-defect framing), post the verdict, merge. |
| `orbit-api#911` (`#1706`) | Approved at `4329ca6f`, 0 threads; SonarCloud red on `S2583` at `ProcessUserChatCommand.cs:260`. Launch a `mechanical` round that returns the moderation result through the callback (no waiver), push, approval, merge, staging and production API; then `#1708`. |
| `orbit-api#903` (`#582`) | Held for the `#26` comparison. |
| `#26` | `run-26c` (findings run) runs detached; poll `run-26c/DONE` in the durable scratchpad with a Bash background task, read every `dump-*.json`, file or record each failure, then the gate run on fresh `main` (spec bullet). Staging Pro ceilings are raised for the window (800, 3000, 3,000,000); restore after the gate run. |
| `#1660`, `#1698`, `#1696` | The owner re-added the production connector. Prove from it (spec bullets), then close and resolve `ORBIT-API-1H`. |
| `#1641` | Photo route set; verify with a received staging email (spec bullet). |
| Releases | Production web `7d000848a` is live. After `ui#2039` merges: staging and production web, then one Android Open release from `main` (carries `#1683`, `#1620`, `#1700`, `#1701`, `#1702`); then close those. |
| `#195`, `#62`, `#1662`, `#31`, `#1623`, AVD session (`#1610`, `#1595`, `#32`), `#1560` sign-in proof, `#1658`, `#1709` | As in their spec bullets (`#195` runs only after `run-26c` ends; `#1623` Astra frame after 04:00 UTC; `#1662` windows 6 to 12 and 18 to 22 UTC). |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate.
3. The rest of `## The order`.

## Crank

The owner ordered maximum velocity: the run state carries `crank: true`, which `adoptRelayRun` inherits. Invoke `/crank` immediately after `/sleep` entry (once `ui#2047` merges the skill exists; until then apply its rules from the `ui#2047` diff): keep the worker pool full to `caps.parallelTickets`, start every launchable ticket at once, merge and release every pull request the moment it meets the merge bar, base-merge at once when a red check needs it. Quality gates never drop. A cranked relay hands off with `/handoff --relay --sleep --crank`. Only `/crank --disable` ends it.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task (never a trailing `&`). Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check or a base merge. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never reset an AI counter or rotate accounts to finish an eval run; the owner allowed the raised staging ceilings for the current `#26` window only. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep rules, helper list: carried (decision log pointer moved to `e27e3737`; `crank: true` added to the hand-start fallback).
- `ui#2039`: carried (combined check impossible on a `DESIGN.md` conflict; resolved by two main merges, awaiting CI and approval).
- `ui#1984`: carried. `ui#2043`: done (merged `7d000848a`, production web, `#1705` closed, `ORBIT-WEB-13` resolved). `ui#2044`: done (round 1 and carry, merged `6b725006c`, `#1707` closed). `ui#2042`, `ui#2040`: live on production web; carried to the Android Open release.
- `orbit-api#911`: carried (self-harm routing and client-aware declines pushed and approved; one Sonar round left). `ui#2045`: carried (round 1 pushed).
- `#26`: carried (the third run's failures were harness defects, fixed by `ui#2046`; findings run `run-26c` running; the gate run follows).
- `#195`, `#1662`, `#31`, `#1623`, `#62`, AVD session, `#1560` sign-in proof, `#1658`: carried (`#1560` channel signatures done).
- `#1698`: carried (the owner's reconnect is done; proof and close).
- Releases: production web `7d000848a` done; the Android Open release carried.

Every identifier here came from a previous session: treat each as a lead to verify.
