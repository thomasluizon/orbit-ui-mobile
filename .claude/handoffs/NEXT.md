/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 1 carries the landing and the owner's round 12 content order; item 2 carries the Astra plan `#1474` to `#1485` with its start order, Layout Guard `#1356`, the CI trim `#1486`, the sweep findings `#1493` and `#1496`, `#1494`/`#1495` and the manifest totals harness fix `#1497`; item 3 starts with `#1413`), `### Batch R`, `### Batch 0b`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep. The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad` (helpers, orders, reports, the decision log `prev-sleep-decisions-*.md` with D183 to D215 in the newest, `figma-landing/`, `astra-plan/`, `landing-probe/`, `app-sweep/`). Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, then check that `grep -n "^SP=" *.sh` names the new scratchpad. Helpers added this relay: `qa.sh <delay> <workspace> <issue> <worktree name> <order>` (gated launch in any repository), `add-pr-any.mjs <repo key> <pr> <issue> <worktree name> <branch>`, `compose-rb-branch.sh <issue> <worktree name> <branch> <round>` (review order for any branch prefix), `note-verify-api.md` (the verification note for `orbit-api` orders; `note-verify-cap.md` is ui only), `k12-run.sh` (combined check pattern with a parity step; run the parity step after `npm ci`), `prove-1826.sh` (layout red and green proof pattern for a stacked head). Shell cautions: redirect only to literal paths, write files with the Write tool, `ls` is aliased (use `/bin/ls`), never `git worktree remove --force`, never disable hooks (no `core.hooksPath` override), and every background launcher, waiter and check takes the Bash `timeout` 7200000.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation: 184 open, 184 placed, 0 unplaced, 0 placed twice (scratchpad `reconcile.mjs`). 21 redesign tickets remain (24 at the previous report). The run ends only when the spec is done or for an external cause.

## In flight

No worker or subagent is running at handoff. The relay stops the CI waiters.

| item | disposition |
|---|---|
| Owner order, landing round 12 (`#1459`, `landing#102` `224b640`) | FIRST task: the owner approved round 11's components but rejected its content as unorganized and bloated next to Pierre's. Act as a landing specialist and professional copywriter: map Pierre's sections (`lp.pierre.finance/lp/converse`), research current landing craft from dated primary sources, rewrite the section list and every string (en and pt-BR), fix the 390 "Last 7 days" chart wrap, judge side by side with Pierre's, push as round 12 on `landing#102`. The full order is the latest comments on `#1459` and the Batch L item 1 text. His editable Figma copy of round 11: `https://www.figma.com/design/aLwwyaY3Dtw1NVesAWsNO7`. The local dev server for `224b640` runs detached on port 4321 |
| k12 heads | merge at the approved head when own non-parity checks are green, base holding only k12 heads (`mc-k12.heads`): `ui#1787` (manifest changer, merges before `ui#1825`), `ui#1786`, `ui#1816`, `ui#1814`, `ui#1813`, `ui#1809`, `ui#1810` (needs Pullfrog review), `ui#1821`, `ui#1806`, `ui#1822`; parity reds on k12 heads are false (k12 parity 0 losses) |
| `ui#1825` (`#1497`) | merges right after `ui#1787`; then base-merge with `node tools/surface-manifest.mjs` each of `ui#1812`, `1790`, `1789`, `1778`, `1773`, `1772`, `1757`, `1756` (their CI runs were cancelled; their reviews kept) |
| Pushed, waiting on CI and a fresh review | `ui#1819` (`#1408`), `ui#1780` (`#1431`), `ui#1782` (`#1435`), `landing#102`, `orbit-api#723` (`#1413`, then merge to `main` and the owner-approved production API release, then base-merge `orbit-api#724`), `orbit-api#730` (`#1494`) |
| New pull requests | `ui#1823` (`#1493`, stacked on `ui#1780`), `ui#1824` (`#1479`, stacked on `ui#1809`), `ui#1826` (`#1482`, stacked on `ui#1824`, layout spec already proven), `orbit-api#731` (`#1480`), `orbit-api#732` (`#1484`, stacked on `orbit-api#731`) |
| Other open pull requests | `ui#1818`, `ui#1817`, `ui#1815` (base-merge after `ui#1816`), `ui#1807` and `ui#1801` (base-merge after `ui#1810`), `ui#1805`, `ui#1804`, `ui#1794`, `ui#1791`, `ui#1781`, `ui#1779` (base-merge after `ui#1786`), `ui#1775`, `ui#1764`, `ui#1761`: drive each to the bar; `ui#1773` also needs the throwaway AVD proof |
| No pull request yet | `#1483` (after `orbit-api#731`), `#1481` (after `orbit-api#730`), `#1485` (after `orbit-api#732`), `#1415` to `#1420` (after `#1413`, `#1414`), `#1491` |
| Release | staging web serves `ad173e8fd` (verified); release staging again after the wave |
| Uncommitted | `.claude/orchestrator.json` caps edit: keep, never stage or revert |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first.
2. Landing round 12 (owner order, above).
3. CI waiters (`--ceiling-minutes 90`, at most three; `--require-check pullfrog-approval` where only the review is missing): `ui#1810`, `ui#1787` with `ui#1809`, `orbit-api#723` with `orbit-api#730`. Merge each pull request the moment it clears the bar, in the k12 and manifest order above.
4. The Astra plan as blockers merge (`### Batch L` item 2).
5. When the wave and `#1474` have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`), push-notify and tell the owner.

## Sleep

This is an unattended run that the owner is watching. Take every decision with the best approach and log it in the session scratchpad the moment it is made. Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (21 at the last report), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, and a large ticket, run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check, or at its approved head when it shares no file with the newer base; workers on CI-fix orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; a worker's NEEDS_DECISION is decided by the run on technical grounds and logged; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools; Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing dev server 4321); browser work through `claude-in-chrome`; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` to staging; `orbit-api` redesign work reaches `main` through `#1413`, and the production API release after it merges is approved; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase, Figma and GitHub through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing or Android without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: every redesign ticket done at maximum capacity; the landing copies Pierre's page in Orbit's design with Astra the hero, Pierre's lean section structure and copy, and Orbit's own features after the opening; the same exact measured sweep on the Orbit staging app, and continue until he can run his whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after his retest; no CircleCI token rotation; Figma (not Pencil) is the editable design tool for the landing.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track).

## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried (added: reply in his language, judge options on quality, Figma for the landing, Pierre-lean content, never disable hooks).
- `ui#1810` merges first, then parity reruns: carried, superseded in part by k12 (parity reds on k12 heads are false; non-k12 heads still need a fresh run after `ui#1810`).
- k11 heads: done for `ui#1808` (`0ace2e814`), `ui#1797` (`a1ec79d86`), `ui#1800` (`ad173e8fd`); the rest carried under k12.
- Skipped from k11: `ui#1780` done (base merge pushed); `ui#1781`, `ui#1779`, `ui#1815` carried.
- Base merges pushed last relay needing CI and review: carried; eight of them now also wait on `#1497`.
- `ui#1819` review fix: done (`d8a122281`, thread resolved).
- New pull requests `ui#1822`, `orbit-api#730`: carried (`orbit-api#730` base-merged `548a577b`).
- Not approved `ui#1805`, `ui#1794`, `ui#1790`, `landing#102`: carried (`landing#102` Build red fixed, `224b640`).
- `ui#1773` AVD proof: carried.
- API: `orbit-api#727` done (`c8877ee7`); `orbit-api#729` done (`bcfd81ea`); `orbit-api#723` base merge done (`ff1fed1f`), merge and the production API release carried; `orbit-api#724` carried.
- No pull request yet: `#1493`, `#1479`, `#1480` done (`ui#1823`, `ui#1824`, `orbit-api#731`); `#1482` and `#1484` done (`ui#1826`, `orbit-api#732`); `#1481`, `#1483`, `#1485`, `#1415` to `#1420`, `#1491` carried.
- Staging web release and owner notice: done (`ad173e8fd` verified, owner told).
- Sweep rerun and the 1.3.82 steps: carried.
- Stale worktree `ticket-1408-astra-turn-avatar`: done (already gone).

Every identifier here came from a previous session: treat each as a lead to verify.
