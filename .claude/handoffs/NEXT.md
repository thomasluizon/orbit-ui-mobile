/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting live defects: answer each message first, in his language, and give each order a ticket before the turn ends. His standing instructions: research before experimenting, never iterate guesses against a live service when a source can answer; build his orders in full or not at all (no cheaper stand-in, rescope the existing ticket instead of filing a second one); never mention rotating an API key that showed in a log.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`, after adding every live session's 8-character id to its `SKIP_SESS` line; if that frees too little, `docker builder prune -af` and `npm cache clean --force` are rebuildable caches. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (about 18,700 entries, so run it as a background task) BEFORE writing any file into the new scratchpad: the restore skips names that already exist. Read `prev-sleep-decisions-7fea4039.md` (D1 to D23 of the previous session), then `prev-sleep-decisions-9914c736.md` and `prev-sleep-decisions-e368d001.md`. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above the `## Blocked, needs owner decision` heading. Redirects in Bash use literal paths (a variable in a redirect target is refused by the guardrail hook; write a script or a file with the Write tool, then run it); the shell is zsh. Ticket writes go through `node tools/create-ticket.mjs`, `node tools/comment-ticket.mjs` and `node tools/complete-ticket.mjs`, never raw `gh issue`; read tickets with `--json title,body,comments`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit, Gmail); never Chrome for those, except to see what Gmail renders (the Gmail MCP is the work mailbox; the owner's Orbit mail is in his personal Gmail in Chrome). The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0`. Production SQL reads go through the carried read-only `prod-sql.sh`; on `SSL connection has been closed unexpectedly`, compare `curl -sS https://api.ipify.org` with the `operator mac` allowlist entry and repoint it with `render-allowlist-set.mjs dpg-dasotg8473hc739a5gpg-a "operator mac" <ip>/32`. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]`; `new-worktrees.sh <repo dir> <issue>:<branch>`; `launch-review-round.sh <repo> <issue> <worktree> <base> <tier> <round> <note> <relaunch reason>`; `body-merge.sh <ui|api|landing> <pr> <worker log> [--ui-scope]` (writes `pr-<pr>-body-new.md`; apply it with `gh pr edit --body-file`); `answer-push.sh <repo> <pr> <worktree> <thread id>...` (reads `reply-<thread>.md`); `prstat.sh <repo name> <pr>...`; `joblog.sh <repo name> <job id> <out name>`; `mc-detached-main.sh <label> <full sha>...`; `wait-done-prev.sh <label>` (points at the `86ee91b6` scratchpad); `state-remaining.mjs --drop "#N" --add "#N"`; `prefetch-closure.sh <ticket>...`; `board-map.sh`; `reconcile-order.py`; `render-export.mjs`, `wait-new-export.sh`, `prod-sql.sh`. Research orders run through `node tools/launch-worker.mjs --research --order <file> --out <file>` inside `gated-launch.sh`; `order-research-closure-a.md` is the template, and `closure-input/` already holds `#1638`, `#1629`, `#1630`, `#1645`, `#1635`, `#753`. Thread ids come only from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --wait-seconds 0 --no-request`. Before any push, run `git merge-tree --write-tree --name-only origin/main HEAD` in the worktree. Copy every full SHA from `gh api .../pulls/<n> --jq .head.sha`; never complete one by hand. Redact any finished worker log with secret-shaped `NAME=value` pairs before quoting it. Play Open availability has no local API credential; read it on Play Console Open testing (developer `4913102794253829646`, app `4976229514306926604`, `/tracks/open-testing`) through `claude-in-chrome` (one tab, close it after).

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 77, placed 77, unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `cb47241e`, API `main` is `ad8a3e39`, landing `main` is `0d5e3df4`. Production web `175eb7a8`, staging web `cb47241e`; production API `b0bfe642`, staging API `9f303bcf`; production landing `0d5e3df4`. Android Open `1.3.92` (`151`, from `bee66beb`) is "Em análise" in Play; `1.3.91` (`150`) is available.

| Item | Disposition |
| --- | --- |
| `#1660` consent submit | FIRST. Staging Google sign-in passes, but POST `/oauth/consent` answers "Esta solicitação de autorização é inválida ou expirou" in the same minute (owner, ticket comment). Read staging API logs (Render MCP) for that POST, find why the pending consent is missing (never written, consumed twice by GET and POST, or lost across instances), route a red-first `orbit-api` round (`deep`), release staging with `-f sha=`, tell the owner to retry, then release production API (it also carries `#1662` and `#1641`'s code). |
| `#1664` slip alert | Launch next (`orbit-api`, `deep`): production logs first for model versus `GenerateFallback`, then model-written title and body in the person's language. |
| `ui#1994` (`#1661`) | CI was pending at `405bd332`. Merge at an approved head with every check green, then release web: staging with `-f sha=`, then production (also carries `ui#1988`); the production smoke must pass. |
| `ui#1993` (`#1620`) | Round `013f2d50` is local in `ticket-1620-lean-astra-answers`, not pushed. Read its diff and report (worker log in the launcher output), write `reply-<thread>.md` for `PRRT_kwDOR5Siws6vrhj1` and `PRRT_kwDOR5Siws6vrhj-`, then `answer-push.sh`. Root runs the hermetic layout proof for `astra-block-spacing.spec.ts`. After `#1662` reaches staging, rebaseline the shared API snapshot for the proactive criterion. |
| `ui#1984` (`#577`) | Base merge `6ed7e23c` (parents `465c41a1`, `2d572034`) local, not pushed. Read `git show --remerge-diff`, merge-tree with `origin/main`, push once, resolve `PRRT_kwDOR5Siws6vpdnF`. `#579` follows. |
| `ui#1903` (`#181`) | Base merge `268fe989` local, not pushed. Same steps. |
| `ui#1995` (`#1613`), `ui#1996` (`#1663`) | New; start `wait-ci.mjs`, drive to merge. `ui#1995`'s copy verdict is posted. |
| `#1641` | `orbit-api#879` merged: run the targeted Terraform apply for the new SES identity, its DKIM CNAMEs, MAIL FROM MX and SPF, the IAM send policies and the staging env group (no untargeted apply). After the owner's Admin console tick, set the Orbit icon on `contact@useorbit.org` with audience Anyone (Chrome, `/u/1/`), send a staging sign-in email to two Gmail recipients, compare web and app, then switch production `Ses__FromEmail`. |
| `orbit-api#877` | Local timing `time-877/summary.txt` (durable scratchpad): `ManageAccountTool.cs` 51 mutants in about 8 minutes at concurrency 4; the `CreateHabitTool` `0..10500` run was still running detached. Read it, then a `max` round on the measured cost driver with a recorded relaunch reason. Then `orbit-api#876`. |
| Android `1.3.92` | Read Play Console Open testing until available; then tell the owner his friend can update and put the widget back; close `#1656` when Sentry `ORBIT-MOBILE-9`, `-A`, `-B` stay quiet on `1.3.92`. |
| `#1622`, `#1624`, `#1665` | Owner reports: Claude connector list and Google's sign-in screen show the old planet, the consent page design. Research the icon source Claude reads before changing anything; replace the Google Auth Platform app logo in the Console. |
| `ui#1932` | `@dependabot recreate` asked; merge on green plus a fresh approval. |
| Device acceptance lane, Batch 0c closures, `#1658`, `#1617`, `#1627`, `#1623`, `#1151`, `#1612`, `#1626`, `#213`, `#227` step 3, `#31`, `#32`, `#1560` build | Unchanged from the spec's Current state; `#1560` builds after iOS per the order. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends.
2. `#1660` consent fix, staging retry, production API.
3. Launch `#1664`; keep the pool full under the load gate.
4. Push the three local rounds (`#1620`, `#577`, `#181`), drive `ui#1994`, `ui#1995`, `ui#1996`, then release web.
5. `#1641` Terraform apply and photo; Android `1.3.92` availability; `orbit-api#877` round.
6. Follow `## The order` for everything else.
7. Run the full real-call Astra staging sweep only after the current Astra work is deployed.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane and any PostgreSQL proof container. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with every check green (not only the required ones) and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. Read every worker diff (`git show --remerge-diff` for a base merge) before pushing it: reject a fix that trades one defect for another. A Workspace Admin console change can be refused by the permission classifier: then it is the owner's click, recorded in `## Open questions`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`, and keep the root checkout on the relay docs branch until the successor confirms.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried (decision log pointer moved).
- Answer the owner first: done for every message this relay (desktop purchases, slip alert, Astra test prompts, Admin sign-in, sign-in logo, consent page, connector icon).
- Android `1.3.92`: record step root-caused and filed as `#1663` (`ui#1996`); availability still "Em análise", carried.
- `#1660`: merged and on staging; consent submit fails, carried first.
- `#1560` research: done (Tauri 2, ADR D148, plan in the body; owner purchase rules recorded).
- `#1661`: root-caused (first-paint FAB plus a racy adapter), delivered `ui#1994`, carried.
- `ui#1988`: merged as `cb47241e`; production web release carried with `ui#1994`.
- `ui#1993`: round finished locally, push carried. `ui#1984`, `ui#1903`: base merges finished locally, pushes carried. `#1613`: published as `ui#1995`.
- `orbit-api#877`: timing measured for one file, round carried. Dependabot `ui#1932`: recreate asked, carried.
- `#1641`: Google account route researched and its Terraform merged; owner Admin tick and apply carried. `#1662`: merged as `orbit-api#880`, release carried.

Every identifier here came from a previous session: treat each as a lead to verify.
