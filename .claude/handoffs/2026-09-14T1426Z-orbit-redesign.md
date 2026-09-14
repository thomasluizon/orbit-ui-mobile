Read `.claude/specs/orbit-redesign.md` first. It carries the standing instructions, the decisions,
the constraints and the state. This prompt only says what to do next.

Every identifier below came from a previous session. Treat each as a lead to verify, not a fact.
All of it was read live on 2026-09-14 between 14:10 and 14:26 UTC.

**The machine was restarted after this was written. Every worker is gone. Start them from scratch.**

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line.

`.claude/rules/core.md` carries the operating contract, D89 and D90 included.

## The job

`redesign/main` is `b9855b91`. Seven pull requests merged on the night of 2026-09-13 into 09-14.
Thirteen are open, and **almost all of them are stacked behind just three blockers**. Clear those
three and most of the queue lands.

Run local. Codex Cloud's circuit breaker opened after two empty diffs, and the harness killed three
concurrent background tasks for low memory with 12 GB free, so **one worker at a time** is the real
capacity until proven otherwise.

## In flight, with a disposition for each

Recount before acting.

**Open pull requests, `orbit-ui-mobile` (18 total; 4 are dependabot on `main`, leave them).**

| PR | base | head | disposition |
|---|---|---|---|
| 947 | `redesign/main` | `f5a373e3` | **Blocker 1.** Bounded fixer exhausted. One finding: `wrapped-styles.ts:84` puts `coverExit` at `top: 8` inside a `SafeAreaView`, so Android's only exit sits under the status bar. Fix with `useSafeAreaInsets()` and a non-zero-inset test. Unblocks 955, 960, 961, 962 and the stage 7 branch. Its GitHub `reviewDecision` says APPROVED and is STALE; `pullfrog-approval` is FAILURE |
| 953 | `redesign/main` | `57b82334` | **Blocker 2.** Structurally complete. Blocked on two contradicting strings, items 1 and 2 of Copy waiting on Thomas. Unblocks 954 |
| 894 | `redesign/main` | `53c49044` | **Blocker 3.** Waits on `orbit-api` 518 deploying. Unblocks 956, 957, 958, 959 |
| 954 | 953's branch | `1c156658` | APPROVED, zero unresolved threads. Merges as soon as 953 does |
| 959 | 958's branch | `4557939f` | APPROVED |
| 951 | `redesign/main` | `90c49dce` | About stage 5. Blocked on copy items 3 and 4 |
| 955 | 947's branch | `8fc85676` | Wrapped stage 3, opened. Retires 5 suppressions |
| 960 | 955's branch | `e0ac75a0` | Wrapped stage 4, opened. Four strings blocked, copy item 7 |
| 961 | 960's branch | `748056b3` | Wrapped stage 5. **CHANGES_REQUESTED, three open P1s**: Android's outbound payload lost its referral URL, the wide action layout is hard-coded inside the narrow Pager, and a cancelled picker becomes a generic error. Clear these |
| 962 | 961's branch | `511a1145` | Wrapped stage 6, opened, reviewing |
| 956, 957, 958 | chained on 894 | `a1ea421f`, `747fd066`, `a754796e` | Progresso stages 4, 6, 7, opened. 958 carries one authored string, copy item 5 |
| 890 | `redesign/main` | `df2d862d` | leave it. The spec says why |
| 881, 801, 799, 798 | `main` | | dependabot, not this effort |

**Open pull requests, `orbit-api` (7). Three are this effort's and NONE merges unattended:**

- **523** `1ccb2d8f`, opened 2026-09-14 for `#532`, the support entry-point intent. Ready for Thomas.
- **521** `cc86c612`, CHANGES_REQUESTED, delivers `#526`.
- **518** `6ac02c2a`, delivers `#505`. **Merging and deploying this unblocks 894 and four more.**

**Branch with work and no pull request: one.** `feature/ticket-63-wrapped-s7` carries
`dd337cc3 feat: add Wrapped entry routes`, pushed after its worker was stopped mid-run. Wrapped
stage 7 is the ways in: the period-closed notification route, Progresso's fallback entry at its top,
and Perfil keeping its row. **Nobody verified it.** Read it, finish it, open its pull request.

**Dirty worktrees: five.** `ticket-63-wrapped-s7` has 2 snapshot files, one of which is the known
CRLF flip. `orb65-red-evidence` has 4 and is a detached-HEAD scratch worktree from a guard proof.
`orb-70-android-widget` has 34, `ticket-351-primitives` has 179 and `ticket-174-measure` has 1, all
last touched 2026-08-25. The last three are old and block nothing. Leave them.

**Stashes: 4 in `orbit-ui-mobile`.** Every owning ticket shipped. Leave them.

**Detached HEADs: three, all safe.** `orb65-red-evidence` at `20d729c6`, `ticket-397-accent` at
`a27a8e43`, `ticket-468-control` at `f1b2991c`.

**Running workers: NONE.** The machine was restarted.

**Tickets filed 2026-09-14, none started:** `#531` the icon-only button word cap, `#532` the support
entry-point intent (pull request 523 exists), `#533` Perfil's Support row, blocked by 532.

**Ignored paths.** The previous session's scratchpad holds `sleep-decisions.md`, 87 logged decisions
for 2026-09-14. Every durable fact in it is in the spec. It dies with that session.

## What to do, in order

1. **Fix 947's one finding and merge it.** It is one line plus a test and it unblocks five things.
2. **Clear 961's three P1 findings.** They are real: a lost referral URL, a wide layout inside the
   narrow Pager, and a cancelled picker shown as an error.
3. **Merge the Wrapped stack in order** once 947 lands: 955, 960, 961, 962, then finish stage 7.
4. **Merge 953 and then 954** once Thomas answers copy items 1 and 2. That finishes Perfil.
5. **Once Thomas merges and deploys `orbit-api` 518**, drive 894, then 956, 957, 958, 959. That
   finishes Progresso.
6. **Then About.** Stages 3, 6, 7 and 8 are ALL copy work, so they need his words before a worker
   starts. Onboarding is the same. Say so rather than starting and stalling.

## --sleep

This run continues unattended. Take every decision yourself, always the best approach and never the
easiest, write each one to a decision log in your own scratchpad as it is made, and keep shipping
until he says stop. The sleep skill carries the rest.

Three rules that cost real work on 2026-09-14, in the spec but worth repeating once:

- Read every worker's `## Assumptions` even on a clean exit. One deleted a shipped feature there.
- Check the ticket's requirements against the TREE, not the worker's report. One reported success
  with a named requirement absent.
- Grep for the behaviour, not the identifier you expect. Searching for the wrong name produced a
  confident false claim that a feature was missing.
