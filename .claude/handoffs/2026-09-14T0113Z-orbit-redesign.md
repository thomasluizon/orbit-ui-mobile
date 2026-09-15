Read `.claude/specs/orbit-redesign.md` first. It carries the standing instructions, the decisions,
the constraints and the state. This prompt only says what to do next.

Every identifier below came from a previous session. Treat each as a lead to verify, not a fact.
All of it was read live on 2026-09-14 between 00:50 and 01:15 UTC.

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line.

`.claude/rules/core.md` carries the operating contract, D89 and D90 included. Read it rather than
assuming.

## The job

Clear the findings on the four open screen pull requests and merge what earns it, then take the next
stages. Nothing here waits on Thomas except merging an `orbit-api` pull request, and the copy he was
handed.

`redesign/main` was `e7026d8d` when this was written.

## In flight, with a disposition for each

Recount before acting.

**Open pull requests, `orbit-ui-mobile` (11).**

| PR | state read 2026-09-14 | disposition |
|---|---|---|
| 948 | MERGEABLE at `7f1fe011`, base `redesign/main`, no review decision | privacy and terms. Read its Pullfrog review, clear it, merge under D90 |
| 947 | MERGEABLE at `ead94f5a`, base `redesign/main`, no review decision | Wrapped cover. Same. Its SonarCloud red does not gate `redesign/main` |
| 946 | MERGEABLE at `20d729c6`, base `redesign/main`, no review decision | Perfil API keys. Three findings were fixed at `9144b195`; re-read the review at the current head |
| 940 | MERGEABLE at `7b1ef8c0`, base `feature/ticket-56-calendar-s11`, **APPROVED**, zero threads | calendar stage 12. Cannot merge until 939 does. Needs one more base merge after 939 moves |
| 939 | at `f1c747bb`, base `redesign/main` | **BLOCKED.** Three review rounds used, which is `caps.reviewFixAttempts`. Its open thread is filed as `#527`. Run `#527`, then 939, then 940 |
| 894 | at `53c49044`, base `redesign/main`, `behindBy` 0 | Progresso stage 3. Its one finding needs `#505`, so it waits on orbit-api 518 deploying |
| 890 | at `df2d862d` | leave it. The spec says why, under "Pull request 890 is deliberately untouched" |
| 881, 801, 799, 798 | MERGEABLE, base `main` | dependabot, not redesign work. Leave them |

**Open pull requests, `orbit-api` (6): 521, 520, 518, 512, 511, 510.** Two are this effort's:

- **518** at `6ac02c2a`, was APPROVED with zero threads at `29181bb1`; I pushed the regenerated
  architecture map to clear its `drift` red, so it re-reviews. It delivers `#505` and unblocks 894.
- **521** at `cc86c612`, CHANGES_REQUESTED at the previous head. Two rounds of findings are fixed:
  the null end-time rule and the daylight-saving fall-back. It delivers `#526` and makes 939 correct.

**Do not merge either.** No `orbit-api` pull request merges unattended; the spec's decision says why.

**`orbit-landing-page`: nothing open from this effort.** Its five open pull requests are dependabot.

**Tickets filed tonight, none started:**

- `#527` `repo:ui` — a timezone change can cache old-zone calendar events under the new key. **This
  is what unblocks 939 and therefore 940.** Its fix lands on `feature/ticket-56-calendar-s11`.
- `#528` `repo:ui` — a hand-listed icon mock breaks unrelated mobile suites. **A worker was running
  this when the handoff was written**; see below.
- `#529` `repo:api` — listing and revoking API keys require no step up. 946 cannot honestly claim its
  boundary until this deploys.
- `#530` `repo:ui` — `calendar-views.test.tsx` reads the real clock, so it is green in CI and red
  locally. Fix it early: it makes every local suite unreadable until it lands.

**Open tickets this effort owns: 30 `repo:ui` and 30 `repo:api`.** Reproduce with
`gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 100`.

**Running worker: one.** `#528` in
`C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-528-icon-mock`, branch
`fix/ticket-528-icon-mock`, log `%TEMP%/orbit-workers/#528-1789347471166.log`, launched from
`e7026d8d` with a 60 minute ceiling. Its worktree held 25 dirty files at 01:10 UTC. **Its outcome is
unknown.** Read that worktree first: commits mean salvage, a dirty tree with no commit means re-run.

**Dirty worktrees: four.** `ticket-528-icon-mock` is the live worker above.
`orb-70-android-widget` has 34 files and `ticket-351-primitives` has 179, both last committed
2026-08-25; `ticket-174-measure` has 1. The last three are old and block nothing. Leave them.

**Stashes: 4 in `orbit-ui-mobile`, 0 in `orbit-api`, 0 in `orbit-landing-page`.** Every owning ticket
shipped. Leave them.

**Detached HEADs: two, both safe.** `ticket-397-accent` at `a27a8e43` and `ticket-468-control` at
`f1b2991c`. Both commits are already in `redesign/main`.

**Unpushed commits: one branch.** `feature/ticket-335-avisos`, 11 ahead and 102 behind. Its pull
request 843 merged on 2026-09-07 at the same tip, so these are pre-squash originals. Nothing to save.

**The main checkout is CLEAN**, on `redesign/main`.

**Ignored paths and the scratchpad.** The previous session's scratchpad holds `sleep-decisions.md`,
the decision log for the night of 2026-09-13, plus worker orders and pull request body drafts. Every
durable fact in it is already in the spec. It dies with that session.

## What to do, in order

1. **Run `#530` first.** A local mobile suite is red on one calendar case for reasons unrelated to
   any branch, and every salvage in this effort depends on reading a local suite correctly.
2. **Clear and merge 948, 947 and 946**, in whatever order their reviews come back. All three target
   `redesign/main` and merge under D90 with green checks, a fresh Pullfrog approval at the exact head
   and zero unresolved threads. Use `gh pr merge --squash --match-head-commit <full sha>`.
3. **Run `#527`, then drive 939, then 940.** That is the whole remaining calendar. 940 is already
   approved and needs only a base merge once 939 lands.
4. **Then the next stages.** Perfil `#71` stages 7, 8 and 9. About `#73` stage 3 and stages 5 to 8.
   Wrapped `#63` stages 3 to 7. Progresso `#329` stages 4 to 7 plus six accessibility sweeps.
   Onboarding `#67`, all stages.
5. **Leave `#529` and `#526` for Thomas to merge**, and say so plainly in the wake report.

## --sleep

This run continues unattended. Take every decision yourself, always the best approach and never the
easiest, write each one to a decision log in your own scratchpad as it is made, and keep shipping
until he says stop. The sleep skill carries the rest.
