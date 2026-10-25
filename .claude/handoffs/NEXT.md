/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep. Read `TESTING.md` `## Astra capability eval` before any `#26` segment.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `crank: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is MAX WORKERS, MAX SPEED: crank is on (section below). The owner is awake and reporting: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him; when an MCP reaches the wrong account, use `claude-in-chrome`. The permission classifier refused reading a staging sign-in code from Gmail in Chrome: do not retry that route, and do not sign in to staging web through Google in Chrome.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 155 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id (this relay ran `carry-out.sh`, so the durable copy is current). Read the carried `prev-sleep-decisions-c79a9e05.md` first (D1 onward), then `prev-sleep-decisions-e27e3737.md`. Every helper, procedure and rule in the previous prompts still binds: read them with `git show HEAD~1:.claude/handoffs/NEXT.md` through `git show HEAD~4:.claude/handoffs/NEXT.md` for the full helper list (`log.sh`, `launch-new-ticket.sh`, `launch-review-round.sh`, `new-worktrees.sh`, `answer-push.sh`, `base-overlap.sh`, `mc-full.sh`, `api-wt-tests.sh`, `joblogs.sh`, `close-released.sh`, `release-carry.sh`, `prod-sql.sh`, `staging-sql.sh`, `wait-new-export.sh`, `staging-ai-limits.sh`) and the Render (workspace `tea-ctg9ljtumphs73dep1o0`; production API `srv-d6tc2isr85hc739bf75g`; staging API origin `https://orbit-api-staging-uqu2.onrender.com`), Play, Sentry and Gmail details. New in the carried scratchpad: `pg-227.sh <label>` (the `orbit-api#913` PostgreSQL tests on a disposable container), `sync-from-pred.sh` (pattern for bringing a predecessor's scratchpad additions forward), `note-1562-rb2.md` (the prepared `ui#2045` round 2 order note). `run-26c` still runs detached in the `e27e3737` scratchpad (`run-26c/DONE` is its end marker; it rotates the only current `#26` credentials file, `eval-env/eval-credentials.json` in the `fe3810c1` scratchpad); after `DONE`, move that file into the new scratchpad and point everything at that one copy. Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`; new tickets through `tools/create-ticket.mjs`; thread ids come from `tools/list-bot-threads.mjs` output. In Bash, a redirect target must be a literal path (the guardrail refuses variable targets and process substitution), and a command line naming the worker engine's exec subcommand is refused.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 48, placed 48 (`#1711` new in Batch 0c; `#1660` closed and removed), unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `00dc2c525`, API `main` is `e6dc5362`, landing `main` is `0d5e3df4`. Staging and production web `7d000848a`; production API `dec1187a`; staging API `dec1187a` (Healthy): release run 40159152565 for `096f9ab2` FAILED at the Render deploy (`dep-dbenl0gae00c73do2ktg` ended `update_failed` at 04:02Z after 18 minutes in `update_in_progress`; the build and migration bundle succeeded). Android Open 1.3.96 (155). Open pull requests: UI `#2049`, `#2048`, `#2047`, `#2045`, `#1984`, `#1989` (relay docs); API `#903`.

| Item | Disposition |
| --- | --- |
| API release | First diagnose the failed staging deploy `dep-dbenl0gae00c73do2ktg` of service `srv-dasotg8473hc739a5gjg` (Render deploy events and the new instance's logs after 03:44:22Z: pre-deploy migration, health check or startup), fix the cause on api `main` if it is code, then take a fresh Render export (`wait-new-export.sh`), then staging API at `e6dc5362` (carries `#911`, `#912` and `#913`), then production API at `e6dc5362`. Then the `#1696` production proof through the production Orbit connector (disposable task, `delete_habit`, `confirm_agent_operation_v2`, `delete_habit` with the token, `get_habit` gone), close `#1711`, `#1696`, resolve Sentry `ORBIT-API-1H`, close `#31`. |
| `ui#2047` (`#1710`) | Review round 1 committed `629e4282d` (unpushed, worker log `#1710-63317-1792900199596.log` in the orbit-workers temp directory); read its report and diff, resolve threads `PRRT_kwDOR5Siws6v9-n7` and `PRRT_kwDOR5Siws6v9-n-` with replies, edit the body, push once, approval, merge, close `#1710`. From then on `.claude/skills/crank/SKILL.md` governs the pace. |
| `ui#2045` (`#1562`) | Launch review round 2 at `deep` with `note-1562-rb2.md` (the relay drain refused it; the branch is past its launch cap, record the reason): the P1 `PRRT_kwDOR5Siws6v9-kb` session-epoch regression. Copy is approved and posted. |
| `ui#2039` (`#1700`) | Merged `00dc2c525`. Release staging and production web from `main` now (carries `#1700`), then the Android Open release. |
| `ui#2048` (`#1709`) | Tests and docs only; CI and Pullfrog waiting. Merge on the bar, close `#1709`. |
| `ui#2049` (`#1708`) | CI and Pullfrog waiting; merge only after production API serves `e6dc5362` (deploy API first), then production web and the Android Open release. |
| `orbit-api#913` (`#227` step 4a) | Merged `e6dc5362`; ships in the API release row. Then a later physical-drop pull request after every instance runs it (behind a fresh export), and the production web create, edit and read-back plus the Android Open check before closing `#227`. |
| `ui#1984` (`#577`) | Now (ui#2039 merged): main carry at `deep` (conflicts in both `menu.tsx` and both `menu.test.tsx`; keep the `#1700` labels and the headless menus), CI, approval, merge; then `#579`. |
| `orbit-api#903` (`#582`) | Held for the `#26` comparison. |
| `#26` | When `run-26c/DONE` appears: read every dump, launch one harness round on `main` for the two harness defects in the spec bullet (the grader's account date and the internal pending-operation strings), file the Astra behaviour failures on API tickets, then the gate run on fresh `main`; restore the staging ceilings afterwards (`staging-ai-limits.sh restore`). |
| `#1623` | The English Astra frame (the en demo account's AI ceiling reset at 04:00 UTC): `capture-play.mjs demo.json en <out> astra`, then the spec bullet's remaining steps. |
| `#1698` | Owner's next real connection with the default identity option (neither current connector uses it); stays open. |
| `#195`, `#62`, `#1662`, `#1641`, AVD session (`#1610`, `#1595`, `#32`), `#1560` sign-in proof, `#1658`, `#972` | As in their spec bullets (`#195` runs only after `run-26c` ends; `#1662` windows 6 to 12 and 18 to 22 UTC; the staging connector lacks the `manage_api_keys` scope, so it cannot trigger a step-up email for `#1641`). |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate.
3. The rest of `## The order`.

## Crank

The owner ordered maximum velocity: the run state carries `crank: true`, which `adoptRelayRun` inherits. Invoke `/crank` immediately after `/sleep` entry (until `ui#2047` merges, apply its rules from the `ui#2047` diff): keep the worker pool full to `caps.parallelTickets`, start every launchable ticket at once, merge and release every pull request the moment it meets the merge bar, base-merge at once when a red check needs it. Quality gates never drop. A cranked relay hands off with `/handoff --relay --sleep --crank`. Only `/crank --disable` ends it.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task (never a trailing `&`). Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check or a base merge. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never reset an AI counter or rotate accounts to finish an eval run; the owner allowed the raised staging ceilings for the current `#26` window only. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep and Crank rules, helper list: carried (decision log pointer moved to `c79a9e05`; the durable carry is now current).
- `ui#2047`: carried (Pullfrog requested changes; round 1 ran at the relay).
- `ui#2039`: done (merged `00dc2c525` on a fresh approval); its web release is carried.
- `ui#1984`: carried. `ui#2045`: carried (copy approved and posted; round 2 prepared).
- `orbit-api#911`: done (round 3 pushed, merged `096f9ab2`, staging release dispatched); production carried in the API release row.
- `#26`: carried (`run-26c` still running; first findings recorded in the spec).
- `#1660`: done (closed). `#1696`, `#1698`: carried (the reconnect reused the old credential; `#1711` merged, release carried).
- `#1708`, `#1709`: delivered as `ui#2049`, `ui#2048`. `#227`: step 4a delivered as `orbit-api#913`.
- `#195`, `#1662`, `#31`, `#1623`, `#62`, AVD session, `#1560` sign-in proof, `#1658`, `#1641`: carried.
- Releases: production web `7d000848a` live; the Android Open release from `main` (carries `#1683`, `#1620`, `#1700`, `#1701`, `#1702`, then `#1708`) carried.

Every identifier here came from a previous session: treat each as a lead to verify.
