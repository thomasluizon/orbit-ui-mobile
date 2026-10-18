/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rules, the landing motion rule, the staging landing API rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 0 is the CI fix; item 1 the landing; item 2 `#1500`, the Astra plan, the sweep findings and the harness items; item 3 the flag wave), `### Batch R`, `### Batch 0b`, `### Batch 6` (the security tickets plus `#1508`, `#1509`, `#1515`, `#1524`), `### Batch 0c`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first UI diff read or sweep (or send each UI diff to the `design-reviewer` agent, which reads them). The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, check that `grep -n "^SP=" *.sh` names the new scratchpad, and open your own `sleep-decisions.md` (the carry renames the old one to `prev-sleep-decisions-8235a283.md`, D404 to D421). Read `relay-inventory.md` there first: it lists every finished, unpushed round with its head and thread ids. Helpers, all in the scratchpad: `facts-all.sh <key> <pr>...` (threads with full bodies and non-green checks into `facts-<pr>.md`), `mk-round.mjs` and `build-rounds-w1.sh` (round texts from facts), `round-order.sh`, `qa.sh <delay> <workspace> <issue> <worktree name> <order> [launch args]` (`REASON=` sets the relaunch reason; `--tier deep` for large tickets and review rounds), `launch-batch6.sh <issue> <slug> [args]`, `lr.sh <order>...` (a launch's outcome, commits and the worker's report), `conflicts-all.sh <base ref> <pr>...`, `resolve-sonar-lines.mjs <file>` (sonar conflict union in the one-entry-per-line format), `sonar-check.sh <pr>...` (the SonarCloud check summary; the SonarCloud API answers 403), `dup-all.sh <pr>...` (jscpd pairs outside the CPD exclusions), `close-merged.sh <issue> <pr> <squash>...` (`REPO=`, `BASE=`), `bar-all.sh`, `merge-gate.sh <key> <pr> [allowed red check]...`, `mc-prep.sh` and `mc-check.sh` (combined local merge-result check), `layout-specs.sh`, `run-spec.sh`, `run-shard.sh <worktree> <label> <shard>` (a layout shard the CI way), `landing-probe/r16-check.sh` (landing build plus every probe, including `stillness.mjs` and `hittest-scroll.mjs`), `audit-run.sh`. Shell cautions: redirect only to literal paths (write helper scripts instead), the Bash tool runs zsh, `ls` is aliased (use `/bin/ls`), `timeout` is not installed, never `git worktree remove --force`, never disable hooks, every background launcher, waiter and check takes the Bash `timeout` 7200000, and never start a launcher with a trailing `&`. `wait-release.mjs` needs the full 40-character `--sha`. Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`. A push already starts a Pullfrog review; post `@pullfrog review` only on a green head with no review at that head and no queued Pullfrog run. After each merge, fast-forward the orchestrating checkout (`git merge --ff-only origin/redesign/main`).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`): 168 open, 168 placed, 0 unplaced, 1 placed twice (`#556`, the recurring sync ticket, listed in two batches; leave it). 18 redesign tickets are open (11 in the `539 Redesign` milestone plus `#1404`, `#1408`, `#1409`, `#1411`, `#1422`, `#1423`, `#1500`). The run ends only when the spec is done or for an external cause.

## In flight

No worker, release watcher or subagent is running. The `ui#1841` CI waiter is stopped by the relay tool.

| item | disposition |
|---|---|
| `ui#1841` (`#1519`, `3e3d7b14f`, base merge pushed) | wait on CI and the review of that head; it is first in the merge order; if Layout shard 1 fails again at `action-rows.spec.ts:167`, download the trace artifact and read the failing page before any fix (local runs pass) |
| Twelve finished rounds, committed and NOT pushed (`relay-inventory.md`): `ui#1778`, `ui#1789`, `ui#1773`, `ui#1772`, `ui#1826` (threads); `ui#1830` (Unit Tests); `ui#1812`, `ui#1775`, `ui#1779` (duplication); `ui#1786`, `ui#1819`, `ui#1757` (base merges) | read each diff for gate edits, relaxed limits and `DESIGN.md` values; rerun `dup-all.sh` for the duplication rounds; answer each thread on its commit, merge the report into the body, resolve, then push once; `ui#1772` proves `today-date-layout.spec.ts` and `today-scoped-search.spec.ts` on a build before merging |
| `ui#1790`, `ui#1781` (approved, clean, shared files) | the combined check `check-k14` (scratchpad) was running at the relay: read `check-k14/summary.txt`; when every step exits 0, merge both at their approved heads with `merge-gate.sh`; otherwise rerun `mc-prep.sh k14 7fa57d891 4eeb461e4` and `mc-check.sh` |
| `ui#1791`, `ui#1809`, `ui#1794`, `ui#1782` (approved, sonar conflict only), `ui#1761`, `ui#1833`, `ui#1831`, `ui#1820`, `ui#1824` (docs conflicts) | after `ui#1841` merges: base-merge each mechanically (sonar with `resolve-sonar-lines.mjs`, registry rows and At a glance from the base), push; `ui#1824` takes the `block-registry.tsx` mirror-pair CPD exclusion; `ui#1791` first, because it fixes the `action-rows.spec.ts:120` red on `ui#1824`, `ui#1820` and `ui#1831` |
| `ui#1827` (`#1415`, `main`, `f898e3a58`, green, no review) | request a review if none is queued, merge on the bar; then add `Guards` and `Tool and Hook Tests` (app_id 15368) to ui `main`'s required checks and read the protection back; then `#1419` (deep) and `#1418` |
| `orbit-api#738` (`#101`), `orbit-api#739` (`#1508`) | read the diffs; `#738` must also make logout revoke the token (or show where it already does) and move its Render variables into `infra/configuration.tf`; merge on the bar |
| Batch 6 orders ready, not launched: `#102`, `#114`, `#115` (deep), `#1502`, `#1503`, `#1505`, `#1506`, `#1507`, `#1509`, `#1515`, plus `#1524` (needs `prep-ticket.sh api 1524 staging-landing-terraform main`) | launch with `launch-batch6.sh <issue> <slug>` (slugs in `prep-batch6.sh`); `#102`, `#115`, `#1505` carry the run's decisions in their orders |
| `landing#102` (`#1459`, `536350b`, on staging) | the owner reviews rounds 15 and 16 on `orbit-landing-staging.onrender.com`; his findings become round 17 |
| `#746`, `#1520` part 2 | after `ui#1841` merges, `#1520` part 2 backports it to `main`; carry api `main` into `redesign/main` through `#746` |
| Uncommitted | `.claude/orchestrator.json` caps edit: keep, never stage or revert |
| Branches, stashes, detached heads | no stashes; `mc-*` scratch worktrees are safe to prune except `mc-k14` until its check is read; every ticket worktree's unpushed commits are the twelve rounds above |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message (English).
2. Drive `ui#1841` to merged; push the twelve finished rounds (threads answered first); merge `ui#1790` and `ui#1781` on `check-k14`.
3. After `ui#1841`: the mechanical base merges above, `ui#1791` first; merge each on the bar.
4. Launch the Batch 6 tickets and `#1524` (the Actions queue is empty, 40 concurrent jobs).
5. The Astra plan as blockers merge (`#1483` after `ui#1824`), Batch L item 3 (`#1418`, `#1419` after `ui#1827`).
6. When the wave and `#1474` (`ui#1809`) have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`, `#1500`, `#1512`), push-notify and tell the owner.
7. Idle Codex capacity: rerun one audit pass only after a large merge wave.

## Sleep

This is an unattended run that the owner is watching, and the owner's order is to rush: everything done, then the product launch. Take every decision with the best approach and log it in the session scratchpad the moment it is made, with the real clock time from `date`. Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (18 at this relay), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, and a large ticket, run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check (read its layout result before merging), or at its approved head when it shares no file with the newer base; workers on CI-fix, review, base-merge and landing round orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; a worker's NEEDS_DECISION is decided by the run on technical grounds, written into the order and relaunched; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools, and a duplicate search covers every ticket (`gh issue list --state all --limit 2000`); Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing preview 4401, an `astro dev` server holds 4321); browser work through `claude-in-chrome` in the open window only; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits; idle capacity runs `audit-run.sh` passes, each finding verified by a skeptic before it is filed.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` (and the landing round branch) to staging; `orbit-api` flag-wave work reaches `main`; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub (including branch protection check names) through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing, API or Android without asking, apply `#1417`'s or `#1507`'s Terraform to production without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing (stop queued gated launches that have not passed the gate), drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: rush everything, the goal is launch; fix the GitHub Actions clog on the three repositories (`#1519` to `#1523`), deleting what does not earn its run; every redesign ticket done at maximum capacity; the landing follows the owner's reviews, is simple, has nothing repeated and one sentence per slot, has no pause or play button and nothing that moves on its own, and Figma is no longer used for it; the owner's habit row is the new habit standard in the app too; the same exact measured sweep on the Orbit staging app, and continue until the owner can run the whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after the retest; no CircleCI token rotation.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track).

## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried (owner instructions extended with the rush order).
- Close `#1437`, `#1402`, `#1512`, `#1490`: done (closed with merge evidence).
- Landing round 15 push, probes, waitlist check and staging release: done (`0b7c90b`, then round 16 `536350b` on staging; waitlist post 200 against the staging API).
- `ui#1841`: carried (base merge `3e3d7b14f` pushed; the red did not reproduce).
- `orbit-api#737`: done (merged `b802f9e4d`, api `main` required checks changed, `#1521` closed by the merge).
- ui `main` required checks second step: carried (after `ui#1827`).
- `ui#1827`, `#1419`, `#1418`: carried.
- Overlapping approved heads: carried, with the twelve rounds above and the mechanical merges after `ui#1841`.
- `ui#1772`, `ui#1831`, `ui#1833`: carried (`ui#1772` in the finished rounds).
- `ui#1824`, `ui#1820`, `ui#1826`, `#1483`: carried (`ui#1826` in the finished rounds).
- `ui#1786`, `ui#1779`: carried (both in the finished rounds).
- `ui#1778`, `ui#1789`, `ui#1773`: carried (finished rounds).
- `ui#1830`, `ui#1812`, `ui#1775`: carried (finished rounds).
- Batch 6 launches: carried (`#101` and `#1508` delivered as `orbit-api#738` and `#739`; the rest prepared).
- GitHub Pro: done (owner: paid).
- `#746`, the 1.3.82 steps, idle audits: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
