/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 1 carries the landing, whose round 13 is done and waits on his findings; item 2 carries `#1500`, the Astra plan, the sweep findings and the harness items; item 3 carries the flag wave with `#1499` and `#1501`), `### Batch R`, `### Batch 0b`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep. The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, check that `grep -n "^SP=" *.sh` names the new scratchpad, and open your own `sleep-decisions.md` (the carry renames the old one to `prev-sleep-decisions-392ff46b.md`, D283 to D301). Helpers, all in the scratchpad: `qa.sh <delay> <workspace> <issue> <worktree name> <order> [launch args]` (gated launch; `REASON=` sets the relaunch reason; pass `--tier deep` for large tickets and review rounds), `merge-gate.sh <key> <pr> [allowed red check]`, `triage-conflicts.sh <pr>...`, `bm-docs.sh <worktree name>` (base merge resolving `surfaces.json`, `sonar-project.properties` as a union with comments, and docs where our side only added lines), `resolve-words.mjs <path>` (word-level three-way merge inside a running merge), `resolve-sonar-union.mjs`, `bm-sonar.sh`, `bm-wave-k14.sh`, `compose-bm-wave.sh <round> <pr:issue:worktree>...` then `qa.sh` (product-conflict base merges), `bm-deliver.sh <pr> <worktree name> <order label>`, `mc-prep.sh <label> <head>...` and `mc-check.sh <worktree> <label>` (combined check), `layout-only.sh <worktree> <label>` (only the layout project on an existing build), `prep-ticket.sh`, `rs-add.mjs`, `reconcile.mjs`, the landing probes `landing-probe/run-r13.sh <label>`, `overflow13.mjs`, `minw13.mjs` (widest min-content descendants), `serve.sh`, and `figma-landing/extract13.cjs`, `gen.cjs`, `combine13.cjs`. Shell cautions: redirect only to literal paths (the guardrail refuses `> $VAR/...`, here-strings and heredocs into a variable path; write such scripts with the Write tool), the Bash tool runs zsh (an unquoted variable does not word-split; loop in a bash script file), `ls` is aliased (use `/bin/ls`), never `git worktree remove --force`, never disable hooks, every background launcher, waiter and check takes the Bash `timeout` 7200000, and never start a launcher with a trailing `&`. After each merge, fast-forward the orchestrating checkout (`git merge --ff-only origin/redesign/main`).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`): 167 open, 167 placed, 0 unplaced, 0 placed twice. 15 of the 18 redesign tickets counted at the previous report remain (`#1431`, `#1444`, `#1493` closed). The run ends only when the spec is done or for an external cause.

## In flight

No worker is running at handoff. The relay stops this session's CI waiters (they watched `ui#1832` `1833` `1830` `1831` `1827`; `ui#1786` `1819` `1820` `1804` `1775` `1817` `1794` `1807` `1801` `1818` `1805` `1761`; `ui#1791` `1829` `1809` `1782` `1790` `1778` `1773` `1789` `1812` `1824` `1756` `1779` `1764`).

| item | disposition |
|---|---|
| `orbit-api#735` (`#1417`, head `b44730e2`) | pushed: SonarCloud fixes plus a `main` base merge carrying the regenerated `openapi_v2.json` (`main`'s Build red until it merges); start a waiter, merge on the bar (`orbit-api` `main` is authorized); then launch `#1418` |
| `ui#1827` (`#1415`, `main`) | launch its review round first: order `order-1415-rb1.md` (P2 thread `PRRT_kwDOR5Siws6tlk7e`, offline config restore, plus the web Unit Tests mock red); the relay drain refused its launch; after merge launch `#1419` |
| `ui#1829` (`#1499`, `main`, `719ab576b`) | pushed, thread resolved; wait on CI and a fresh review, merge on the bar |
| `ui#1832` (`#1501`) | wait on CI and review; before merge, prove live on staging that Render passes `X-Forwarded-Host` through (after the merge releases staging web: request an app route on the staging Render host with the header; 200 means pass-through) |
| `ui#1833` (`#1500`) | wait on CI and review; prove its layout case red on the base build and green on the head before merge |
| Base merges pushed this relay | `ui#1809`, `1782`, `1790`, `1778`, `1773`, `1789`, `1812`, `1824`, `1756`, `1779`, `1764`, `1757`, `1772`: each merges at its approved head once CI is green and a fresh review approves; then `ui#1826` takes a base merge (product conflict in `chat-thread-scroll-core`), then launch `#1483` |
| `ui#1791` (`#1450`, `be6331ff3`) | pushed with its round report; CI and a fresh review, then merge |
| Older pushed base merges | `ui#1786`, `1819`, `1820`, `1804`, `1775`, `1817`, `1794`, `1807`, `1801`, `1818`, `1805`, `1761`: merge each at its approved head under D115 |
| `ui#1830` (`#1481`), `ui#1831` (`#1485`) | wait on CI and review, merge on the bar |
| `ui#1781` (`#1429`) | approved and green, behind the base: next combined check |
| `landing#102` (`#1459`, `15d4777`) | round 13 done, on staging and in Figma (`58:2`, `58:3`), owner told; waits on his findings (round 14); never merge to landing `main` |
| Release | staging API serves `5d9ff03e` (current `orbit-api` `redesign/main`); staging web serves `ad173e8fd`, release after the next merges; staging landing serves `15d4777`; production web, landing and Android stay unreleased until the owner asks |
| Uncommitted | `.claude/orchestrator.json` caps edit: keep, never stage or revert |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message (his latest was English).
2. Start CI waiters (at most three, `--ceiling-minutes 90`), launch the `ui#1827` round, and merge each pull request the moment it clears the bar, in the order above.
3. The Astra plan as blockers merge (`### Batch L` item 2: `#1483` after `ui#1824`), Batch L item 3 (`#1418` after `#1417` merges, `#1419` after `#1415` merges).
4. Landing: on owner findings, plan round 14 per `### Batch L` item 1; Figma MCP calls refuse until the Starter limit resets (see `## Open questions`).
5. When the wave and `#1474` have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`, `#1500`), push-notify and tell the owner.

## Sleep

This is an unattended run that the owner is watching. Take every decision with the best approach and log it in the session scratchpad the moment it is made. Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (15 at the last report), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, and a large ticket, run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check (read its layout result before merging), or at its approved head when it shares no file with the newer base; workers on CI-fix, review and base-merge orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; a worker's NEEDS_DECISION is decided by the run on technical grounds, written into the order and relaunched; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools; Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing preview 4401, an `astro dev` server holds 4321); browser work through `claude-in-chrome` in the open window only (creating a tab group opens a new window, so skip a visual check that needs one and say so); Figma work through the Figma MCP after loading the figma-use and figma-generate-design skills; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` (and the landing round branch) to staging; `orbit-api` flag-wave work reaches `main`; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase, Figma and GitHub through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing or Android without asking, apply `#1417`'s Terraform to production without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: every redesign ticket done at maximum capacity; the landing is simple, follows his own Figma frame and comments, has nothing repeated and one sentence per slot, and every landing round reaches his Figma file; his habit row is the new habit standard in the app too; the same exact measured sweep on the Orbit staging app, and continue until he can run his whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after his retest; no CircleCI token rotation; Figma (not Pencil) is the editable design tool for the landing.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track); Figma MCP capacity (a paid seat or the monthly reset; blocks only the next landing round's frames).

## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried.
- Landing round 13 (overflow fix, probes 30 of 30, diff read, push, copy verdicts, Figma frames, staging release, tell the owner): done (`landing#102` `15d4777`, run 39084223844, frames `58:2` and `58:3`, push notification sent; the pixel compare could not run, Figma limit).
- `ui#1791` and `ui#1829` pushes: done (`be6331ff3`, `719ab576b`, thread resolved); their CI and review carried.
- `ui#1833`, `ui#1832`: carried.
- Combined check k13: done (2,142 of 2,142; `ui#1823`, `ui#1825`, `ui#1787` merged); `ui#1809`, `ui#1782` and the manifest changers: base-merged and pushed (`ui#1780` closed as superseded); `ui#1824` pushed, `ui#1826` carried.
- `ui#1781`: carried; `ui#1779`, `ui#1764`: base-merged and pushed.
- Older pushed base merges and new pull requests: carried; `orbit-api#733`, `#734` merged; `orbit-api#735` pushed with fixes (carried); `ui#1827` review round carried.
- Flag wave `#1418`, `#1419`: carried.
- Release: staging API verified at `5d9ff03e`; staging landing done; staging web and the 1.3.82 build carried.
- Then-in-order steps 1 to 5: carried (landing step done).

Every identifier here came from a previous session: treat each as a lead to verify.
