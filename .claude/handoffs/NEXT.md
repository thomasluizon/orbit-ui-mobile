/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 39be95a1-b20c-480f-bbd2-ee23c2318a3b` as a background task before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`. Repoint any helper whose `SP=` still names an old session. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D11). Helpers: `gl.sh` (gated launch), `prep-any.sh` (worktree plus order), `append-note.sh`, `co-rb.sh`, `relay-cost.py`. Detach a local check with `nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' <script> &` (macOS has no `setsid`).

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `b913fa08b`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`.

| Item | Disposition |
| --- | --- |
| `ui#2395` (`#2085`) | Review fix `448f84bb6` (soft 350000, hard 400000, the owner's numbers) is committed and NOT pushed in `ticket-2085-relay-quiet-point`. Its suites run detached through `check-2085-tools.sh`, which writes `check-2085-tools.done.json` in the predecessor scratchpad it names: start `node tools/wait-file.mjs --file <that path> --started-at <ISO in check-2085-tools.started> --what "ui#2395 test-tools and test-hooks"`. On exit 0: push, replace 330000 and 390000 with 350000 and 400000 in the PR body, wait on CI, request the review, merge on approval. |
| `ui#2392` (`#2081`) | Head `f8581cfa2` pushed, threads resolved. Wait on CI, request the review, merge on approval. |
| `ui#2389` (`#2077`) | Head `4686f7094` (main merged, settled-stack specs). Wait on CI, request the review, merge on approval, then production web and Android Open with `#2062` and `#2061`. |
| `ui#2393` (`#2083`), `ui#2394` (`#2087`), `ui#2396` (`#2086`) | Worker PRs, diffs read and accepted. Wait on CI, request the review, merge on approval. |
| `ui#2391` (`#1560`) | Head `b6ed095d1`. Wait on CI, request the review, merge on approval, then the spec's follow-up. |
| `ui#2388` | This relay's docs PR. Request the review after green CI and merge. |
| `#2084`, `#2082` | Worktrees and orders exist; launches were refused by the relay drain. Launch both with `gl.sh`. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2396`, `#2395`, `#2394`, `#2393`, `#2392`, `#2391`, `#2389`, `#2388`; api none; landing none. Unpushed: `feature/ticket-2085-relay-quiet-point` (1 commit, `448f84bb6`). Stashes: 0 in all three repositories. Uncommitted work: none. Running workers: none. Detached checks: `check-2085-tools.sh`.

## Then, in this order

1. Answer any owner message first, in his language.
2. One `tools/wait-ci.mjs` over the open pull requests, then a `--require-check pullfrog-approval` waiter over the requested reviews; rerun 504-only failures.
3. The in-flight rows above.
4. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`.
5. Then the rest of `## The order`, and the auto-work intake cycle when idle (Sentry is due one hour after the last listing in `intake.wake`).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2392` review batch pushed with threads resolved; `ui#2389` CI-fix worker delivered and pushed; `#2085`, `#2086`, `#2083`, `#2087` workers delivered PRs; the owner's Windows icon order ticketed as `#2087`; the owner's relay question answered with a transcript measurement (comment on `#2085`), and the owner set 350000.
- Carried: every merge and review request, `#2084` and `#2082` launches, the Android Open and production web, `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "launch the composed CI-fix order for `ui#2389`" (delivered as `4686f7094`).

Every identifier here came from a previous session: treat each as a lead to verify.
