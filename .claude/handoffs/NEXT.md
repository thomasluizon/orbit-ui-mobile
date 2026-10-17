/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 1 now carries landing round 13 from the owner's own Figma edits; item 2 carries `#1500`, the Astra plan, the sweep findings and the harness items; item 3 carries the flag wave with `#1498` and `#1499`), `### Batch R`, `### Batch 0b`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep. The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, check that `grep -n "^SP=" *.sh` names the new scratchpad, and open your own `sleep-decisions.md` (the carry renames the old one to `prev-sleep-decisions-2023403c.md`, D236 to D268). Helpers, all in the scratchpad: `qa.sh <delay> <workspace> <issue> <worktree name> <order> [launch args]` (gated launch; `REASON=` sets the relaunch reason), `prep-ticket.sh <key> <issue> <slug> <base> [comment]` (worktree through `tools/create-worktree.mjs`, composed order with the verification note), `merge-gate.sh <key> <pr> [allowed red check]`, `overlap.sh <pr>...`, `triage-conflicts.sh <pr>...`, `compose-bm-wave.sh <round> <pr:issue:worktree>...`, `bm-deliver.sh <pr> <worktree name> <order label>` (base-merge worker delivery: gate-file list, report into the body, push), `base-merge-rows.sh <worktree name>` (CLAUDE.md and DESIGN.md phrase merges), `cpd-fix.sh`, `api-mc.sh <label> <base> <head>...` (orbit-api combined check), `add-pr-any.mjs`, `extract-report.mjs`, `landing-probe/run-chart.sh`, `run-r12.sh`, `chart-targets.mjs`, `figma-landing/extract.cjs` and `gen.cjs`, `ticket-relations.mjs`. Shell cautions: redirect only to literal paths (the guardrail refuses `> $VAR/...` and heredoc appends after a variable assignment; put such commands in a script file), `ls` is aliased (use `/bin/ls`), never `git worktree remove --force`, never disable hooks, every background launcher, waiter and check takes the Bash `timeout` 7200000, and never start a launcher with a trailing `&`. After each merge, fast-forward the orchestrating checkout (`git merge --ff-only origin/redesign/main`), because the tools refuse a stale `.claude/orchestrator.json`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`): 173 open, 173 placed, 0 unplaced, 0 placed twice. 18 redesign tickets remain (20 at the previous report). The run ends only when the spec is done or for an external cause.

## In flight

No worker is running at handoff. The relay stops the three CI waiters (they watched `ui#1825` `1787` `1809` `1782` `1823` `1824`, `ui#1786` `1819` `1820` `1804` `1775` `1817` `1794` `1828`, and `orbit-api#733`).

| item | disposition |
|---|---|
| Landing round 13 (`#1459`, `landing#102`, branch `feature/ticket-1459-pierre-landing`) | FIRST: compose the round 13 order from `#1459`'s latest comment (the owner's edited frame "Landing 1440" `3:2`, section `8:61`, his ten comments and the run's thirteen decisions; scratchpad `landing-r13/`), launch it on the `deep` tier in the `ticket-1459-pierre-landing` worktree, read its diff, prove it with the landing probes, push it, regenerate its two Figma frames from the render ("Landing 1440 · round 13", "Landing 390 · round 13"), release it to the staging landing from that branch, then tell the owner the build and the frames are ready |
| `#1500` (the owner's habit row standard in the app) | launch with round 13: `prep-ticket.sh ui 1500 habit-row-standard redesign/main`, `deep` tier; prove its layout case red on the base and green on the head before merge |
| `ui#1791` (`#1450`) | next review round: add the six capability mappings from the scratchpad `1450-proposed-parity-mappings.json` to `tools/feature-parity-rules.json` and make Astra-proposed schedule values read as proposed; then CI and review |
| Pushed base merges waiting on CI and a fresh review | `ui#1786`, `1819`, `1820`, `1804`, `1775`, `1817`, `1794`, `1807`, `1801`, `1818`, `1805`, `1761`: drive each to the bar, merge at its approved head under D115 (combined check when it shares files with the newer base) |
| Waiting on CI from before | `ui#1825` (`#1497`), `ui#1787`, `ui#1809`, `ui#1782`, `ui#1823`, `ui#1824`: merge `ui#1787` then `ui#1825`; then base-merge with `node tools/surface-manifest.mjs` each of `ui#1812`, `1790`, `1789`, `1778`, `1773`, `1772`, `1757`, `1756`; after `ui#1824`, base-merge `ui#1826` (stacked) and launch `#1483` |
| New pull requests | `ui#1827` (`#1415`), `ui#1828` (`#1420`), `ui#1829` (`#1499`), `ui#1830` (`#1481`), `ui#1831` (`#1485`), `orbit-api#733` (`#1416`), `#734` (`#1498`), `#735` (`#1417`, apply-time steps in its body): wait on CI and review, merge on the bar |
| Other open pull requests | `ui#1781`, `ui#1780`, `ui#1779`, `ui#1764`, `landing#102`: drive each to the bar; `ui#1773` also needs the throwaway AVD proof |
| Flag wave still unlaunched | `#1418` (after `#1417` merges), `#1419` (after `#1415` merges) |
| Release | staging API serves `36fff557` (Healthy); release it again after `orbit-api#732`'s merge (`5d9ff03e`) and the next API merges; staging web serves `ad173e8fd`; staging landing serves `landing#102` at `31566a8`; production web, landing and Android stay unreleased until the owner asks |
| Uncommitted | `.claude/orchestrator.json` caps edit: keep, never stage or revert |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message (his latest was English).
2. Round 13 and `#1500` launches, then the `ui#1791` round.
3. Start CI waiters (at most three, `--ceiling-minutes 90`) and merge each pull request the moment it clears the bar, in the order above.
4. The Astra plan as blockers merge (`### Batch L` item 2: `#1483` after `ui#1824`), Batch L item 3 (`#1418`, `#1419` as their blockers merge).
5. When the wave and `#1474` have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`, `#1500`), push-notify and tell the owner.

## Sleep

This is an unattended run that the owner is watching. Take every decision with the best approach and log it in the session scratchpad the moment it is made. Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (18 at the last report), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, and a large ticket, run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check, or at its approved head when it shares no file with the newer base; workers on CI-fix, review and base-merge orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; a worker's NEEDS_DECISION is decided by the run on technical grounds, written into the order and relaunched; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools; Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing dev server 4321); browser work through `claude-in-chrome`; Figma work through the Figma MCP after loading the figma-use and figma-generate-design skills; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` (and the landing round branch) to staging; `orbit-api` flag-wave work reaches `main`; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase, Figma and GitHub through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing or Android without asking, apply `#1417`'s Terraform to production without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: every redesign ticket done at maximum capacity; the landing is simple, follows his own Figma frame and comments, has nothing repeated and one sentence per slot, and every landing round reaches his Figma file; his habit row is the new habit standard in the app too; the same exact measured sweep on the Orbit staging app, and continue until he can run his whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after his retest; no CircleCI token rotation; Figma (not Pencil) is the editable design tool for the landing.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track).

## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried (landing instruction updated by his round 12 rejection; habit standard added).
- Close the five tickets of merged pull requests: done (`#1496`, `#1470`, `#1467`, `#1489`, `#1472`, each with its merge commit).
- Landing round 12 Figma regeneration and the owner message: done (`34:2`, `34:3`; staging landing released twice, `31566a8` with the chart fix); the owner then rejected round 12, superseded by round 13.
- `orbit-api#724`: done (merged `1b886bdf`); `#1415` to `#1420`: `#1415`, `#1416`, `#1417`, `#1420` have pull requests, `#1418` and `#1419` carried.
- `orbit-api#731`, `#732`, `#730`: done (merged); `ui#1823`, `ui#1824`: carried (CI); `ui#1826`: carried.
- `ui#1787`, `ui#1825`, eight manifest base merges: carried.
- `ui#1786`, `ui#1810`, `ui#1815`: `ui#1810` merged, `ui#1815` closed as superseded, `ui#1786` pushed (carried).
- Pushed earlier and other open pull requests: base merges pushed (carried as listed); `ui#1806` merged.
- No-pull-request tickets: `#1481` (`ui#1830`), `#1485` (`ui#1831`) done; `#1483` carried; `#1491` carried in the spec order.
- Release: staging API released (`36fff557`); the rest carried.
- Then-in-order steps 1 to 5: carried, with round 13 and `#1500` first.

Every identifier here came from a previous session: treat each as a lead to verify.
