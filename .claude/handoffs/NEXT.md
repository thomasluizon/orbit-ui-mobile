/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules` (including the landing rules: the side cards float like Pierre's, nothing else moves on its own, each landing round reaches the Figma file before its staging release; the staging landing API rule and the Codex capacity rule: spend the banked reset, then the 62,500 credits), `### Batch L` (the owner's order; item 0 the CI fix, item 1 the landing, item 2 `#1500`, the Astra plan, the sweep findings, the harness items, item 3 the flag wave), `### Batch R`, `### Batch 0b`, `### Batch 6`, `### Batch 0c`, `## Decision pointers`, `## Current state` (its first paragraph is the latest relay) and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/` that `## Decision pointers` lists, including D145 (feature flags) and D146 (Codex plan, amended by the owner's credits order). Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first UI diff read or sweep (or send each UI diff to the `design-reviewer` agent). The owner's test list for the next build is the brain note `0 Inbox/Orbit staging test.md`.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This prompt follows a context relay, so `adoptRelayRun` returns true and the run state (queue, ledger, `openOwnerQuestions`) is inherited: read it back, do not replan. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The previous scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, check that `grep -n "^SP=" *.sh` names the new scratchpad, and open your own `sleep-decisions.md` (the carry renames the old one to `prev-sleep-decisions-b2148946.md`, D496 to D517). Files written after the carry (the `k17` layout result, the landing round 19 probe results) are in the predecessor's scratchpad under the system temp folder (`.../b2148946-2504-4fd9-9905-56839449bf9a/scratchpad/`): read `check-k17/summary.txt` and `landing-probe/*-r19.json` and `*-r19.log` there if the carry lacks them; if a run died at the relay, rerun it (`layout-only.sh <tree> k17` for the layout project, `serve.sh bash landing-probe/r19-run.sh` for the probes). Run `carry-out.sh` after every few decisions. Helpers (scratchpad): the previous set plus `layout-only.sh <tree> <label>`, `landing-probe/hittest-diag.mjs` (per-scroll reasons for a hit-test miss), `add-pr-any.mjs`, `dup-allowed.sh <key> <pr>` (pass its lines to `merge-gate.sh` through `tr '\n' '\0' | xargs -0`, never `eval`). Shell cautions: a redirect target must be a literal path (no `$SP` after `>` or `<`, no process substitution), the Bash tool runs zsh, `ls` is aliased (use `/bin/ls`), `timeout` is not installed, never pipe a launcher into `head`, never `git worktree remove --force`, never disable hooks, every launcher, waiter and check runs as a Bash background task with `timeout` 7200000, copy every SHA and thread id from tool output (thread ids from `rv.sh` or `list-bot-threads.mjs`, which record them for the identifier hook), at most three `wait-ci.mjs` waiters (one waiter takes several `--pr`). `create-worktree.mjs` takes a bare issue number (`--issue 1529`). After each merge, fast-forward the orchestrating checkout (`git merge --ff-only origin/redesign/main`).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval, in the owner's order (`### Batch L`). What is left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation (scratchpad `reconcile.mjs`): 153 open, 153 placed, 0 unplaced, 1 placed twice (`#556`, the recurring sync ticket; leave it). 13 redesign tickets are open by `gh issue list --repo thomasluizon/orbit-tickets --state open --milestone "539 Redesign"` (8) plus `#1408`, `#1409`, `#1411`, `#1423`, `#1500`; every one has a pull request. The run ends only when the spec is done or for an external cause.

## In flight

No worker is running. Background checks that may still be running: `k17` layout (tree `mc-k17`), the landing round 19 probe set (`r19-run.sh`).

| item | disposition |
|---|---|
| `k17` (`ui#1757`, `ui#1819` left to merge) | on a layout pass merge both at their approved heads with `merge-gate.sh`; then `ui#1812` takes a base merge plus a complexity round for `apps/mobile/components/chat/conversation.tsx:89` |
| Landing round 20 (`landing#102`, local `c4d90dc`, not pushed) | owner priority: read the round 19 probe results; `r18.mjs` `c2` fails at 1000 to 1440 (10 of 16); compose round 20 from `order-1459-r19.md`'s pattern with every failure plus the verified design items in the spec's Current state; on a clean probe set push, answer threads `PRRT_kwDORqm3lM6ttJD5` and `PRRT_kwDORqm3lM6to5r3` (Batch L item 1), write the Figma frames, release the staging landing from the branch, tell the owner in pt-BR |
| `ui#1849` (`#1529`), `ui#1850` (`#1530`) | approved; prove each changed layout spec repeatedly on a build (one hermetic run at a time, after `k17`), then merge |
| `ui#1761` (`#1409`) | round 3 pushed and approved; merge on the bar |
| `ui#1848` (`#1418` main half) | approved and green; its two cancelled body-edit runs were rerun; merge on green |
| `ui#1851` (`#1419` main half) | Pullfrog requested changes: read the threads and send a review round (deep tier); the throwaway AVD run in its `## Device check` is the orchestrator's |
| `ui#1852` (`#1520` part 2, `main`) | CI and review; on merge apply its Manual steps branch protection changes |
| `ui#1847` (`#1527`) | its staging proof needs the staging API on `redesign/main` with `#749`: after `orbit-api#756` merges and the staging API is released, release its branch to staging web, prove the partition, re-release staging web from `redesign/main` |
| `orbit-api#756` (`#746` carry) | CI and review; merge on the bar; then release the staging API from api `redesign/main` |
| `orbit-api#753` (`#1528` part 1) | SonarCloud round: `[Obsolete]` with an explanation message at `AuthController.cs:128` and `:151`, the four calling tests marked `[Obsolete]`, no pragma; merge; then `#752` base merge plus the `AccessTokenRequired` deletion |
| `orbit-api#754` (`#1532`) | approved and green: run the production `terraform plan` (no-op expected) before merging, then delete the two SSM parameters it lists |
| `#1531` | `orbit-api#755` merged; record the preconditions on the ticket (1.3.38 (97), Play Console distribution, 426 handling at `apps/mobile/lib/api-client.ts:299`, Render `APP_VERSION`); guarded update on staging; production only with the owner's yes at the production API release |
| `ui#1772`, `ui#1833` | flaky layout jobs rerun (`#1529` and `#1530` causes); `ui#1833` also needs a Pullfrog review at its head; merge on the bar |
| `ui#1831` | its waiter hit its ceiling with checks still pending at `0d125de19`; read the rollup, merge on the bar |
| `ui#1779 1781 1786 1789 1791 1794` | base merges after `k17` (`base-merge-rows.sh` for docs and manifests, a worker for product conflicts, `feature-parity.json` regenerated); `ui#1794` keeps its local round `17a73f2f6` and thread `PRRT_kwDOR5Siws6ttJym` |
| `ui#1824`, `ui#1830`, `ui#1826` | rounds from the spec's diagnosis after the `k17` merges; `#1483` starts when `ui#1824` merges |
| Uncommitted, stashes, detached heads | orchestrating checkout clean; no stashes; detached heads are scratch build trees (`mc-*`), safe to prune; `ticket-1242-week-grid-one-scroller` and `ticket-1503-push-endpoint-check` each hold one superseded unpushed commit (leave) |
| Session chain | open (automatic relay) |

## Then, in this order

1. Answer the owner first, in the language of his latest message (English; landing news in pt-BR).
2. Landing round 20 to a clean probe set, then push, Figma and the staging landing release.
3. Merge what clears the bar; base-merge and round the rest in the order above.
4. Batch 6: `orbit-api#753` round, `#752`, `#754` plan proof, `ui#1847` staging proof.
5. The Astra plan as blockers merge (`#1483` after `ui#1824`), Batch L item 3 (`ui#1851` round, the `#1419` and `#1418` `redesign/main` halves).
6. When the wave, the `orbit-api#756` carry and the staging API release have landed: rerun the measured sweep and fix its findings, release staging web, verify `/api/health`, dispatch Orbit Staging 1.3.82 (141) to internal, verify the Play upload, update the brain note `0 Inbox/Orbit staging test.md` (add `#1408`, `#1422`, `#1423`, `#1471`, `#1474`, `#1496`, `#1500`, `#1512`, `#1525`), push-notify and tell the owner.
7. Idle Codex capacity: one audit pass after a large merge wave.

## Sleep

This is an unattended run that the owner is watching, and the owner's order is to rush: everything done, then the product launch. Take every decision with the best approach and log it in the session scratchpad the moment it is made, with the real clock time (`log.sh`). Keep a live wake source at the end of every turn while work remains. Answer each owner message before other work, in the language of his latest message. Read an owner message as a question when it ends in a question; never record a question as his decision. When he asks which option is better, answer on quality, not ease. A progress report leads with how many redesign tickets remain and whether that fell (13 by the query at this relay, down from 17), and names something as waiting on the owner only when he can act on it now.

The standing operating detail is carried unchanged: gated launches with `LOAD_MAX=60 SPACING=45`; no live-worker cap; `--hard-ceiling-minutes 75` for implementation launches; every ui order appends `note-verify-cap.md` and every api order `note-verify-api.md`; a review round after a failed round, a large ticket and a landing round run on the `deep` tier; D104 salvage of killed workers; `--relaunch-reason` once a branch reaches its launch cap; `--allow-subagents` only for orders with a `## UI review sweep` heading; workers never start a server, browser or emulator; one hermetic Playwright run at a time; at most three waiters; prove changed layout specs on a build before merging; a pull request behind its base merges after a combined check (read its layout result before merging), or at its approved head when it shares no file with the newer base, and that holds for api merges too; scan heads with `conflict-scan.sh` before a combined check; workers on CI-fix, review, base-merge and landing round orders commit without pushing, so read the diff for gate edits, relaxed limits and committed evidence files and push it yourself; read every worker pull request's diff yourself or through a read-only subagent before it merges, and turn a verified defect into a round; a worker's NEEDS_DECISION is decided by the run on technical grounds, written into the order and relaunched; new copy is approved with `/second-opinion` framed as a claimed defect; pt-BR uses the app's own vocabulary and Astra is feminine; ticket writes through the `tools/*-ticket.mjs` tools, and a duplicate search covers every ticket (`gh issue list --state all --limit 2000`); Render workspace `tea-ctg9ljtumphs73dep1o0`; port 3000 belongs to `open-webui` (layout runs use 3100, the landing preview 4401, an `astro dev` server holds 4321), port 5000 belongs to macOS ControlCenter (a local API runs on 5199); browser work through `claude-in-chrome` in the open window only; redact finished worker logs that carry a secret. Codex: the owner applied the banked reset; when it runs out, the run spends the 62,500 credits; idle capacity runs `audit-run.sh` passes, each finding verified by a skeptic before it is filed.

The owner's written authorization stands: merge to `main` what belongs there and redesign work into `redesign/main` on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); release `redesign/main` (and the landing round branch) to staging; `orbit-api` flag-wave work reaches `main`; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase, Figma and GitHub (including branch protection check names) through their tools and `claude-in-chrome`; test habits only in his staging account; a throwaway AVD only. Never create an account, type a credential or payment detail, download an app without his yes, permanently delete a project, write to the production database, merge `orbit-ui-mobile` or `orbit-landing-page` `redesign/main` to `main`, release production web, landing, API or Android without asking, apply `#1417`'s or `#1507`'s Terraform to production without asking, stop a program the run did not start, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing (stop queued gated launches that have not passed the gate), drain, run `carry-out.sh`, then `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: rush everything, the goal is launch, go faster; fix the GitHub Actions clog (`#1519` to `#1523`), deleting what does not earn its run; every redesign ticket done at maximum capacity; the landing follows the owner's reviews, is simple, has nothing repeated and one sentence per slot, has no pause or play button, its side cards float with a real animation like Pierre's, its hero side columns stay inside the container, its feature compositions stay compact, and the Figma file gets each round's render; the owner's habit row is the new habit standard in the app too; the same exact measured sweep on the Orbit staging app, and continue until the owner can run the whole test note; Layout Guard and the parity gate must stop failing on pull requests that did not cause the red; delete CI that does not earn its run; maximum workers without breaking the machine; stop removing features; no literal pt-BR translation; no option row that wraps; one padding standard; THE REDESIGN GATE holds until the owner approves after the retest; no CircleCI token rotation.

Open owner questions (in the spec and `openOwnerQuestions`, never asked during a relay): THE REDESIGN GATE approval after the 1.3.82 retest (raise it only once that build is on the internal track). Owner yes needed later, not now: `orbit-api#750`'s production IAM policy, the `#738` production JWT configuration and the `#1531` production floor raise, all at the production API release that carries them.

## Previous prompt, disposition

- Reading list, entry point, sleep rules, authorization, relay rule and owner instructions: carried (this prompt adds: no production database write; `#1531`'s production raise at the production API release).
- Answer the owner first: carried.
- Landing round 18 to staging and Figma: superseded; round 18 failed two probes (D508), round 19 was built (`c4d90dc`), and its `c2` failure makes round 20 next.
- Merge `k16` heads `ui#1773 1757 1778 1782 1809 1819`: `1773 1778 1782 1809` done (`c5be58589`, `3463723e2`, `4b9212a1c`, `d87ecd4f7`); `1757` and `1819` carried behind `k17` (they share files with the carry).
- `ui#1812` base merge plus complexity round: carried.
- `ui#1779 1781 1786 1789` base merges: carried.
- `ui#1791`, `ui#1794` base merges: carried.
- `ui#1824`, `ui#1830`, `ui#1826` rounds; `#1483` after `ui#1824`: carried.
- `ui#1772`, `ui#1831`, `orbit-api#744`, `#746`: `#744` done (`1bd0d2650`), `#746` done (`85d8824ab`, after a worker base merge); `ui#1772` and `ui#1831` carried.
- `ui#1833`, `ui#1844`: `ui#1844` done (`cb2539ed1`); `ui#1833` carried (flaky job rerun, review at head needed).
- `ui#1761`: round 3 pushed (`258de8bf3`), approved; merge carried.
- `ui#1847`, `ui#1848`: `ui#1848` diff read, approved, merge carried after the reruns; `ui#1847` carried behind `orbit-api#756` and the staging API release.
- `orbit-api#752` deprecate-first round: done as `orbit-api#753` (SonarCloud round carried), `#752` carried.
- `#1419` launch: done, delivered `ui#1851` (NEEDS_DECISION decided D502: native union on `main`); its review round carried.
- Tickets to file (Terraform selector, `MinSupportedVersion`): done as `#1532` (`orbit-api#754`) and `#1531` (`orbit-api#755` merged); `#1529` and `#1530` filed too.
- `#746` carry, `#1520` part 2: done as `orbit-api#756` and `ui#1852`, both carried to merge.
- Uncommitted caps edit: done; it was byte-identical to the merged carry and is gone.
- The 1.3.82 steps, idle audits: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
