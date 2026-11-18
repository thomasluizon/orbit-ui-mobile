/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D599 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. The first block of S `task-map.md` holds each worktree, head and exact next command, and wins over this prompt.

Account: the session and the workers run on the worker account until the owner switches back. Every worker tier runs `claude-sonnet-5-5` (owner order): first confirm all four tiers in `.claude/orchestrator.json` say `claude-sonnet-5-5`; never move a worker tier to Fable or Opus unless the owner orders it in chat. A worker that stops at a usage limit is reported to the owner at once and never changes a model. Pullfrog works on a worker account token. Sentry is connected; Gmail, Orbit and Chrome are not. The Render MCP has no workspace selected: never pick one.

Owner orders (in the spec): run tooling (Batch T and Batch 0b) is the priority; under crank never hold ready work for an ordering preference; `/progress` reports only merged and built-not-merged work in product terms, no numbers. A post the owner shares is a reference: adapt the part he names to Orbit, never review the author's whole method.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). Only a regression of the pull request or a failed acceptance probe starts a fix round. One fix round only. The coordinator corrects a false statement in a body file before the push (`node S/fix-text.mjs <spec.json>`). Workers run focused tests only. A pull request body stays under 60,000 characters.

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused, and so is `git -C $VAR` in a command that also commits: write literal paths. zsh does not split a variable: use `${=p}`. A raw `gh api` write on a ticket is refused: use the ticket tools. Use `git -C`, never `cd`. A failed `@pullfrog review` request counts as the head's request: post a new `@pullfrog review` comment by hand when no Pullfrog run starts.

Standing: reviews and proofs run as workers. The loop for one pull request: `launch-review-round.sh`, `round-result.mjs`, `review-after-round.sh` (a first pass uses `whole - -`), `review-verdict.mjs <task> <key>`, `merge-main.mjs`, `push-round.mjs <key> <pr> <absolute worktree> <body | ->`, then `tools/wait-ci.mjs --require-check pullfrog-approval` in the background; `pr-bar.mjs`, and merge at once at the bar. Stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 42, placed 42, unplaced 0, placed twice 0.

## In flight

UI `main` `e8fa116f9`; API `main` `f7abe19fc`; landing `main` `20c1b0a90`. Owner question queue: empty. No stash. No worker runs. The relay checkout holds `origin/main` plus the tier and spec commits.

| Item | Disposition |
| --- | --- |
| Pushed with review asked: ui#2464 `584d8c005`, ui#2493 `ea0c61c6e`, ui#2496 `2512a3744`, ui#2475 `c167e4aa8`, ui#2476 `d13edf985`, ui#2488 `27374fc1f` | Start one `wait-ci.mjs --require-check pullfrog-approval` per repository over these; merge each at the bar; a Pullfrog thread gets one round. |
| api#1127 `778a8480f`: green, approved | Stacked on api#1125 on api#1120: merge in that order after api#1120's gate, retarget each to `main`. |
| ui#2486 round 4 (`fe5431a7c`, review NOTES 1) | Add the space at `tools/lib/run-state.mjs:356` (`= (`), commit; body line 11: "so only a commit spends the round of a launched worker"; file the note on `#2074`; `push-round.mjs`. Then merge that branch into ui#2488. |
| ui#2485 round 4 `471792288` (CLEAN) | `merge-main.mjs`, `push-round.mjs ui 2485 ... body-2485-r4.md`. |
| ui#2494 whole review NOTES 4 | File on `#2165`, push only if behind. |
| Reviews to relaunch on Sonnet (S task-map has each command): 2483-r9, 1121-r4, 2489-main1, 2490-r2, 2491-r2, 2492-r2, 1126-r2b | Launch each at once, then push on CLEAN or NOTES. |
| ui#2451: round 28 `b848d747a` reviewed (NOTES 1), conflicts with `main` | Launch the base merge (`note-2451-main.md`, round label main28), then push with body-2451-r28.md. |
| ui#2495 round 2 and ui#2480 round 5: fixes uncommitted in the tree (the limit stopped each) | Relaunch each round with its note (note-2495-r2.md, note-2480-r5.md); the worker keeps the tree. |
| ui#2453 (`#2122`), `#2146`, `#2172`, `#2173`, `#2167`, `#2168`, `#2174`, landing#137 | As the spec's `## The order` says (critic pass 2 and push; the device proof; the two builds; close `#2174` as not planned with a ticket tool). |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then reviews and relaunches, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board, in the spec's `## The order`.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; api#1127 pushed and approved; ui#2464, ui#2475, ui#2476, ui#2493, ui#2496, ui#2488 pushed; the whole reviews of ui#2493, ui#2494, ui#2495, ui#2496; the owner's two orders (brain note, founder X header).
- Superseded: "Every `claude` tier is `claude-fable-5-2`" (owner order: Sonnet on every tier).
- Carried: every other In flight row and every standing order above.

Treat every identifier here as a lead to verify.
