/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep. Read `TESTING.md` `## Astra capability eval` before any `#26` segment.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him ("the rest is not waiting on me, just do it yourself"); when an MCP reaches the wrong account, use `claude-in-chrome`. The permission classifier refused reading a staging sign-in code from Gmail in Chrome: do not retry that route, and do not sign in to staging web through Google in Chrome (a provider sign-in page).

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 115 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id. Read the previous session's carried `prev-sleep-decisions-fe3810c1.md` first (D1 onward), then `prev-sleep-decisions-1e50c797.md`. Every helper, procedure and rule in the previous prompts still binds: read them with `git show HEAD~1:.claude/handoffs/NEXT.md` and `git show HEAD~2:.claude/handoffs/NEXT.md` for the full helper list and the Render (workspace `tea-ctg9ljtumphs73dep1o0`; production API `srv-d6tc2isr85hc739bf75g`), Play, Sentry and Gmail details. New in the carried scratchpad: `accept-195/accept.mjs` (the `#195` headless acceptance on the eval Free account), `diag-26/profiles.mjs` (eval account plan and allowance, prints no token) and `diag-26/moderation-probe.sh` (sends text to omni-moderation with the staging key piped from Render, never printed). The only current `#26` credentials file is the carried `eval-env/eval-credentials.json` (moved out of the `1e50c797` scratchpad, whose copy is retired; the harness rotates it, so never keep two copies in use). The eval checkout is the detached worktree `eval26/` in the `1e50c797` scratchpad at `728b83aca`; recreate it from `main` with `npm ci --prefix evals/astra --workspaces=false` if it is gone. Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`; new tickets through `tools/create-ticket.mjs`; thread ids come from `tools/list-bot-threads.mjs` output. In Bash, a redirect target must be a literal path (the guardrail refuses variable targets), and a command line naming the worker engine's exec subcommand is refused.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 48, placed 48 (`#1706` in Batch 0c and `#1707` in Batch 0b are new; `#1703` closed and removed), unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `010eb4645`, API `main` is `dec1187a`, landing `main` is `0d5e3df4`. Staging and production web `728b83ac`; staging and production API `dec1187a` (verified). Android Open 1.3.96 (155). Open pull requests: UI `#2044`, `#2043`, `#2039`, `#1984`, `#1989` (relay docs) `#2045`; API `#911`, `#903`; landing none.

| Item | Disposition |
| --- | --- |
| `ui#2039` (`#1700`) | Green, approved at `4747ac70e` after its push, 0 threads. A combined check on `efc1e9ce7` passed 8 lanes before the relay (`check-2039/summary.txt` in the `fe3810c1` scratchpad), but `main` then gained `ui#2040`, which shares `DESIGN.md`: rerun `mc-full.sh 2039 4747ac70e16a9bccbbc13e113ef60250839b68e9` detached on the current `main`, poll its `DONE`, merge at `4747ac70e` only when every lane passes. |
| `ui#1984` (`#577`) | After `ui#2039` merges: main carry at `deep` (conflicts in both `menu.tsx` and both `menu.test.tsx`; keep the `#1700` labels and the headless menus), fresh CI and approval, merge; then `#579`. |
| `ui#2043` (`#1705`) | Approved; Parity fixed (PR Metadata green); PR Tests run 40146630698 attempt 3 requested after two per-file timing misses on files it does not touch; if it misses again, merge `main` into it after `ui#2044` lands. Green, merge, production web, resolve Sentry `ORBIT-WEB-13`, close. |
| `ui#2042` (`#1702`), `ui#2040` (`#1701`) | Merged (`36d8fba39`, `010eb4645`); they ride the next production web and Android Open releases. |
| `ui#2044` (`#1707`) | Opened by the worker (`5b37adc81`, 246 cases in four files). The scope grew (spec bullet): launch a round that also splits `habit-form-fields.test.tsx` and `habit-understanding-geometry.test.tsx`, read the diff, push once, CI, approval, merge. |
| `orbit-api#911` (`#1706`) | Head `445f7d6d`; local `e702af47` (neutral copy) not pushed. Launch the self-harm routing round (spec bullet), approve the final copy with `/second-opinion`, edit the body, push once. |
| `ui#2045` (`#1562`) | Delivered by the deep worker (`ae5039acd`, four commits). Read the diff, approve its `## Copy` strings with `/second-opinion`, CI, approval, merge. |
| `#26` | The owner allowed raised staging limits for this window. The third run runs detached (`run-26b.sh`, output in the `fe3810c1` scratchpad `run-26b/`): poll `run-26b/DONE` with a Bash background task, then follow the spec bullet (reports, failures on their tickets, `edge-free-limit-en` after 00:00 UTC, restore the limits, flags off, decide `#582`). |
| `#195` | Finish `accept-195/accept.mjs` (skip the onboarding, then the create form at capacity, the allowance notice and a free sub-habit), outside an eval segment; post evidence, close. |
| `#1698` | Production carries it; closes after the owner's reconnect (Open questions). |
| Releases | After the UI fixes merge: production web from `main`, then one Android Open release from `main` (carries `#1683`, `#1620`, `#1700`, `#1701`, `#1702`); repoint `release-carry.sh` and `close-released.sh`, then close `#1683`, `#1620`, `#1699`. |
| `#1662`, `#31`, `#1623`, `#62`, AVD session (`#1610`, `#1595`, `#32`), `#1560` sign-in proof, `#1658` | As in their spec bullets (the en demo account's AI ceiling resets at 04:00 UTC for the `#1623` Astra frame; `#1662` trigger windows are 6 to 12 and 18 to 22 UTC for the eval Pro account). |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate.
3. The rest of `## The order`.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task (never a trailing `&`). Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never reset an AI counter or rotate accounts to finish an eval run; the owner allowed the raised staging ceilings for the current `#26` window only. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep rules, helper list: carried (decision log pointer moved to `fe3810c1`; `TESTING.md` eval section added to the reading list; the no-raise rule added to Sleep).
- Owner decisions this session: raise the staging limits for the `#26` window (done, third run running); he will reconnect the production connector later (kept in Open questions).
- `#26` second run: done; it stopped at the `edge-free-limit-en` fixture reset with no stored results; findings on `#26`; staging limits restored (the raise broke `TESTING.md`); flags kept on for the remaining segments; `#582` decision carried.
- `ui#1984` combined check: superseded by the `ui#2039` merge order and a main carry.
- `ui#2039`: carried (combined check to rerun on the current `main`).
- `ui#2043`: carried (Parity fixed, PR Tests rerun).
- `ui#2042` and `ui#2040`: done (round pushed, merged `36d8fba39` and `010eb4645`). `ui#2041`: done (merged `c936a57c7`, `#1703` closed). `ui#2038`: done (merged `dc94b18d0`; `#1699` waits for production web). `ui#2036`: done (merged `efc1e9ce7`); `#1562` delivered as `ui#2045`.
- `#1698`: done as a production release (`dec1187a`); the dialog check is superseded by the HTTP proof and the owner's reconnect.
- Releases, `#1662`, `#31`, `#1623`, `#62`, `#195`, AVD session, `#1560` sign-in proof, `#1658`: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
