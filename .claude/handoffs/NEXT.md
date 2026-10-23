/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting live defects: answer each message first, in his language, and give each order a ticket before the turn ends. His standing instructions: research before experimenting, never iterate guesses against a live service when a source can answer; build his orders in full or not at all (no cheaper stand-in, rescope the existing ticket instead of filing a second one); never mention rotating an API key that showed in a log.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`, after adding every live session's 8-character id to its `SKIP_SESS` line; if that frees too little, clear rebuildable download caches (`docker builder prune -af`, `npm cache clean --force`, the Homebrew download cache, `pip cache purge`); the Docker images and volumes belong to other projects, leave them. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (about 18,700 entries, so run it as a background task) BEFORE writing any file into the new scratchpad: the restore skips names that already exist. Read the previous session's carried `prev-sleep-decisions-*.md` (D1 to D12) first. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above the `## Blocked, needs owner decision` heading. Redirects in Bash use literal paths (a variable or a process substitution in a redirect target is refused by the guardrail hook; write a script or a file with the Write tool, then run it); the shell is zsh. Ticket writes go through `node tools/create-ticket.mjs`, `node tools/comment-ticket.mjs` and `node tools/complete-ticket.mjs`, never raw `gh issue`; read tickets with `--json title,body,comments`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit, Gmail); never Chrome for those, except to see what Gmail renders. The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0`; its Postgres query tool cannot reach the databases, so production SQL reads go through the carried read-only `prod-sql.sh` and staging reads through `staging-sql.sh`; on `SSL connection has been closed unexpectedly`, compare `curl -sS https://api.ipify.org` with the `operator mac` allowlist entry and repoint it with `render-allowlist-set.mjs <dpg id> "operator mac" <ip>/32`. Carried helpers: `launch-new-ticket.sh`, `new-worktrees.sh`, `launch-review-round.sh`, `body-merge.sh`, `answer-push.sh`, `prstat.sh`, `overlap.sh <worktree>` (merge-tree and shared files with main), `joblog.sh`, `tf-plan.sh`, `tf-apply-targeted.sh` (Terraform needs `-var=production_redesign_web_digest=<production_web_digest from local.tfvars>`), `pg-1660b-proof.sh` (PostgreSQL proof template), `state-remaining.mjs`, `reconcile-order.py`, `render-export.mjs`, `prod-sql.sh`. Thread ids come only from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --wait-seconds 0 --no-request`. Before any push, run `git merge-tree --write-tree --name-only origin/main HEAD` in the worktree. Copy every full SHA from `gh api .../pulls/<n> --jq .head.sha`. Redact any finished worker log with secret-shaped `NAME=value` pairs before quoting it. Play Open availability is read on Play Console Open testing (developer `4913102794253829646`, app `4976229514306926604`, `/tracks/open-testing`) through `claude-in-chrome` (one tab, close it after).

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 76, placed 76, unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `b239d9c3`, API `main` is `ad8a3e39`, landing `main` is `0d5e3df4`. Production web `175eb7a8`, staging web `cb47241e`; production API `b0bfe642`, staging API `9f303bcf`; production landing `0d5e3df4`. Android Open `1.3.92` (`151`) is available. No worker is running at this handoff.

| Item | Disposition |
| --- | --- |
| `orbit-api#881` (`#1660`) | FIRST. CI and review were pending at `e9e79218`; the PostgreSQL proof is on the ticket. Approve the copy "Access allowed / Return to Claude or your MCP client to continue." and "Acesso permitido / Volte para o Claude ou seu cliente MCP para continuar." with `/second-opinion` (framed as a claimed copy defect) and post it on the PR, merge at an approved head, then release staging API with `-f sha=` (it also carries `#1662`, `#1641`'s code and the SES From change, so confirm `aws sesv2 get-email-identity --email-identity useorbit.org --region us-east-2` shows it verified first), tell the owner to retry with Google and the email code, then production API. |
| `orbit-api#882` (`#1664`) | New at `9864ab25`; start `wait-ci.mjs`, read the diff, approve its listed copy with `/second-opinion`, merge, release with `#881`, check one real staging alert, then production. |
| `ui#1984` (`#577`) | Carry merge `81dd7aa9c` is local in `ticket-577-headless-overlays` (worker log `#577-69621-*.log` in the launcher temp directory). Read `git show --remerge-diff`, run `overlap.sh`, merge the report into the body, push once with `answer-push.sh ... PRRT_kwDOR5Siws6vpdnF` (reply that `465c41a19` keeps lazy content dismissible). `#579` follows. |
| `ui#1993` (`#1620`), `ui#1903` (`#181`), `ui#1994` (`#1661`), `ui#1995` (`#1613`) | Pushed this relay; start `wait-ci.mjs` for each, drive to merge at an approved head with every check green. Then release web: staging with `-f sha=`, then production (carries `ui#1988` and `#1661`); the production smoke must pass. After `#1662` reaches staging, rebaseline the shared API snapshot for `#1620`'s proactive criterion. |
| Dependabot `ui#1990`, `ui#1991`, `ui#1992` | Lockfile only; one at a time: `@dependabot rebase`, then a re-review request if Pullfrog posts none, merge. |
| `#1641` | Terraform applied. After SES verifies and the owner's Admin console tick, set the Orbit icon on `contact@useorbit.org` with audience Anyone (Chrome, `/u/1/`), send a staging sign-in email to two Gmail recipients, compare web and app, then switch production `Ses__FromEmail`. |
| `#1656` | Close when Sentry `ORBIT-MOBILE-9`, `-A`, `-B` show no event on `1.3.92`. |
| `orbit-api#877` | Read the `CreateHabitTool` run in the predecessor scratchpad's `time-877/` (or rerun it), then a `max` round on the measured cost driver (2,567 compile-error mutants plus slow per-mutant tests) with a recorded relaunch reason. Then `orbit-api#876`. |
| Staging Postgres | Near its free-plan expiry (`expiresAt` through the Render MCP `list_postgres_instances`): recreate a free `orbit-staging` and reseed before it lapses. |
| `#1622`, `#1624`, `#1665` | Research the icon source Claude reads before changing anything; replace the Google Auth Platform app logo; `#1665` redesigns the consent page after `#881` merges (same file). |
| Device acceptance lane, Batch 0c closures, `#1658`, `#1617`, `#1627`, `#1623`, `#1151`, `#1612`, `#1626`, `#213`, `#227` step 3, `#31`, `#32`, `#1560` build | Unchanged from the spec's Current state. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends.
2. `orbit-api#881` and `#882`: copy approval, merge, staging release, owner retry, production API.
3. Push `#577`; drive the four pushed UI PRs; release web.
4. `#1641` photo and email check; `#1656` close; `orbit-api#877` round; staging Postgres renewal.
5. Follow `## The order` for everything else, keeping the pool full under the load gate.
6. Run the full real-call Astra staging sweep only after the current Astra work is deployed.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane and any PostgreSQL proof container. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with every check green (not only the required ones) and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. Read every worker diff (`git show --remerge-diff` for a base merge) before pushing it: reject a fix that trades one defect for another. A Workspace Admin console change can be refused by the permission classifier: then it is the owner's click, recorded in `## Open questions`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`, and keep the root checkout on the relay docs branch until the successor confirms.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried (cache cleanup and SQL helpers updated).
- Answer the owner first: carried; no owner message arrived this relay.
- `#1660` consent submit: root-caused (a repeat request for a spent ticket; the connection works), delivered `orbit-api#881` with a PostgreSQL proof; merge, staging retry and production carried.
- `#1664`: root-caused (model output under a keep-the-title prompt), delivered `orbit-api#882`; carried.
- `ui#1994`: CI reds fixed by round `714f5a502`, pushed; merge and web release carried.
- `ui#1993`: round pushed with both threads resolved; merge carried. `ui#1903`: base merge pushed; merge carried. `ui#1984`: needed a second carry for `#1988`; merge `81dd7aa9c` local, push carried.
- `ui#1995`: review round `59b091f9a` pushed, thread resolved; merge carried. `ui#1996`: merged (`b845e19f`), `#1663` closed.
- `#1641` Terraform: applied (7 added, 3 changed); photo, email check and production switch carried.
- Android `1.3.92`: available; owner told; `#1656` Sentry check carried.
- `orbit-api#877`: timing run still measuring; `max` round carried. `ui#1932`: merged (`b239d9c3`).
- `#1622`, `#1624`, `#1665`, device lane and the remaining rows: carried unchanged.

Every identifier here came from a previous session: treat each as a lead to verify.
