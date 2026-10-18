/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 0 is the CI fix `#1519` to `#1523`, first; item 1 carries the landing, whose round 14 is on the staging landing and waits on the owner's review; item 2 carries `#1500`, the Astra plan, the sweep findings and the harness items; item 3 carries the flag wave), `### Batch R`, `### Batch 0b`, `### Batch 6` (the security tickets plus `#1508`, `#1509`, `#1515`), `### Batch 0c`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first UI diff read or sweep. The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, check that `grep -n "^SP=" *.sh` names the new scratchpad, and open your own `sleep-decisions.md` (the carry renames the old one to `prev-sleep-decisions-e633f2bd.md`, D361 to D378). Helpers, all in the scratchpad: `bar-all.sh <pr>...`, `fail-log.sh <pr>`, `check-reds.sh <pr>...`, `dup-allowed.sh <key> <pr>` (cancelled checks that have a green twin; pass its output to `merge-gate.sh`), `round-order.sh <issue> <worktree> <label> <round file> <base>`, `prep-ticket.sh <key> <issue> <slug> <base>`, `qa.sh <delay> <workspace> <issue> <worktree name> <order> [launch args]` (`REASON=` sets the relaunch reason; `--tier deep` for large tickets and review rounds), `body-merge.sh <repo> <pr> <report>`, `merge-gate.sh <key> <pr> [allowed red check]...`, `audit-run.sh <name> <effort>`, `landing-probe/live-shots.mjs`, plus the helpers the spec names. Shell cautions: redirect only to literal paths (the guardrail refuses a redirect target holding a variable), the Bash tool runs zsh (`$var:t` is a modifier, write `${var}:...`), `ls` is aliased (use `/bin/ls`), never `git worktree remove --force`, never disable hooks, every background launcher, waiter and check takes the Bash `timeout` 7200000, and never start a launcher with a trailing `&`. After each merge, fast-forward the orchestrating checkout (`git merge --ff-only origin/redesign/main`).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`, plus `#1523` placed by hand in Batch L item 0): 179 open, 179 placed, 0 unplaced, 1 placed twice (`#556`, the recurring sync ticket, listed in two batches; leave it). 21 redesign tickets are open (13 in the `539 Redesign` milestone plus `#1402`, `#1404`, `#1408`, `#1409`, `#1411`, `#1422`, `#1423`, `#1500`). The run ends only when the spec is done or for an external cause.

## In flight

No worker, release watcher or subagent is running. Two CI waiters may still be live (they end at their 90 minute ceiling); the relay tool stops this session's waiters.

| item | disposition |
|---|---|
| `ui#1841` (`#1519`, `redesign/main`) | pushed `8f3d7e0e5` (journal round); wait on CI and a review, read its first full run, fill the After minutes column, merge on the bar; then the `#1520` second round on `ui#1839` (backport the result to `main`), and apply the required check changes its body lists |
| `ui#1839` (`#1520` part 1, `main`), `orbit-api#737` (`#1521`, `main`), `landing#106` (`#1522`, `main`), `landing#105` (`#1523`, `redesign/main`) | diffs read and accepted; wait on CI and review, merge on the bar, then change the required check names on `main` exactly as each body's Manual steps says and read the protection back |
| `ui#1840` (`#1518`, `main`) | diff read and accepted; wait on CI and review, merge on the bar |
| `ui#1827` (`#1415`), `ui#1834` (`#1510`), `ui#1835` (`#1516`), `ui#1836` (`#1517`), `ui#1837` (`#1511`) | `main`; wait on CI and review (`ui#1827`'s body dashes fixed), merge on the bar; after `ui#1827`: `#1419` (deep) and `#1418` |
| `ui#1794` (`#1436`) | pushed `c178707db` (coverage round); wait on CI and a fresh review |
| `ui#1824`, `ui#1820` | red only on `action-rows.spec.ts:120`; base-merge both after `ui#1791` merges. After `ui#1824`: `ui#1826` (base merge, 4 threads) and `#1483` |
| `ui#1781`, `ui#1778`, `ui#1809` | green; fresh reviews requested; merge on the bar |
| approved or waiting `redesign/main` pull requests `ui#1838` `1833` `1831` `1830` `1819` `1817` `1812` `1791` `1790` `1789` `1786` `1782` `1779` `1775` `1773` `1772` `1764` `1761` `1757` `1756` | merge each at its approved head once green and reviewed at that head (`dup-allowed.sh` for cancelled twins); base-merge only on a conflict or a needed base fix. `ui#1772`: its two changed layout specs are proven by its own Layout Guard run at the head |
| `landing#102` (`#1459`, round 14 `f13c509`) | on the staging landing; waits on the owner's review |
| `orbit-api` `main` `7472203c` | production release waits on the owner's yes (Open questions); carry api `main` into `redesign/main` through `#746` once `orbit-api#737` merges |
| Batch 6 security tickets, `#1508`, `#1509`, `#1515` | launch when the Actions queue drains |
| Uncommitted | `.claude/orchestrator.json` caps edit: keep, never stage or revert |
| Branches, stashes, detached heads | no stashes; `mc-*` detached scratch worktrees are safe to prune; ticket worktrees for `#1519`, `#1520`, `#1521`, `#1522`, `#1523`, `#1518`, `#1436` hold only pushed commits |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message (English).
2. Start at most three CI waiters (`--ceiling-minutes 90`): the CI fix pull requests first, then the approved redesign set, then the `main` set; merge in the order above.
3. The Astra plan as blockers merge (`#1483` after `ui#1824`), Batch L item 3 (`#1418`, `#1419` after `ui#1827`).
4. When the Actions queue drains: the Batch 6 tickets.
5. When the wave and `#1474` (`ui#1809`) have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`, `#1500`, `#1512`), push-notify and tell the owner.
6. Idle Codex capacity: audit passes are done; rerun one only after a large merge wave.

## Sleep

This is an unattended run that the owner is watching. Take every decision with the best approach and log it in the session scratchpad the moment it is made, with the real clock time from `date`. Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (21 at this relay), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, and a large ticket, run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check (read its layout result before merging), or at its approved head when it shares no file with the newer base; workers on CI-fix, review, base-merge and landing round orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; a worker's NEEDS_DECISION is decided by the run on technical grounds, written into the order and relaunched; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools, and a duplicate search covers every ticket (`gh issue list --state all --limit 2000`); Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing preview 4401, an `astro dev` server holds 4321); browser work through `claude-in-chrome` in the open window only; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits; idle capacity runs `audit-run.sh` passes, each finding verified by a skeptic before it is filed.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` (and the landing round branch) to staging; `orbit-api` flag-wave work reaches `main`; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub (including branch protection check names) through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing, API or Android without asking, apply `#1417`'s or `#1507`'s Terraform to production without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: fix the GitHub Actions clog on the three repositories now (`#1519` to `#1523`), deleting what does not earn its run and approving the plan with `/second-opinion`; every redesign ticket done at maximum capacity; the landing follows his round 13 review (round 14), is simple, has nothing repeated and one sentence per slot, and Figma is no longer used for it; his habit row is the new habit standard in the app too; the same exact measured sweep on the Orbit staging app, and continue until he can run his whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after his retest; no CircleCI token rotation.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): the production API release of `orbit-api` `main` `7472203c` (carries `#1514`, the free-account `403` on every habit edit; ask at the next owner handoff); THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track).

## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule, owner instructions and open owner questions: carried (the production API release question is new).
- Launch the CI fix `#1519` to `#1522`: done (`ui#1841`, `ui#1839`, `orbit-api#737`, `landing#106`); `#1522`'s NEEDS_DECISION split the `redesign/main` allowlist part into `#1523` (`landing#105`).
- Re-attach the landing release watcher and send the owner the staging landing link: done (run `39095405753` green, page serves `f13c509`, link and screenshots sent).
- `ui#1832` live proof, merge: done (`5deebe26b`, `#1501` closed). `orbit-api#736`: merged (`7472203c`). `ui#1805`, `ui#1804`: merged.
- Launch `#1518`: done (`ui#1840`).
- `ui#1772` proof, `ui#1827` then `#1419` and `#1418`, `ui#1826` and `#1483`, the remaining merges, Batch 6, the 1.3.82 steps: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
