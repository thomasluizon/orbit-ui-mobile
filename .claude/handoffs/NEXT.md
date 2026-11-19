/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: the newest decision comments on the run record `#2179` hold the full in-flight queue (worktrees, heads, body and reply files, next commands) and decisions D767 to D772; the successor starts from D773. Each ticket's comments hold its round notes and reviews. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token. The worker account is at its weekly limit: workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` unset at launch). At most 3 workers at once, reviews included; drive open pull requests to the merge bar before a new ticket. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected. The Render MCP has no workspace selected: never pick one.

Launching under main's order seal (`ui#2488`): a fix round posts its note with `node tools/post-run-note.mjs --kind round-note --issue <ticket> --round <n> --head <full sha> --body-file <note>`, then `node tools/compose-prompt.mjs --review-batch` writes the sealed order, then `tools/launch-worker.mjs --fix-round <local|pullfrog>` (with `--design-change <file>` past the cap). Until `ui#2476` merges, a pre-push review is a read-only subagent on Sonnet that follows a written review order (D768).

Quality order (owner, the newest comment on `#2074`): speed WITH quality. Before every push, a review reads the whole diff, and every confirmed defect is BLOCKING (an unused export and a comment that contradicts the code included). A fix round fixes every instance of each class, each with a test proven red with its guard removed. The coordinator fixes a false body statement and a small review fix itself (test red first). A body over 60,000 characters is compressed before a push. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path or a redirect target, `while`, a glob in a `git` argument, `python3`, `sysctl`, `pgrep`; push only with `git push -u origin <branch>` from inside the worktree. Search with node scripts. Run eval tests from `evals/astra`. A worker cannot start a browser, a dev server or an emulator. One `wait-ci.mjs` per pull request; exit 3 is the ceiling, 4 a moved head, 6 settled failing.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `d7538f743`; API `main` and production `70c66e7be`; landing `main` `20c1b0a90`; web production `2263a8b67`. Owner question queue: empty. Board 38 open, 38 placed in `## The order`, 0 unplaced, 0 placed twice.

| Item | Disposition |
| --- | --- |
| ui#2505 (`#2152`) | The tool shard fix (`3d892fcf7`): Pullfrog left one P1 thread (`tools/__tests__/launch-worker.mjs:20`, D773): fix its class with a test red first, push, merge at the bar. Every UI head fails `Tool tests (4/4)` until it merges; then merge `main` into each row below before its push. |
| ui#2504 (`#2177`) | Round 5 worker running (design round: one source of truth for the failed delete). Read the worktree `ticket-2177-one-delete-toast`, review, push, merge at the bar. |
| ui#2480 (`#2135`) | Approved at `41290a1c8`, only the tool shard failed: merge `main`, push, merge at the bar; then the ui#2492 base merge and the `#2135` baseline window. |
| ui#2476 (`#2145`) | Approved at `fd6c355b3`, only the tool shard failed: merge `main`, push, merge at the bar. |
| ui#2493 (`#2170`) | Local `c773229d1` (merged-parent thread fix): merge `main`, write its reply and body section, push. |
| ui#2475 (`#2149`) | Local `8e6acb1ad` (s6y round plus review fix): compress its body under 60,000, correct the guard table row, push. |
| ui#2483 (`#2143`) | Round 3 `ef7dff2ef` reviewed NOTES 2: push after the shard fix. |
| ui#2498 (`#2173`) | Approves after live relay proofs A and B; needs the branch code in the orchestrating checkout at a real relay. |
| Next launches | landing#137 review, ui#2451 Pullfrog round (merge `main` first), the `#2074` quality build, ui#2453 and ui#2500 resumes. |
| Releases | After ui#2504 merges: one web release with ui#2499, ui#2503, ui#2504; then the Android Open and TestFlight pair (never the App Store); then the `#2146` web check. |
| Held | ui#2492, ui#2500, ui#2501 stacked on ui#2480; ui#2491, ui#2494 on api#1124; the api assistant PRs on the `#2135` gate; `#2156` after its `resolveAfter`; `#2176` after `#2122`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, 3 workers at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle: Sentry, mail, reviews, open pull requests and alerts, then the board, in the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the `#2152` migration steps 1 and 2 (run record `#2179`); ui#2504 r4 round, review CLEAN, pushed; ui#2480 s6g reviewed, fixed, pushed, approved; ui#2493 two Pullfrog threads fixed; ui#2476 main merge, reviewed, pushed, approved; ui#2475 s6y round and review fix; ui#2483 s6a and r3 rounds; intake clean.
- Carried: the ui#2498 proofs, the held rows, the `#2074` quality build, the releases, every standing order above.
- Superseded: the scratchpad loop tools of the previous prompt (the next session starts with an empty scratchpad; the launch flow above replaces them).

Treat every identifier here as a lead to verify.
