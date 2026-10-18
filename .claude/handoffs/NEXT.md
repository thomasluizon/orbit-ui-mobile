/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rules: the side cards float like Pierre's, nothing else moves on its own, each landing round reaches the Figma file before its staging release; the staging landing API rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 0 the CI fix, item 1 the landing, item 2 `#1500`, the Astra plan, the sweep findings, the harness items, item 3 the flag wave), `### Batch R`, `### Batch 0b`, `### Batch 6`, `### Batch 0c`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first UI diff read or sweep (or send each UI diff to the `design-reviewer` agent). The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, check that `grep -n "^SP=" *.sh` names the new scratchpad, and open your own `sleep-decisions.md` (the carry renames the old one to `prev-sleep-decisions-a1360ea1.md`, D472 to D495). Files written after the carry (the `k16` layout result, the landing round 18 probe results) are in the predecessor's scratchpad under the system temp folder (`.../a1360ea1-cf22-4375-aa48-4c7c6d0640e2/scratchpad/`): read `check-k16/summary.txt` and `landing-probe/*-r18.json` there if the carry lacks them. Run `carry-out.sh` after every few decisions. Helpers (scratchpad): the previous set plus `conflict-scan.sh <pr>...` (merge-tree fold of heads before a combined check), `heads-of.sh`, `mc-main.sh <label> <head>...` (combined check on ui `main`), `rv.sh`, `threads.sh`, `fetch-threads-any.sh <repo> <pr>...` (full thread bodies), `waitlist-evidence.sh`. Shell cautions: a redirect target must be a literal path, the Bash tool runs zsh, `ls` is aliased (use `/bin/ls`), `timeout` is not installed, never `git worktree remove --force`, never disable hooks, every launcher, waiter and check runs as a Bash background task with `timeout` 7200000 (never a trailing `&`), copy every thread id from `gh` output. After each merge, fast-forward the orchestrating checkout (`git merge --ff-only origin/redesign/main`). If `create-worktree.mjs` says the Orca runtime is missing, `open -a Orca`; if `claude-in-chrome` reports no browser, `open -a "Google Chrome"`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). What is left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`): 155 open, 155 placed, 0 unplaced, 1 placed twice (`#556`, the recurring sync ticket; leave it). 17 redesign tickets are open by `gh issue list --repo thomasluizon/orbit-tickets --state open --milestone "539 Redesign"` (11) plus `#1404`, `#1408`, `#1409`, `#1411`, `#1423`, `#1500`; every one has a pull request. The run ends only when the spec is done or for an external cause.

## In flight

No worker or release watcher is running. A local combined check may still be running: `mc-k16` (layout project last).

| item | disposition |
|---|---|
| Landing round 18 (`landing#102`, local `1b4726e`, not pushed) | owner priority: read the r18 probe results; a fail is round 19 (`order-1459-r18.md` is the pattern); on a pass push, answer both threads (see the spec's Batch L item 1), write the round 18 Figma frames, release the staging landing from the branch, tell the owner in pt-BR |
| `k16` heads `ui#1773 1757 1778 1782 1809 1819` | on a layout pass, merge each at its approved head with `merge-gate.sh`; `ui#1812` then gets a base merge plus a complexity round for `apps/mobile/components/chat/conversation.tsx:89` |
| `ui#1779 1781 1786 1789` | base-merge after the `k16` merges (regenerate `feature-parity.json`; `ui#1789`'s test file conflict needs a worker); then combined check and merge on approval |
| `ui#1791`, `ui#1794` (`17a73f2f6` unpushed) | base-merge after the `k16` merges (habit form conflicts), push `ui#1794` with its thread `PRRT_kwDOR5Siws6ttJym` answered |
| `ui#1824`, `ui#1830`, `ui#1826` | rounds from the spec's diagnosis after the `k16` merges; `#1483` starts when `ui#1824` merges |
| `ui#1772`, `ui#1831`, `orbit-api#744`, `orbit-api#746` | pushed; merge on the bar (api merges with `api-mc.sh` on `main` when behind with overlap) |
| `ui#1833`, `ui#1844` | layout reruns queued; merge on the bar; `ui#1844` (`#556` carry) must merge before Orbit Staging 1.3.82; `RENDER_WEB_REDESIGN_SERVICE_ID` is still absent |
| `ui#1761` | CI was running at the last read; merge on the bar |
| `ui#1847` (`#1527`), `ui#1848` (`#1418` main half) | read both diffs; `ui#1847` needs its staging proof before merge (spec); `#1418`'s `redesign/main` half follows its merge |
| `orbit-api#752` (`#1528`) | blocked by the OpenAPI gate: send the deprecate-first round described in the spec, never an ignore file |
| `#1419` | launch `order-1419.md` (worktree `ticket-1419-android-design-bundle`, `--tier deep`) |
| Tickets to file | the Terraform `api_database` selector and the `MinSupportedVersion` raise to 1.3.38 (spec Current state) |
| `#746` carry, `#1520` part 2 | backport the `#1519` result to `main` (`#1520` part 2); carry api `main` into `redesign/main` through `#746` |
| Uncommitted | `.claude/orchestrator.json` caps edit in the orchestrating checkout: keep, never stage or revert |
| Branches, stashes, detached heads | no stashes; detached heads are scratch build trees (`base`, `mc-*`, `land-*`), safe to prune; `ticket-1242-week-grid-one-scroller` and `ticket-1503-push-endpoint-check` each hold one superseded unpushed commit (leave) |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message (English; landing news in pt-BR).
2. Landing round 18 to staging and Figma (above).
3. Merge what clears the bar; base-merge and round the rest in the order above.
4. Batch 6: `orbit-api#744`, `#746`, `#752`, `ui#1847`.
5. `ui#1844` (`#556`) merged.
6. The Astra plan as blockers merge (`#1483` after `ui#1824`), Batch L item 3 (`#1418` second half, `#1419`).
7. When the wave, `#1474` (`ui#1809`) and the `#556` carry have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`, `#1500`, `#1512`, `#1525`), push-notify and tell the owner.
8. Idle Codex capacity: one audit pass after a large merge wave.

## Sleep

This is an unattended run that the owner is watching, and the owner's order is to rush: everything done, then the product launch. Take every decision with the best approach and log it in the session scratchpad the moment it is made, with the real clock time (`log.sh`). Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (17 by the query at this relay), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, a large ticket and a landing round run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check (read its layout result before merging), or at its approved head when it shares no file with the newer base, and that holds for api merges too; scan heads with `conflict-scan.sh` before a combined check; workers on CI-fix, review, base-merge and landing round orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; read every worker pull request's diff yourself or through a read-only subagent before it merges, and turn a verified defect into a round; a worker's NEEDS_DECISION is decided by the run on technical grounds, written into the order and relaunched; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools, and a duplicate search covers every ticket (`gh issue list --state all --limit 2000`); Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing preview 4401, an `astro dev` server holds 4321), port 5000 belongs to macOS ControlCenter (a local API runs on 5199); browser work through `claude-in-chrome` in the open window only; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits; idle capacity runs `audit-run.sh` passes, each finding verified by a skeptic before it is filed.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` (and the landing round branch) to staging; `orbit-api` flag-wave work reaches `main`; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase, Figma and GitHub (including branch protection check names) through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing, API or Android without asking, apply `#1417`'s or `#1507`'s Terraform to production without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing (stop queued gated launches that have not passed the gate), drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: rush everything, the goal is launch, go faster; fix the GitHub Actions clog (`#1519` to `#1523`), deleting what does not earn its run; every redesign ticket done at maximum capacity; the landing follows the owner's reviews, is simple, has nothing repeated and one sentence per slot, has no pause or play button, its side cards float with a real animation like Pierre's, its hero side columns stay inside the container, its feature compositions stay compact, and the Figma file gets each round's render; the owner's habit row is the new habit standard in the app too; the same exact measured sweep on the Orbit staging app, and continue until the owner can run the whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after the retest; no CircleCI token rotation.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track). Owner yes needed later, not now: `orbit-api#750`'s production IAM policy and the `#738` production JWT configuration, both before the production API release that carries them.

## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried (owner adds: the side cards float like Pierre's, side columns inside the container, compact compositions, Figma gets each round).
- Answer the owner first: carried.
- Merge `ui#1773 1779 1781 1786 1789 1819` once `k15` passes: superseded (`k15` was invalid); `1773` and `1819` are in `k16`, the other four need base merges.
- `ui#1757 1778 1782 1791 1794 1809 1812 1820` merge on approval: `ui#1820` done (`55f40a20d`); `1757 1778 1782 1809 1812` in `k16`; `1791` and `1794` carried behind base merges.
- `ui#1772` base merge: done (`7777718a9`, pushed with its thread fix).
- `ui#1761` merge on the bar: carried.
- `ui#1844` merge with `#1525` carried: carried (layout rerun queued).
- `ui#1843` merge: done (`60fe0f41c`).
- Reds on `ui#1824 1830 1831 1833 1826`: diagnosed; `ui#1831` round pushed, `ui#1833` rerun, the other three carried as rounds.
- `orbit-api#744 746 749 750`: `#749` and `#750` done; `#744` and `#746` pushed, carried.
- `orbit-api#738` after `ui#1843`: done (`ade7016c3`).
- `#1527`, `#1528`: done as `ui#1847` and `orbit-api#752`; both carried to merge.
- `landing#102` containment probe and staging release: superseded by round 18 (owner findings); carried as round 18's probe, push, Figma and release.
- `#746` carry, `#1520` part 2, the 1.3.82 steps, idle audits: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
