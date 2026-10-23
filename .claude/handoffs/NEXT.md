/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting live defects: answer each message first, in his language, and give each order a ticket before the turn ends. His standing instructions: research before experimenting, never iterate guesses against a live service when a source can answer; build his orders in full or not at all (no cheaper stand-in, rescope the existing ticket instead of filing a second one); never mention rotating an API key that showed in a log.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`, after adding every live session's 8-character id to its `SKIP_SESS` line; if that frees too little, clear rebuildable download caches (`docker builder prune -af`, `npm cache clean --force`, the Homebrew download cache, `pip cache purge`); the Docker images and volumes belong to other projects, leave them. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (about 18,700 entries, so run it as a background task) BEFORE writing any file into the new scratchpad: the restore skips names that already exist. Read the previous session's carried `prev-sleep-decisions-*.md` (D1 to D9) first. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above the `## Blocked, needs owner decision` heading. Redirects in Bash use literal paths (a variable or a process substitution in a redirect target is refused by the guardrail hook; write a script or a file with the Write tool, then run it); the shell is zsh. Ticket writes go through `node tools/create-ticket.mjs`, `node tools/comment-ticket.mjs` and `node tools/complete-ticket.mjs`, never raw `gh issue`; read tickets with `--json title,body,comments`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit, Gmail); never Chrome for those, except to see what Gmail renders. The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0`; its Postgres query tool cannot reach the databases, so production SQL reads go through the carried read-only `prod-sql.sh` and staging reads through `staging-sql.sh`; on `SSL connection has been closed unexpectedly`, compare `curl -sS https://api.ipify.org` with the `operator mac` allowlist entry and repoint it with `render-allowlist-set.mjs <dpg id> "operator mac" <ip>/32`. Carried helpers: `launch-new-ticket.sh` (takes an optional order note file), `new-worktrees.sh`, `launch-review-round.sh`, `body-merge.sh`, `answer-push.sh`, `prstat.sh`, `overlap.sh <worktree>` (merge-tree and shared files with main), `joblog.sh`, `tf-plan.sh`, `tf-apply-targeted.sh` (Terraform needs `-var=production_redesign_web_digest=<production_web_digest from local.tfvars>`), `pg-1660b-proof.sh` (PostgreSQL proof template), `state-remaining.mjs`, `reconcile-order.py`, `render-export.mjs`, `prod-sql.sh`, `time-877-create.sh` (the detached `CreateHabitTool` mutation timing). Thread ids come only from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --wait-seconds 0 --no-request`. Before any push, run `git merge-tree --write-tree --name-only origin/main HEAD` in the worktree. Copy every full SHA from `gh api .../pulls/<n> --jq .head.sha`. Redact any finished worker log with secret-shaped `NAME=value` pairs before quoting it. Play Open availability is read on Play Console Open testing (developer `4913102794253829646`, app `4976229514306926604`, `/tracks/open-testing`) through `claude-in-chrome` (one tab, close it after).

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 76, placed 76, unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `2e2d103d`, API `main` is `4050b5c6`, landing `main` is `0d5e3df4`. Production web `175eb7a8`, staging web `cb47241e`; production API `b0bfe642`, staging API `78dfea5b`; production landing `0d5e3df4`. Android Open `1.3.92` (`151`) is available. No worker is running at this handoff.

| Item | Disposition |
| --- | --- |
| Owner MCP retry (`#1660`) | FIRST. `orbit-api#881` is live on staging (`78dfea5b`); the owner was asked to retry the staging Orbit MCP connection with Google and the email code. When he reports success (or a failure, which is a live defect), release production API. Before that production release, release staging API `4050b5c6` (adds `orbit-api#882`) with `-f sha=` once his retry is done, so production carries `#881`, `#880`, `#879` and `#882` from one staged SHA. |
| `orbit-api#882` (`#1664`) | Merged (`4050b5c6`), copy approved and posted. After its staging release, read one real generated pt-BR slip alert (Avisos or the notification row) for an avoid habit such as `Cheat diet`; it must name the positive goal without the raw English title. Then production with the row above. |
| `orbit-api#883` (`#1665`) | New, CI starting. Read the diff with DESIGN.md `## Buttons` and the consent Cancel path (first cancel redirects with `error=access_denied` and `state`, consumes the ticket, issues no code); approve its listed copy with `/second-opinion` (claimed copy defect framing) and post it; start `wait-ci.mjs`; merge at an approved head; release with the next staging API; render the page at phone and desktop width on staging through `claude-in-chrome`. |
| `ui#1993` (`#1620`), `ui#1903` (`#181`), `ui#1994` (`#1661`), `ui#1995` (`#1613`), `ui#1984` (`#577`) | CI was running on every head; start `wait-ci.mjs` for each, drive to merge at an approved head with every check green. The snapshot pin `ui#1997` merged, so `ui#1993`'s proactive criterion can now use API `ad8a3e39`'s parts (check whether its branch needs the new snapshot). Then release web: staging with `-f sha=`, then production (carries `ui#1988` and `#1661`); the production smoke must pass. `#579` follows `#577`. |
| Dependabot `ui#1992`, `ui#1991`, `ui#1990` | No `pullfrog-approval` check on any of them, so they are blocked. `@dependabot rebase` was asked on `ui#1992`; after its new CI, request a review with `list-bot-threads.mjs --re-review` if Pullfrog posts none, merge, then the next one. `ui#1990`'s Tool and Hook Tests red needs reading after its rebase. |
| `#1622` | Root cause on the ticket: Claude shows Google's favicon for `domain=useorbit.org`, which is the stale `http://useorbit.org` cache entry. Request indexing of `http://useorbit.org/` and `https://useorbit.org/` in Search Console (verify a `useorbit.org` domain property through a Cloudflare DNS TXT record if neither account has one), then re-read the lookup and both connectors after a reconnect. |
| `orbit-api#877` | Read `time-877b/summary.txt` in the scratchpad (setup 8 min 12 s measured; the testing phase of 62 mutants was running detached), then a `max` round on the dominant phase with a recorded relaunch reason. Then `orbit-api#876`. |
| `#1656` | No event on `1.3.92` for `ORBIT-MOBILE-9`, `-A`, `-B` yet; close after a longer quiet window. |
| Staging Postgres | Four days from its free-plan expiry (`expiresAt` through the Render MCP `list_postgres_instances`): recreate a free `orbit-staging` and reseed before it lapses, outside the owner's staging test window. |
| `#1641`, `#1624`, device acceptance lane, Batch 0c closures, `#1658`, `#1617`, `#1627`, `#1623`, `#1151`, `#1612`, `#1626`, `#213`, `#227` step 3, `#31`, `#32`, `#1560` build | Unchanged from the spec's Current state. `#1641`'s photo half still waits on the owner's Admin console tick. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends.
2. Owner MCP retry result, then staging API `4050b5c6`, the slip alert check and the production API release.
3. `orbit-api#883`: diff read, copy approval, merge, staging release and rendered check.
4. Drive the five UI PRs and the Dependabot PRs; release web.
5. `#1622` Search Console step; `orbit-api#877` round; staging Postgres renewal; `#1656` close.
6. Follow `## The order` for everything else, keeping the pool full under the load gate.
7. Run the full real-call Astra staging sweep only after the current Astra work is deployed.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane and any PostgreSQL proof container. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with every check green (not only the required ones) and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. Read every worker diff (`git show --remerge-diff` for a base merge) before pushing it: reject a fix that trades one defect for another. A Workspace Admin console change can be refused by the permission classifier: then it is the owner's click, recorded in `## Open questions`. Reading `DESIGN.md` and the canvas README in full costs a large share of the context budget: read them once, before the first UI diff, not at entry. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`, and keep the root checkout on the relay docs branch until the successor confirms.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried (helpers list updated).
- Answer the owner first: carried; no owner message arrived this relay. The owner was asked to retry the staging MCP connection.
- `orbit-api#881`: copy approved and posted, merged (`78dfea5b`), staging released and verified; owner retry and production carried.
- `orbit-api#882`: copy approved, pt-BR calque fixed (`65cd1ec3`), merged (`4050b5c6`); staging release, alert check and production carried.
- `ui#1984`: carry merge pushed (`81dd7aa9c`), thread `PRRT_kwDOR5Siws6vpdnF` resolved; merge carried.
- Four pushed UI PRs: CI still running at the relay; merge and web release carried.
- Dependabot PRs: no Pullfrog check found; `ui#1992` rebase asked; the rest carried.
- `#1641`: SES verified; photo and email check carried (owner tick pending).
- `#1656`: Sentry read, no `1.3.92` event; close carried.
- `orbit-api#877`: timing rerun started (`time-877b/`); `max` round carried.
- Staging Postgres: expiry read (four days); renewal carried.
- `#1622`: researched and root-caused on the ticket; Search Console step carried. `#1624`, `#1665` (now `orbit-api#883`), device lane and the remaining rows: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
