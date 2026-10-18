/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rules, the landing motion rule, the staging landing API rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 0 is the CI fix; item 1 the landing; item 2 `#1500`, the Astra plan, the sweep findings, the harness items and `#1526`; item 3 the flag wave), `### Batch R`, `### Batch 0b`, `### Batch 6` (the security tickets plus `#1527` and `#1528`), `### Batch 0c`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first UI diff read or sweep (or send each UI diff to the `design-reviewer` agent, which reads them). The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, check that `grep -n "^SP=" *.sh` names the new scratchpad, and open your own `sleep-decisions.md` (the carry renames the old one to `prev-sleep-decisions-2769b6cf.md`, D452 to D471; D452 to D461 were reconstructed after an outage wiped the scratchpad). A machine outage can wipe both the scratchpad and the worker logs under the system temp folder: run `carry-out.sh` after every few decisions so the durable copy stays current. Helpers, all in the scratchpad, as listed in the spec's latest relay and the previous prompts: `facts-all.sh`, `mk-replies.sh <report> <thread>...` (reply files from a report's `## Thread replies`), `round-order.sh`, `round-order-api.sh`, `qa.sh`, `prep-ticket.sh`, `lr.sh`, `extract-report.sh`, `body-merge.sh` (no `--ui-scope` for review reports), `answer-push.sh`, `bm-1841.sh <pr>` (accepts `EXPECT=<sha>` for an unpushed local head), `bar-all.sh`, `merge-gate.sh <key> <pr> [allowed red check]...`, `close-merged.sh`, `mc-prep.sh`, `mc-check.sh`, `api-mc.sh`, `tf-plan.sh`, `log.sh`, `wait-loop.sh`, `carry-out.sh`, `audit-run.sh`. Shell cautions: a redirect target must be a literal path (write helper scripts or use the Write tool; `log.sh` reads a heredoc), the Bash tool runs zsh, `ls` is aliased (use `/bin/ls`), `timeout` is not installed, never `git worktree remove --force`, never disable hooks, every background launcher, waiter and check takes the Bash `timeout` 7200000, never start a launcher with a trailing `&`, and copy every thread id from `gh` output (a reply file named with another repository's id prefix fails). After each merge, fast-forward the orchestrating checkout (`git merge --ff-only origin/redesign/main`). If `create-worktree.mjs` says the Orca runtime is missing, run `open -a Orca`; if `claude-in-chrome` reports no browser, `open -a "Google Chrome"` and retry.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`): 160 open, 160 placed, 0 unplaced, 1 placed twice (`#556`, the recurring sync ticket; leave it). 16 redesign tickets are open (11 in the `539 Redesign` milestone), and every one has a pull request. The run ends only when the spec is done or for an external cause.

## In flight

No worker, release watcher or subagent is running. A local combined check may still be running at relay: `mc-k15` (its summary is `check-k15/summary.txt` in the predecessor's scratchpad; if it is absent or incomplete, rerun `mc-prep.sh k15 <heads>` and `mc-check.sh <worktree> k15`).

| item | disposition |
|---|---|
| `ui#1773 1779 1781 1786 1789 1819` (approved, zero threads, green, behind with overlap) | merge each at its approved head with `merge-gate.sh` once `k15` passes; on a red, read the failing step's log and send a round |
| `ui#1757 1778 1782 1791 1794 1809 1812 1820` (base-merged, green, no review at head) | `@pullfrog review` was posted; merge on approval, or answer and round on findings. A head now behind `8acaa5417` merges at its approved head when it shares no file with the newer base, else after a combined check |
| `ui#1772` | conflicts with `ui#1775`: `bm-1841.sh 1772`, read, push |
| `ui#1761` (`#1409`, `ef71332e2`) | salvage round pushed; merge on the bar |
| `ui#1844` (`#556` carry, `c9e7aff9b`) | review fix pushed; merge on the bar; add `ui#1843` (`#1525`) to the carry when it merges; must merge before Orbit Staging 1.3.82; its body names a missing `RENDER_WEB_REDESIGN_SERVICE_ID` (confirmed absent in repository and environment variables; a `production-redesign` dispatch stops at `release.yml:159`) |
| `ui#1843` (`#1525`, `main`, `13d123e06`) | round 2 pushed, thread resolved; merge on the bar; ship on the open track with the next Android release |
| `ui#1824 1830 1831 1833 1826` | red at relay (SonarCloud on 1824, 1830, 1831; Layout shard 1 and Upgrade layout geometry on 1831, 1833; Unit Tests and Upgrade layout geometry on 1826): read each log, fix at cause with a round; `#1483` starts after `ui#1824` merges |
| `orbit-api#744` (`#102`, `3a445d05`), `#746` (`#115`, `9d225cf1`), `#749` (`#114`, `e7d9d8a7`), `#750` (`#1507`, `f4e61f967`) | rounds pushed, threads resolved; merge on the bar, each with `api-mc.sh` on `main` when it overlaps the newer base (`#744` and `#746` both edit `GoogleSignInFlow.cs`; `#746` and `#750` share `AccountDeletionService.cs`); before the staging API release with `#750`, apply `aws_iam_user_policy.uploads["staging"]` and drop the two `*_storage_provider` lines from `infra/local.tfvars`; production IAM only with the owner's yes |
| `orbit-api#738` (`#101`, `1bcbf6b8`) | merge only after `ui#1843`; its production release waits for the Android build carrying `#1525` and for production reading `Jwt__ExpiryMinutes=15`, `Jwt__ExpiryHours=0` |
| `#1527` (web BFF visitor IP, `main`) | launch now that `#749` defines the headers; `prep-ticket.sh ui 1527 bff-client-ip main` |
| `#1528` (delete the Supabase sign-in path, api `main`) | launch after `orbit-api#750` merges |
| `landing#102` (`#1459`, `d0c1153`, round 17) | write and run the containment probe at 320, 360, 375, 412, 480, 600, 768, 840, 1000, 1100, 1280, 1352, 1440, 1920 in en and pt-BR on a preview build; on a pass, release the staging landing from the branch and tell the owner in pt-BR; on a fail, round 18 |
| `#746`, `#1520` part 2 | backport the `#1519` result to `main` (`#1520` part 2); carry api `main` into `redesign/main` through `#746` |
| Uncommitted | `.claude/orchestrator.json` caps edit in the orchestrating checkout: keep, never stage or revert |
| Branches, stashes, detached heads | no stashes; detached heads are scratch build trees (`base`, `landing-view`, `land-*`, `mc-*`), safe to prune; `ticket-1242-week-grid-one-scroller` holds one unpushed commit on closed `#1242` (leave); `ticket-1503-push-endpoint-check` holds an unpushed fixture commit superseded by `orbit-api#751` (leave) |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message (English; his landing finding came in pt-BR, so tell him about the landing in pt-BR).
2. Merge everything above that clears the bar; base-merge and round what does not.
3. The landing probe and the staging landing release.
4. Batch 6: the api merges with combined checks, `ui#1843`, then `orbit-api#738`, `#1527`, `#1528`.
5. `ui#1844` (`#556`) merged with `#1525` carried.
6. The Astra plan as blockers merge (`#1483` after `ui#1824`), Batch L item 3 (`#1418`, `#1419`, now unblocked by `ui#1827`).
7. When the wave, `#1474` (`ui#1809`) and the `#556` carry have merged: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`, `#1500`, `#1512`, `#1525`), push-notify and tell the owner.
8. Idle Codex capacity: one audit pass after a large merge wave.

## Sleep

This is an unattended run that the owner is watching, and the owner's order is to rush: everything done, then the product launch. Take every decision with the best approach and log it in the session scratchpad the moment it is made, with the real clock time (`log.sh`). Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (16 at this relay), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, and a large ticket, run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server or browser; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check (read its layout result before merging), or at its approved head when it shares no file with the newer base, and that rule holds for every api merge too, so several api merges in a row end with `api-mc.sh` on `main`; workers on CI-fix, review, base-merge and landing round orders commit without pushing, so read the diff for gate edits and relaxed limits and push it yourself; read every worker pull request's diff yourself or through a read-only subagent before it merges, and turn a verified defect into a round; a worker's NEEDS_DECISION is decided by the run on technical grounds, written into the order and relaunched; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools, and a duplicate search covers every ticket (`gh issue list --state all --limit 2000`); Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing preview 4401, an `astro dev` server holds 4321); browser work through `claude-in-chrome` in the open window only; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits; idle capacity runs `audit-run.sh` passes, each finding verified by a skeptic before it is filed.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` (and the landing round branch) to staging; `orbit-api` flag-wave work reaches `main`; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub (including branch protection check names) through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing, API or Android without asking, apply `#1417`'s or `#1507`'s Terraform to production without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing (stop queued gated launches that have not passed the gate), drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: rush everything, the goal is launch, go faster; fix the GitHub Actions clog on the three repositories (`#1519` to `#1523`), deleting what does not earn its run; every redesign ticket done at maximum capacity; the landing follows the owner's reviews, is simple, has nothing repeated and one sentence per slot, has no pause or play button and nothing that moves on its own, and Figma is no longer used for it; the owner's habit row is the new habit standard in the app too; the same exact measured sweep on the Orbit staging app, and continue until the owner can run the whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after the retest; no CircleCI token rotation.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track). Owner yes needed later, not now: `orbit-api#750`'s production IAM policy and the `#738` production JWT configuration, both before the production API release that carries them.


## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried (owner adds: go faster).
- Answer the owner first: carried.
- Merge `ui#1841`, then `ui#1845`: done (`573431fe1`, `421fe8802`; `#1519` and `#1526` closed).
- Base merges after `ui#1841` and push `ui#1775`: done (fourteen pushed; `ui#1775` merged `8acaa5417`, `#1422` closed); `ui#1761` needed a worker round and is pushed; `ui#1772` needs one more base merge (carried).
- Merge `ui#1826` on the bar: carried (red at relay).
- `ui#1844` read the diff: done (two defects fixed in `c9e7aff9b`); merge and the `#1525` carry: carried.
- `ui#1827` merge and required checks: done (`6f645d720`; `Guards` and `Tool and Hook Tests` required on ui `main`); `#1419`, `#1418`: carried.
- `ui#1843` read and merge: read and two rounds pushed; merge carried.
- `orbit-api#738` after `ui#1843`: carried.
- Batch 6 api merges: `#751` merged (`d9f847a81`, `#1503` closed); `#744`, `#746`, `#749`, `#750` took rounds and are pushed (carried); `#1527` and `#1528` filed (carried).
- `landing#102` owner review: superseded by his round 17 finding; round 17 pushed, probe and release carried.
- `#746`, `#1520` part 2, the 1.3.82 steps, idle audits, the legacy Supabase sign-in search: the search is done (`#1528`); the rest carried.

Every identifier here came from a previous session: treat each as a lead to verify.
