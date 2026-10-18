/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 1 carries landing round 13 from the owner's own Figma edits; item 2 carries `#1500`, the Astra plan, the sweep findings and the harness items; item 3 carries the flag wave with `#1498`, `#1499` and `#1501`), `### Batch R`, `### Batch 0b`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep. The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, check that `grep -n "^SP=" *.sh` names the new scratchpad, and open your own `sleep-decisions.md` (the carry renames the old one to `prev-sleep-decisions-59f0346f.md`, D269 to D282). Helpers, all in the scratchpad: `qa.sh <delay> <workspace> <issue> <worktree name> <order> [launch args]` (gated launch; `REASON=` sets the relaunch reason; pass `--tier deep` for large tickets and review rounds), `prep-ticket.sh <key> <issue> <slug> <base> [comment]`, `merge-gate.sh <key> <pr> [allowed red check]`, `overlap.sh <pr>...`, `triage-conflicts.sh <pr>...`, `mc-prep.sh <label> <head>...` and `mc-check.sh <worktree> <label>` (combined check), `base-merge-rows.sh <worktree name>`, `resolve-union.mjs <file> <base copy>` (keeps both sides of added registry rows and sections), `bm-deliver.sh`, `api-mc.sh`, `rs-add.mjs <ref>...` (adds tickets to the run queue), the landing probes `landing-probe/run-r13.sh <label>` (hit-test, hit-area, clearance, rows), `landing-probe/rows13.mjs`, `overflow13.mjs`, `inspect13.mjs`, `run-shots13.sh`, `serve.sh <command>` (serves the landing build on 4401), and `figma-landing/extract.cjs` and `gen.cjs`. Shell cautions: redirect only to literal paths (the guardrail refuses `> $VAR/...`, process substitution and heredocs into a variable path; write such scripts with the Write tool), `ls` is aliased (use `/bin/ls`), never `git worktree remove --force`, never disable hooks, every background launcher, waiter and check takes the Bash `timeout` 7200000, and never start a launcher with a trailing `&`. After each merge, fast-forward the orchestrating checkout (`git merge --ff-only origin/redesign/main`).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`): 173 open, 173 placed, 0 unplaced, 0 placed twice (`#1501` placed in Batch L item 3; `#1420` closed by `ui#1828`). 18 redesign tickets remain (18 at the previous report). The run ends only when the spec is done or for an external cause.

## In flight

No worker is running at handoff. The relay stops this session's three CI waiters (they watched `ui#1820` `1819` `1804` `1801` `1807` `1786` `1775` `1823` `1817` `1794`; `ui#1830` `1831` `1827` `1818` `1805` `1761`; `orbit-api#733` `734` `735`).

| item | disposition |
|---|---|
| Landing round 13 (`#1459`, `landing#102`, worktree `ticket-1459-pierre-landing`, local `0535cdd`, 2 commits ahead, not pushed) | FIRST: fix the pt-BR 320 closing overflow (the closing block is 312 wide; find the min-content source with `overflow13.mjs` and a computed-width read, fix it, add a source assertion), rebuild, rerun `run-r13.sh` until 30 of 30, read the whole diff of `97e4237` for gate edits or relaxed limits, push, post the copy verdicts (scratchpad `landing-r13/copy-claim-*.txt` and verdicts) on `landing#102`, regenerate the Figma frames "Landing 1440 · round 13" and "Landing 390 · round 13" from the render (load the figma-use and figma-generate-design skills first), release the staging landing from that branch, verify `orbit-build`, then tell the owner the build and frames are ready |
| `ui#1833` (`#1500`, habit row standard) | wait on CI and review; prove its layout case red on the base build and green on the head before merge |
| `ui#1832` (`#1501`) | wait on CI and review; before merge, prove live on staging that Render passes `X-Forwarded-Host` through (after the merge releases staging web: request an app route on the staging Render host with the header; 200 means pass-through) |
| `ui#1791` (`#1450`, worktree `ticket-1450-manual-schedule-choices`, `be6331ff3` unpushed) | read the diff (gate edits, `tools/feature-parity-rules.json`), carry the report into the body, push, then CI and a fresh review |
| `ui#1829` (`#1499`, worktree `ticket-1499-redesign-release`, `719ab576b` unpushed) | read the diff, answer and resolve thread `PRRT_kwDOR5Siws6tlGrh` with the commit and the `#1501` decision, push, then CI and review; merges to `main` |
| Combined check k13 (`mc-k13`, `ui#1787` + `ui#1825` + `ui#1823`) | read `check-k13/summary.txt`; on a pass merge the three at their approved heads (merge `ui#1787`, then `ui#1825`); then base-merge `ui#1809` and `ui#1782` keeping every `sonar-project.properties` exclusion, then the manifest changers (`ui#1812`, `1790`, `1789`, `1778`, `1773`, `1772`, `1757`, `1756`) with `node tools/surface-manifest.mjs`; `ui#1824` then `ui#1826` (stacked, product conflict in `chat-thread-scroll-core`), then launch `#1483` |
| Approved and green, behind the base | `ui#1781`, `ui#1780`: next combined check; `ui#1779` and `ui#1764`: base merge for a fresh run (stale Upgrade layout and parity reds) |
| Pushed base merges waiting on CI and a fresh review | `ui#1786`, `1819`, `1820`, `1804`, `1775`, `1817`, `1794`, `1807`, `1801`, `1818`, `1805`, `1761`: merge each at its approved head under D115 |
| New pull requests | `ui#1827` (`#1415`), `ui#1830` (`#1481`), `ui#1831` (`#1485`), `orbit-api#733` (`#1416`), `#734` (`#1498`), `#735` (`#1417`): wait on CI and review, merge on the bar |
| Flag wave still unlaunched | `#1418` (after `#1417` merges), `#1419` (after `#1415` merges) |
| Release | staging API release run 39079508004 (`redesign/main` `5d9ff03e`) was still queued: verify `/health` or redispatch; staging web serves `ad173e8fd`, release after the next merges; staging landing serves `31566a8` until round 13 ships; production web, landing and Android stay unreleased until the owner asks |
| Uncommitted | `.claude/orchestrator.json` caps edit: keep, never stage or revert |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message (his latest was English).
2. Landing round 13 to the owner (row one above), then the `ui#1791` and `ui#1829` pushes.
3. Start CI waiters (at most three, `--ceiling-minutes 90`) and merge each pull request the moment it clears the bar, in the order above.
4. The Astra plan as blockers merge (`### Batch L` item 2: `#1483` after `ui#1824`), Batch L item 3 (`#1418`, `#1419` as their blockers merge).
5. When the wave and `#1474` have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`, `#1500`), push-notify and tell the owner.

## Sleep

This is an unattended run that the owner is watching. Take every decision with the best approach and log it in the session scratchpad the moment it is made. Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (18 at the last report), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, and a large ticket, run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check, or at its approved head when it shares no file with the newer base; workers on CI-fix, review and base-merge orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; a worker's NEEDS_DECISION is decided by the run on technical grounds, written into the order and relaunched; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools; Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing preview 4401); browser work through `claude-in-chrome`; Figma work through the Figma MCP after loading the figma-use and figma-generate-design skills; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` (and the landing round branch) to staging; `orbit-api` flag-wave work reaches `main`; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase, Figma and GitHub through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing or Android without asking, apply `#1417`'s Terraform to production without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: every redesign ticket done at maximum capacity; the landing is simple, follows his own Figma frame and comments, has nothing repeated and one sentence per slot, and every landing round reaches his Figma file; his habit row is the new habit standard in the app too; the same exact measured sweep on the Orbit staging app, and continue until he can run his whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after his retest; no CircleCI token rotation; Figma (not Pencil) is the editable design tool for the landing.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track).

## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried.
- Landing round 13 first: in progress (built `97e4237`, review fix `0535cdd`, one pt-BR 320 overflow left; carried as row one).
- `#1500` launch: done (`ui#1833`); its red and green proof carried.
- `ui#1791` round: done as a commit (`be6331ff3`); its push carried.
- Pushed base merges and older CI waits: carried; `ui#1787`, `ui#1825`, `ui#1823` on combined check k13 (carried).
- New pull requests: `ui#1828` merged into `main` (`c448aec64`, `#1420` closed); the rest carried; `ui#1829` got a review round (`719ab576b`) and the new `#1501` (`ui#1832`).
- Other open pull requests (`ui#1781`, `1780`, `1779`, `1764`, `landing#102`): carried with dispositions above.
- Flag wave `#1418`, `#1419`: carried.
- Release: the staging API release was dispatched (run 39079508004, queued); carried.
- Then-in-order steps 1 to 5: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
