/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep. Read `TESTING.md` `## Astra capability eval` before any `#26` step.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `crank: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is MAX WORKERS, MAX SPEED: crank is on (section below). When the owner writes, answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him; when an MCP reaches the wrong account, use `claude-in-chrome`. The permission classifier refused reading a staging sign-in code from Gmail in Chrome: do not retry that route, and do not sign in to staging web through Google in Chrome.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 145 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id (this relay ran `carry-out.sh`). Read the carried `prev-sleep-decisions-c727479b.md` first (D1 onward), then `prev-sleep-decisions-b71a408c.md`. Every helper, procedure and rule in the previous prompts still binds: read them with `git show HEAD~1:.claude/handoffs/NEXT.md` through `git show HEAD~4:.claude/handoffs/NEXT.md` for the full helper list and the Render, Play, Sentry and Gmail details. Helpers added: `pg-227b.sh` (disposable PostgreSQL proof), `staging-keepawake.sh <minutes>` (stop it with `staging-keepawake.stop`), `run-26-gate.sh` (the detached gate run). Staging web is `https://app-staging.useorbit.org`, production web `https://app.useorbit.org`, staging API `https://orbit-api-staging-uqu2.onrender.com`, production API `https://api.useorbit.org`. The staging API is a free Render service that spins down when idle: run `staging-keepawake.sh` as a background task during every staging API deploy. A production API release of a commit staging does not serve must pass `-f sha=<the staging commit>`. Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`; new tickets through `tools/create-ticket.mjs`; thread ids come from `tools/list-bot-threads.mjs` output. In Bash, a redirect target must be a literal path, nothing may write or link inside `node_modules`, and a command line naming the worker engine's exec subcommand is refused. Branches use only `feature/`, `fix/` or `chore/`.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 50, placed 50 (`#1716`, `#1718`, `#1719`, `#1720` new; `#1712` and `#1717` closed and removed), unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `b081fabd2`, API `main` is `07a03aee`, landing `main` is `0d5e3df4`. Staging and production API `437acf62` (Healthy; `07a03aee` adds only the reseed workflow); staging and production web `01dd318e0`. Android Open 1.3.96 (155) is live; 1.3.97 (156) from `main` `0965ec87a` is in Play review. No worker is running at this handoff.

| Item | Disposition |
| --- | --- |
| Staging Postgres | Under two days from its `expiresAt` (Render MCP `list_postgres_instances`). Launch `#1719` (carry staging data across the replacement) at deep first. Then dispatch `staging-reseed.yml` (fixed by `orbit-api#917`) after every eval-account step and at least ten hours before `expiresAt`, even if `#1719` has not landed; verify `/health`, migrations, the owner seed and the staging connector; close `#1718`. |
| `#26` gate run | Running detached: `run-26-gate.sh` in the durable scratchpad, worktree `eval-gate` at `137d4c4b1`, staging API `437acf62`. Start a background poller on `run-26-gate/DONE`. When it ends, read `reports/` in the `eval-gate` worktree and file each failure on its owning ticket; rerun the `#1716` cases after `orbit-api#916` deploys; then `staging-ai-limits.sh restore`, both flags off, then decide `orbit-api#903`. |
| `orbit-api#916` (`#1716`) | Pullfrog CHANGES_REQUESTED, P1 `PRRT_kwDORKgXhc6v-xQF` (empty-answer recovery bypasses `CompleteCommittedAsync` after a checkpointed block write), plus a conflict with `main` in `ProcessUserChatCommand.cs`. One deep round fixes both; copy approval for "I couldn't prepare an answer. Please try again." / "Não consegui preparar uma resposta. Tente novamente."; merge, staging then production API. |
| `ui#2053` (`#1714`) | Approved, copy approved and posted, red: Guards Production Feature Parity, six tools-harness parity cases, Layout shards 1 and 2, Upgrade layout geometry. Deep CI round: record the owner-ordered removal of the Proposed date flow with its citation in `tools/feature-parity-rules.json`, fix the layout specs. |
| `ui#2052` (`#1715`) | Approved and green, conflicts with `main` in `apps/mobile/components/habits/habit-row.tsx` after `ui#1984`. Main carry, fresh approval, merge. |
| `ui#2050` (`#1713`) | Approved and green at `6ebdb43dd`, conflicts with `main` (`shell-pinned-content.tsx`, `use-is-desktop.ts`, and `menu.tsx` deleted on main: move the matchMedia guard to the headless menu owner). Deep main carry, fresh approval, merge, release, resolve the Sentry groups. |
| `ui#2057` (`#579`) | Delivered, not yet read. Read the diff against `DESIGN.md`, CI, approval, merge. |
| `#1720` | Filed against the pre-`ui#2055` tree. Run `node tools/test-tools.mjs --only research-run` on `main` under load; close as a duplicate of `#1712` if green, otherwise launch. |
| Web release | `main` `b081fabd2` carries `ui#2045` (Apple) plus harness-only merges: release staging then production web after the next UI fix merges, or now if nothing is close. |
| Android Open | When 1.3.97 is available, close `#1683`, `#1620`, `#1700`, `#1701`, `#1702` with `close-released.sh` (update its WEB and APK constants first), then send the seven `#1623` listing changes from the publishing overview. Then dispatch the next Open release carrying `#1708`, `#577`, `#227` and the merged fixes; close those three after it is available. |
| `orbit-api#903` (`#582`) | Held for the `#26` comparison. |
| `#1698`, `#195`, `#62`, `#1662`, `#1641`, AVD session (`#1610`, `#1595`), `#1560` sign-in proof, `#1658`, `#972`, `#1151` sweep rerun | As in their spec bullets. `#195` and `#62` acceptances use the eval accounts, so run them before the reseed or after `#1719`. The `#1151` sweep needs an authenticated staging session; build it from the eval Pro account tokens the way `accept-195/accept.mjs` does. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate, staging Postgres first.
3. The rest of `## The order`.

## Crank

The owner ordered maximum velocity: the run state carries `crank: true`, which `adoptRelayRun` inherits. Invoke `/crank` immediately after `/sleep` entry (`.claude/skills/crank/SKILL.md` governs): keep the worker pool full to `caps.parallelTickets`, start every launchable ticket at once, merge and release every pull request the moment it meets the merge bar, base-merge at once when a red check needs it. Quality gates never drop. A cranked relay hands off with `/handoff --relay --sleep --crank`. Only `/crank --disable` ends it.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task (never a trailing `&`). Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check or a base merge. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never reset an AI counter or rotate accounts to finish an eval run; the owner allowed the raised staging ceilings for the current `#26` window only. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep and Crank rules, helper list: carried (decision log pointer moved to `c727479b`; staging web host corrected to `app-staging.useorbit.org`; the pinned production sha rule and three helpers added).
- Web release of `9bdd1baf5`: done (staging and production web `01dd318e0` carry it); `#1708` waits on the Android row.
- Android Open 1.3.97: carried (still in Play review).
- `ui#1984` (`#577`): done (merged `01dd318e0`, released to web); `#579` delivered as `ui#2057`.
- `ui#2045` (`#1562`): done (base merge resolved by regenerating the contract from `e6dc5362`, merged `155f32d6f`).
- `orbit-api#914` (`#227` step 4b): done (PostgreSQL proof red and green, fresh export, merged `e19ecc99`, staging and production API, connector read-back on both); the Android check is carried.
- `#1713` / `ui#2050`: round 1 pushed and approved; the main carry is carried.
- `#1714`, `#1715`: delivered as `ui#2053` and `ui#2052`; carried as rows above.
- `#1712`: done (`ui#2055`, closed); its spin-off `#1717` done (`ui#2056`, closed).
- `#1623`: the send is carried (held so the 1.3.97 review does not restart).
- Staging Postgres: carried, now owned by `#1718` (fixed, `orbit-api#917`) and `#1719`.
- `#26`: findings read, harness fixed (`ui#2054`), behaviour failures filed (`#1617` fixed live as `orbit-api#915`, `#1716`), gate run started; the rest is carried.
- `orbit-api#903`, `#1698`, `#195`, `#62`, `#1662`, `#1641`, AVD session, `#1560` sign-in proof, `#1658`, `#972`: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
