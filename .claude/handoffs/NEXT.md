/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 1 carries the landing: round 12 is pushed, its Figma frames need regenerating from the render; item 2 carries the Astra plan `#1474` to `#1485` with its start order, the CI trim `#1486`, the sweep findings `#1493` and `#1496`, `#1494`/`#1495` and the manifest totals harness fix `#1497`; item 3 starts with `#1413`), `### Batch R`, `### Batch 0b`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep. The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad` (helpers, orders, reports, the decision log `prev-sleep-decisions-*.md`; the newest relay's log is `sleep-decisions.md` with D227 to D235, `landing-r12/`, `figma-landing/`, `astra-plan/`, `landing-probe/` (now with `sections.mjs`, `run-r12.sh`, `shots-r12.sh`), `app-sweep/`). Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, then check that `grep -n "^SP=" *.sh` names the new scratchpad, and rename `sleep-decisions.md` to `prev-sleep-decisions-8ccd91ee.md` before opening your own log. Helpers: `qa.sh <delay> <workspace> <issue> <worktree name> <order> [launch args]` (gated launch in any repository, `--tier deep` passes through), `merge-gate.sh <key> <pr> [allowed red check]` (exact-head squash merge only on approval, zero threads, no pending and no unallowed red), `k12-merge.sh <pr>...` (merge-gate only when the head is a k12 head, parity red allowed), `rb-deliver.sh <key> <pr> <worktree> <report> <reply> <thread id> [--ui-scope]` and `extract-report.mjs <worker log> <out>` (review-fix delivery: body, thread, push), `threads.sh <key> <pr>...`, `api-verify.sh <api worktree> <label>`, `sonar-dup.sh <pr>` and `cpd-fix.sh <worktree> <file>...` (SonarCloud duplication: list pairs, then base-merge and exclude a web and Android mirror pair; real shared-code duplication goes to a worker), `compose-rb-branch.sh <issue> <worktree name> <branch> <round>`, `add-pr-any.mjs`, `note-verify-api.md`, `note-verify-cap.md`, `k12-run.sh`, `prove-1826.sh`. Shell cautions: redirect only to literal paths (the guardrail refuses `> $VAR/...`), write files with the Write tool, `ls` is aliased (use `/bin/ls`), never `git worktree remove --force`, never disable hooks, and every background launcher, waiter and check takes the Bash `timeout` 7200000.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`): 183 open, 183 placed, 0 unplaced, 0 placed twice. 20 redesign tickets remain (21 at the previous report). The run ends only when the spec is done or for an external cause.

## In flight

No worker or release watcher is running at handoff (the relay stops the CI waiters).

| item | disposition |
|---|---|
| Tickets of merged pull requests still open: `#1496` (`ui#1822`), `#1470` (`ui#1814`), `#1467` (`ui#1813`), `#1489` (`ui#1816`), `#1472` (`ui#1821`) | FIRST: close each through the `tools/*-ticket.mjs` tools with its merge commit as evidence |
| Landing round 12, `landing#102` `f880437` (pushed, probes green) | regenerate the two Figma frames "Landing 1440 · round 12" (node 28:2) and "Landing 390 · round 12" (node 29:2) in `aLwwyaY3Dtw1NVesAWsNO7` from the render, then tell the owner the build and the frames are ready; drive `landing#102` to the bar |
| `orbit-api#724` (`#1414`, to `main`, `a1122ad0` pushed) | wait on CI and a fresh review, merge at its approved head; then `#1415` to `#1420` in order |
| `orbit-api#731` `0265c574`, `orbit-api#732` `bd70ca7c`, `ui#1823` `9dcce447a`, `ui#1824` `f38ad7c43` (pushed, threads resolved) | wait on CI with `--require-check pullfrog-approval`, merge on the bar; after `ui#1824`, base-merge `ui#1826` (stacked) |
| `ui#1787` `c71acf594`, `ui#1809` `b749c1dff`, `ui#1825` (`#1497`) | merge `ui#1787`, then `ui#1825`; then base-merge with `node tools/surface-manifest.mjs` each of `ui#1812`, `1790`, `1789`, `1778`, `1773`, `1772`, `1757`, `1756` |
| `orbit-api#730` (`#1494`), `ui#1806` (`#1471`) | a fresh review was requested and none arrived in 25 minutes; merge each once a review of its head lands; `#730` unblocks `#1481` |
| `ui#1786` (SonarCloud red: 417 lines all in the web and Android `profile-api-keys.tsx` mirror pair), `ui#1810` (Guards red), `ui#1815` (base merge after `ui#1816`) | drive each to the bar per the spec's latest relay paragraph; `ui#1779` follows `ui#1786`, `ui#1807` and `ui#1801` follow `ui#1810` |
| Pushed earlier, waiting on CI and a fresh review | `ui#1819`, `ui#1780`, `ui#1782`, `ui#1820` |
| Other open pull requests | `ui#1818`, `ui#1817`, `ui#1805`, `ui#1804`, `ui#1794`, `ui#1791`, `ui#1781`, `ui#1775`, `ui#1764`, `ui#1761`: drive each to the bar; `ui#1773` also needs the throwaway AVD proof |
| No pull request yet | `#1483` (after `orbit-api#731`), `#1481` (after `orbit-api#730`), `#1485` (after `orbit-api#732`), `#1415` to `#1420` (after `#1414`), `#1491` |
| Release | production API serves `5526c9bc` (Healthy); staging web serves `ad173e8fd`; release staging again after the wave; production web, landing and Android stay unreleased until the owner asks |
| Uncommitted | `.claude/orchestrator.json` caps edit: keep, never stage or revert |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message.
2. Close the five tickets, then the landing Figma regeneration and the owner message.
3. Start CI waiters (at most three, `--ceiling-minutes 90`) and merge each pull request the moment it clears the bar, in the order above.
4. The Astra plan as blockers merge (`### Batch L` item 2), and Batch L item 3 (`#1414` onward).
5. When the wave and `#1474` have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`), push-notify and tell the owner.

## Sleep

This is an unattended run that the owner is watching. Take every decision with the best approach and log it in the session scratchpad the moment it is made. Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message (a pasted English prompt is English). Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (20 at the last report), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, and a large ticket, run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check, or at its approved head when it shares no file with the newer base; workers on CI-fix and review orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; a worker's NEEDS_DECISION is decided by the run on technical grounds and logged; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools; Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing dev server 4321); browser work through `claude-in-chrome`; Figma work through the Figma MCP after loading the figma-use and figma-generate-design skills; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` to staging; `orbit-api` redesign work reaches `main` through `#1413`, and the production API release after it merges is approved; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase, Figma and GitHub through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing or Android without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: every redesign ticket done at maximum capacity; the landing copies Pierre's page in Orbit's design with Astra the hero, Pierre's lean section structure and copy, and Orbit's own features after the opening; every landing round reaches his Figma file as soon as its plan exists; the same exact measured sweep on the Orbit staging app, and continue until he can run his whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after his retest; no CircleCI token rotation; Figma (not Pencil) is the editable design tool for the landing.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track).

## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried.
- Landing round 12 FIRST: done (diff read, agenda overlap fixed as a review fix, build tests repaired, probes green at 320 to 1920 in both locales, side-by-side sheets, pushed `f880437` with evidence and the copy verdict); the Figma regeneration and the owner message carried.
- Push the four review fixes: done (bodies, threads resolved, pushed).
- k12 heads: `ui#1814`, `ui#1813`, `ui#1816`, `ui#1821`, `ui#1822` merged; `ui#1786`, `ui#1806`, `ui#1810` carried.
- `ui#1787` before `ui#1825`, then the eight manifest base merges: carried.
- `orbit-api#723` to `main`, the production API release, then base-merge `orbit-api#724`: done (`5526c9bc`, run 39069702267 Healthy, `a1122ad0` pushed).
- `orbit-api#730`: carried (no review of its head yet).
- Pushed earlier, other open pull requests, the AVD proof, no-pull-request tickets, release, uncommitted caps edit, session chain: carried.
- Then-in-order steps 1 to 5: carried, with the ticket closures and Figma added to step 2.

Every identifier here came from a previous session: treat each as a lead to verify.
