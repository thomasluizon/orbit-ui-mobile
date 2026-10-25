/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep. Read `TESTING.md` `## Astra capability eval` before any `#26` segment.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `crank: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is MAX WORKERS, MAX SPEED: crank is on (section below). The owner is awake and reporting: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him; when an MCP reaches the wrong account, use `claude-in-chrome`. The permission classifier refused reading a staging sign-in code from Gmail in Chrome: do not retry that route (the owner granted the browser permission for the Play listing), and do not sign in to staging web through Google in Chrome.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 114 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id (this relay ran `carry-out.sh`, so the durable copy is current). Read the carried `prev-sleep-decisions-b71a408c.md` first (D1 onward), then `prev-sleep-decisions-c79a9e05.md`. Every helper, procedure and rule in the previous prompts still binds: read them with `git show HEAD~1:.claude/handoffs/NEXT.md` through `git show HEAD~4:.claude/handoffs/NEXT.md` for the full helper list (`log.sh`, `launch-new-ticket.sh`, `launch-review-round.sh`, `new-worktrees.sh`, `answer-push.sh`, `base-overlap.sh`, `mc-full.sh`, `api-wt-tests.sh`, `joblogs.sh`, `close-released.sh`, `release-carry.sh`, `prod-sql.sh`, `staging-sql.sh`, `render-export.mjs`, `wait-new-export.sh`, `staging-ai-limits.sh`, `pg-227.sh`, `sync-from-pred.sh`) and the Render (workspace `tea-ctg9ljtumphs73dep1o0`; production API `srv-d6tc2isr85hc739bf75g` at `https://api.useorbit.org`; staging API `srv-dasotg8473hc739a5gjg` at `https://orbit-api-staging-uqu2.onrender.com`; production Postgres `dpg-dasotg8473hc739a5gpg-a`; staging Postgres `dpg-dasotg8jo6nc73cok6g0-a`), Play, Sentry and Gmail details. Staging web is `https://staging.useorbit.org`, production web `https://app.useorbit.org`. The staging API is a free Render service that spins down when idle: run a `/health` keep-awake poller (every 30 s) as a background task during every staging API deploy. `run-26c` still runs detached in the `e27e3737` scratchpad (`run-26c/DONE` is its end marker; it rotates the only current `#26` credentials file, `eval-env/eval-credentials.json` in the `fe3810c1` scratchpad); after `DONE`, move that file into the new scratchpad and point everything at that one copy. Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`; new tickets through `tools/create-ticket.mjs`; thread ids come from `tools/list-bot-threads.mjs` output. In Bash, a redirect target must be a literal path (the guardrail refuses variable targets and process substitution), nothing may write or link inside `node_modules`, and a command line naming the worker engine's exec subcommand is refused. Branches use only `feature/`, `fix/` or `chore/`.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 47, placed 47 (`#1712`, `#1713`, `#1714` and `#1715` new; `#1696`, `#1711`, `#1709`, `#31` and `#1710` closed and removed), unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `2cf09bf18`, API `main` is `e6dc5362`, landing `main` is `0d5e3df4`. Staging and production API `e6dc5362` (Healthy); staging and production web `00dc2c525`. Android Open 1.3.96 (155) is live; 1.3.97 (156) from `main` `0965ec87a` is uploaded (run 40162042349 succeeded) and in Play review. Open pull requests: UI `#2050`, `#2045`, `#1984`, `#1989` (relay docs); API `#914`, `#903`; landing none.

| Item | Disposition |
| --- | --- |
| Web release of `9bdd1baf5` | Carries `#1708` (`ui#2049`). Release staging web from `main`, then production web, then the next Android Open release; close `#1708` after Android. |
| Android Open 1.3.97 (156) | Uploaded and in Play review (carries `#1683`, `#1620`, `#1700`, `#1701`, `#1702`). When Play makes it available, close those five with `close-released.sh` (update its WEB and APK constants to `00dc2c525` and `0965ec87a` first). |
| `ui#1984` (`#577`) | Main carry pushed by its worker as `dd0ab15ba`. Read the resolution against `DESIGN.md`, wait for CI and a fresh Pullfrog approval at that head, merge; then `#579`. |
| `ui#2045` (`#1562`) | Round 2 pushed as `bd9421081` (P1 thread resolved, body edited). CI, a fresh approval at that head, merge. |
| `orbit-api#914` (`#227` step 4b) | Delivered at `711dee3d` (drops `IsGeneral`, `IsFlexible`, `DueDate`, both compatibility triggers; exact `Down`). Read the diff and its idempotent SQL, run `pg-227.sh` red and green, CI and approval, a fresh production export, merge, staging API (keep-awake) then production API, then the `#227` production web and Android checks. |
| `#1713` | Delivered as `ui#2050` (`232d6a9bc`). Read the diff, CI, approval, merge, release, then resolve each Sentry group with its fix and release. |
| `#1714`, `#1715` | Owner orders filed this session (smart task Quando with a subtle Astra glyph; real block indentation and more row spacing). Launch both at once. |
| `#1712` | Not started: launch it (harness, Batch 0b). |
| `#1623` | Play listing drafts saved in both locales (phone, both tablet sizes, pt-BR feature graphic) with the owner's permission. Open the default store listing editor, press Avançar, send for review, record the state, close. |
| Staging Postgres | `orbit-staging` (free) is close to its expiry (`expiresAt` from the Render MCP `list_postgres_instances`): recreate a free one and reseed it before then (spec Open questions answer). |
| `orbit-api#903` (`#582`) | Held for the `#26` comparison. |
| `#26` | When `run-26c/DONE` appears: read every dump, launch one harness round on `main` for the two harness defects in the spec bullet (the grader's account date and the internal pending-operation strings), file the Astra behaviour failures on API tickets, then the gate run on fresh `main`; restore the staging ceilings afterwards (`staging-ai-limits.sh restore`). |
| `#1698` | Owner's next real connection with the default identity option; stays open. |
| `#195`, `#62`, `#1662`, `#1641`, AVD session (`#1610`, `#1595`, `#32`), `#1560` sign-in proof, `#1658`, `#972` | As in their spec bullets (`#195` runs only after `run-26c` ends; `#1662` windows 6 to 12 and 18 to 22 local; the staging connector lacks the `manage_api_keys` scope, so it cannot trigger a step-up email for `#1641`). |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate.
3. The rest of `## The order`.

## Crank

The owner ordered maximum velocity: the run state carries `crank: true`, which `adoptRelayRun` inherits. Invoke `/crank` immediately after `/sleep` entry (`ui#2047` is merged, so `.claude/skills/crank/SKILL.md` governs): keep the worker pool full to `caps.parallelTickets`, start every launchable ticket at once, merge and release every pull request the moment it meets the merge bar, base-merge at once when a red check needs it. Quality gates never drop. A cranked relay hands off with `/handoff --relay --sleep --crank`. Only `/crank --disable` ends it.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task (never a trailing `&`). Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check or a base merge. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never reset an AI counter or rotate accounts to finish an eval run; the owner allowed the raised staging ceilings for the current `#26` window only. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep and Crank rules, helper list: carried (decision log pointer moved to `b71a408c`; `render-export.mjs`, the staging keep-awake rule, the `node_modules` link refusal and the branch prefixes added).
- API release row: done. The failed staging deploy was a Render free-tier spin-down mid-deploy, not code; a fresh production export was verified; staging (run 40160788240) and production (run 40161202224) API at `e6dc5362`; `#1696` proven through the production connector; `#1711`, `#1696` and `#31` closed; Sentry `ORBIT-API-1H` resolved.
- `ui#2047`: done (merged `2cf09bf18` after a combined check, hooks and tools exit 0; `#1710` closed).
- `ui#2045`: carried (round 2 pushed).
- `ui#2039` web release: done (staging and production web `00dc2c525`); its Android Open release is carried as the 1.3.97 row.
- `ui#2048` (`#1709`): done (merged `0965ec87a`, `#1709` closed).
- `ui#2049` (`#1708`): done (merged `9bdd1baf5` after production API served `e6dc5362`); its web and Android releases are carried.
- `orbit-api#913` (`#227` step 4a): done (live on staging and production, trigger proven on staging); step 4b carried as `orbit-api#914`.
- `ui#1984`: carried (main carry pushed as `dd0ab15ba`).
- `orbit-api#903`, `#26`, `#1698`, `#195`, `#62`, `#1662`, `#1641`, AVD session, `#1560` sign-in proof, `#1658`, `#972`: carried.
- `#1623`: the set is rendered and committed (`thomas-brain` PR #4) and saved as Play listing drafts in both locales; sending for review is carried.
- Owner orders this session: filed as `#1714` and `#1715`; the Play screenshot change is done as drafts.

Every identifier here came from a previous session: treat each as a lead to verify.
