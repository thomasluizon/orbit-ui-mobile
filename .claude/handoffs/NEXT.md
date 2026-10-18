/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rules, the landing motion rule, the staging landing API rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 0 is the CI fix; item 1 the landing; item 2 `#1500`, the Astra plan, the sweep findings and the harness items; item 3 the flag wave), `### Batch R`, `### Batch 0b`, `### Batch 6` (the security tickets plus `#1508`, `#1509`, `#1515`, `#1524`), `### Batch 0c`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first UI diff read or sweep (or send each UI diff to the `design-reviewer` agent, which reads them). The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, check that `grep -n "^SP=" *.sh` names the new scratchpad, and open your own `sleep-decisions.md` (the carry renames the old one to `prev-sleep-decisions-0a897c6c.md`, D422 to D432). Read `relay-inventory.md` there first: it lists every finished, unpushed round with its head and thread ids. Helpers, all in the scratchpad: `facts-all.sh <key> <pr>...` (threads with full bodies and non-green checks into `facts-<pr>.md`), `mk-round.mjs` and `build-rounds-w1.sh` (round texts from facts), `round-order.sh`, `qa.sh <delay> <workspace> <issue> <worktree name> <order> [launch args]` (`REASON=` sets the relaunch reason; `--tier deep` for large tickets and review rounds), `launch-batch6.sh <issue> <slug> [args]`, `lr.sh <order>...` (a launch's outcome, commits and the worker's report), `conflicts-all.sh <base ref> <pr>...`, `resolve-sonar-lines.mjs <file>` (sonar conflict union in the one-entry-per-line format), `sonar-check.sh <pr>...` (the SonarCloud check summary; the SonarCloud API answers 403), `dup-all.sh <pr>...` (jscpd pairs outside the CPD exclusions), `close-merged.sh <issue> <pr> <squash>...` (`REPO=`, `BASE=`), `bar-all.sh`, `merge-gate.sh <key> <pr> [allowed red check]...`, `mc-prep.sh` and `mc-check.sh` (combined local merge-result check), `layout-specs.sh`, `run-spec.sh`, `run-shard.sh <worktree> <label> <shard>` (a layout shard the CI way), `landing-probe/r16-check.sh` (landing build plus every probe, including `stillness.mjs` and `hittest-scroll.mjs`), `audit-run.sh`. Shell cautions: redirect only to literal paths (write helper scripts instead), the Bash tool runs zsh, `ls` is aliased (use `/bin/ls`), `timeout` is not installed, never `git worktree remove --force`, never disable hooks, every background launcher, waiter and check takes the Bash `timeout` 7200000, and never start a launcher with a trailing `&`. `wait-release.mjs` needs the full 40-character `--sha`. Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`. A push already starts a Pullfrog review; post `@pullfrog review` only on a green head with no review at that head and no queued Pullfrog run. After each merge, fast-forward the orchestrating checkout (`git merge --ff-only origin/redesign/main`).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`): 168 open, 168 placed, 0 unplaced, 1 placed twice (`#556`, the recurring sync ticket, listed in two batches; leave it). 18 redesign tickets are open (11 in the `539 Redesign` milestone plus `#1404`, `#1408`, `#1409`, `#1411`, `#1422`, `#1423`, `#1500`), and every one has a pull request. The run ends only when the spec is done or for an external cause.

## In flight

No worker, release watcher or subagent is running. The scratchpad `relay-inventory.md` lists every head and order.

| item | disposition |
|---|---|
| `ui#1841` (`#1519`, `fb36d09b9`) | review fix pushed (pending reply contract restored, nightly Sonar cache writes removed, parity gate docs renamed), thread resolved; wait on CI and the review of that head, merge first; if Layout shard 1 fails at `action-rows.spec.ts:167`, download the trace artifact and read the failing page before any fix |
| k14 combined check (`ui#1790` + `ui#1781`, worktree `mc-k14` under the previous `8235a283` scratchpad) | passed through the mobile suite; resume with `bash mc-resume.sh <mc-k14 path> k14` (web suite, build, layout); on pass merge `ui#1790` at `7fa57d891` with `merge-gate.sh`; `ui#1781` waits for `ui#1841` (both edit `CLAUDE.md`), then one base merge |
| Twelve rounds pushed (`ui#1778`, `1773`, `1789`, `1772`, `1826`, `1830`, `1812`, `1775`, `1779`, `1786`, `1819`, `1757`) | wait on CI and Pullfrog; merge each on the bar; `ui#1772` proves `today-date-layout.spec.ts` and `today-scoped-search.spec.ts` on a build first; each that edits sonar, a registry row or a glance header takes one base merge after `ui#1841` |
| `ui#1791`, `ui#1809`, `ui#1794`, `ui#1782`, `ui#1761`, `ui#1833`, `ui#1831`, `ui#1820`, `ui#1824` | after `ui#1841` merges: base-merge each mechanically (sonar with `resolve-sonar-lines.mjs`, registry rows and At a glance from the base), push; `ui#1824` takes the `block-registry.tsx` mirror-pair CPD exclusion; `ui#1791` first (it fixes the `action-rows.spec.ts:120` red on `ui#1824`, `ui#1820`, `ui#1831`) |
| `ui#1827` (`#1415`, `main`, `f898e3a58`) | `@pullfrog review` posted; merge on an exact-head approval, then add `Guards` and `Tool and Hook Tests` (app_id 15368) to ui `main`'s required checks and read them back; then `#1419` (deep) and `#1418` |
| `ui#1843` (`#1525`, `main`) | read the diff (it also touches web tests), merge on the bar; ship it on the open track with the next Android release; carry it to `redesign/main` with `#556` |
| `orbit-api#738` (`#101`) | two P1 threads; launch `order-101-rb1.md` (`REASON="Review round 1 for the two Pullfrog threads." bash qa.sh 0 orbit-api 101 ticket-101-token-lifetime 101-rb1`); merge only after `ui#1843`; its production release waits for the Android build carrying `#1525` |
| `orbit-api#740` to `#750` (`#1509`, `#1506`, `#1524`, `#1502`, `#102`, `#1505`, `#115`, `#1515`, `#1503`, `#114`, `#1507`) | read each diff; answer review threads with rounds; merge on the bar into api `main`; `#742` was applied to staging by target (verify the staging plan is clean, production untouched); `#750`'s IAM Terraform reaches production only with the owner's yes |
| `#556` carry (`order-556-oct18.md`, worktree `ticket-556-carry-main-oct18`) | launch `bash qa.sh 0 orbit-ui-mobile 556 ticket-556-carry-main-oct18 556-oct18 --tier deep`; add `#1525` once `ui#1843` merges; it must merge before Orbit Staging 1.3.82 |
| `landing#102` (`#1459`, `536350b`, on staging) | the owner reviews rounds 15 and 16; his findings become round 17 |
| `#746`, `#1520` part 2 | after `ui#1841` merges, `#1520` part 2 backports it to `main`; carry api `main` into `redesign/main` through `#746` |
| Uncommitted | `.claude/orchestrator.json` caps edit: keep, never stage or revert |
| Branches, stashes, detached heads | no stashes; `mc-*` scratch worktrees are safe to prune except `mc-k14`; every ticket worktree's work is pushed |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message (English).
2. Drive `ui#1841` to merged; resume k14 and merge `ui#1790`; merge the twelve pushed rounds as each clears the bar.
3. Launch the `#556` carry and the `#738` round (the Actions queue holds the twelve rounds' runs; 40 concurrent jobs).
4. After `ui#1841`: the mechanical base merges above, `ui#1791` first, then `ui#1781`; merge each on the bar.
5. Merge the Batch 6 api pull requests on the bar; `ui#1843`, then `#738`.
6. The Astra plan as blockers merge (`#1483` after `ui#1824`), Batch L item 3 (`#1418`, `#1419` after `ui#1827`).
7. When the wave, `#1474` (`ui#1809`) and the `#556` carry have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`, `#1500`, `#1512`, `#1525`), push-notify and tell the owner.
8. Idle Codex capacity: rerun one audit pass only after a large merge wave.

## Sleep

This is an unattended run that the owner is watching, and the owner's order is to rush: everything done, then the product launch. Take every decision with the best approach and log it in the session scratchpad the moment it is made, with the real clock time from `date`. Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (18 at this relay), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, and a large ticket, run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check (read its layout result before merging), or at its approved head when it shares no file with the newer base; workers on CI-fix, review, base-merge and landing round orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; a worker's NEEDS_DECISION is decided by the run on technical grounds, written into the order and relaunched; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools, and a duplicate search covers every ticket (`gh issue list --state all --limit 2000`); Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing preview 4401, an `astro dev` server holds 4321); browser work through `claude-in-chrome` in the open window only; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits; idle capacity runs `audit-run.sh` passes, each finding verified by a skeptic before it is filed.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` (and the landing round branch) to staging; `orbit-api` flag-wave work reaches `main`; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub (including branch protection check names) through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing, API or Android without asking, apply `#1417`'s or `#1507`'s Terraform to production without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing (stop queued gated launches that have not passed the gate), drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: rush everything, the goal is launch; fix the GitHub Actions clog on the three repositories (`#1519` to `#1523`), deleting what does not earn its run; every redesign ticket done at maximum capacity; the landing follows the owner's reviews, is simple, has nothing repeated and one sentence per slot, has no pause or play button and nothing that moves on its own, and Figma is no longer used for it; the owner's habit row is the new habit standard in the app too; the same exact measured sweep on the Orbit staging app, and continue until the owner can run the whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after the retest; no CircleCI token rotation.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track).


## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried.
- Drive `ui#1841` to merged: carried (review fix `fb36d09b9` pushed, thread resolved, CI running).
- Push the twelve finished rounds, threads answered first: done (all twelve pushed, nine threads resolved with red then green evidence, reports in the bodies).
- Merge `ui#1790` and `ui#1781` on `check-k14`: carried (k14 passed through the mobile suite; `ui#1781` now waits for `ui#1841`).
- Mechanical base merges after `ui#1841`, `ui#1791` first: carried.
- `ui#1827` review, required checks, `#1419`, `#1418`: carried (review requested).
- `orbit-api#738`: carried (review order composed; logout revocation shown from code; Android defect filed as `#1525`).
- `orbit-api#739`: done (merged `0e3262836`, `#1508` closed).
- Batch 6 launches and `#1524`: done (eleven pull requests, `orbit-api#740` to `#750`).
- `landing#102` owner review: carried.
- `#746`, `#1520` part 2: carried.
- The 1.3.82 steps and idle audits: carried (test note list gains `#1525`).
- New: the `#556` carry composed and not launched (the relay threshold came first).

Every identifier here came from a previous session: treat each as a lead to verify.
