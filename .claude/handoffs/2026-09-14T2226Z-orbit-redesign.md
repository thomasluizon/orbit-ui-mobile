Read `.claude/specs/orbit-redesign.md` first. It carries the standing instructions, the decisions,
the constraints and the state. This prompt only says what to do next.

Two standing instructions changed on 2026-09-14 and they change what you are allowed to do:
**copy is yours to write**, and **you merge `orbit-api` pull requests yourself**. The spec has his
words. Do not hand either back to him.

Every identifier below came from a previous session. Treat each as a lead to verify, not a fact.
All of it was read live on 2026-09-14 at 22:26 UTC.

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line. Only `launch-worker.mjs` and `submit-cloud-worker.mjs --watch`
register one; a backgrounded shell command does not, and this session named one as a wake source and
was caught by the Stop hook.

`.claude/rules/core.md` carries the operating contract, D89 and D90 included.

## The job

**Finish the redesign.** Not the open pull requests, the redesign. The run ends when every screen
ticket is closed and the whole thing is ready to ship, and until then the queue is never empty: when
you land the last thing in flight, take the next screen.

`redesign/main` is `35c17cf3`. Two pull requests merged tonight, 947 and 955. **Nothing waits on
Thomas any more.** Copy is yours and api merges are yours, so there is no human gate left in this
effort.

Ten screen tickets are still open, read live 2026-09-14 at 22:26 UTC:

    53  Goals: view, card, create, edit and detail (R6)
    56  calendar and calendar sync (R8)
    57  streak page, sections and freeze surfaces (R9)
    58  achievements (R10)
    63  insights, retrospective and wrapped (R12)
    67  onboarding, tour and feature guide (R14)
    71  settings: preferences, advanced, profile, account, notifications, API keys (R16)
    73  about, privacy, terms and support (R18)
    74  the whole-app copy voice pass over 2,905 i18n keys (R19)
    76  the Android home-screen widget (R21)

The spec calls some of these finished. **Verify each against the tree and its own stage list before
you believe either the spec or the ticket**, then close the ones that are genuinely done. A ticket
left open because nobody closed it and a ticket open because work remains look identical from here.

Plus, on Progresso: `#472`, `#473`, `#476`, `#477`, `#478` and `#480`, the six accessibility and
interaction sweeps, and `#356`, regenerating the redesign coverage mapping against the 21 canvas
documents. `#356` is how you check your own completion claim, so run it before declaring anything
done.

Run local, batched. `caps.workerLaunchesPerBranch` is 2 once 964 merges, and the reason is real: this
session spent 1.39M Codex tokens over 14 worker runs at `gpt-5.6-sol` with
`model_reasoning_effort="high"`, and Thomas flagged 75% of the weekly allowance gone with 4 days
left. **Batch a review's findings into ONE order** and use `--tier mechanical` for merge-forwards and
test rounds once it exists.

## In flight, with a disposition for each

**Running worker, outcome unknown.** Worktree
`C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-63-wrapped-s4`, branch
`feature/ticket-63-wrapped-s4`, log `%TEMP%/orbit-workers/ORB-57-1789424689380.log`. Sent to write
the Wrapped weekday interpretation with its four strings and an explicit thin predicate. Read that
worktree first: a finished worker leaves commits, a dirty tree, or nothing, and each means something
different.

**Open pull requests, `orbit-ui-mobile` (19; the 4 dependabot ones on `main` are not this effort).**

| PR | base | head | disposition |
|---|---|---|---|
| 960 | `redesign/main` | `49f1a248` | the running worker owns it. Verify, then drive it green |
| 961 | 960's branch | `8054c269` | **one thing left**: label the goal figure "Goals closed" / "Metas fechadas" in `shareCard.stats.*`, on the card AND the goals slide. Both borrow `progressScreen.sections.goals` today |
| 962 | 961's branch | `6e40e930` | APPROVED, CLEAN. Merge when 961 does |
| 963 | 962's branch | `b34c0d88` | APPROVED, CLEAN. Merge when 962 does |
| 894 | `redesign/main` | `53c49044` | needs api 518 merged. Then clear its one finding |
| 956 | 894's branch | `b49b420d` | APPROVED, CLEAN |
| 957 | 956's branch | `5812ff33` | APPROVED, CLEAN |
| 958 | 957's branch | `5ffa297f` | CI pending. Its web half was never run locally, because that suite launches Chrome and workers may not |
| 959 | 958's branch | `4557939f` | APPROVED, CLEAN |
| 953 | `redesign/main` | `57b82334` | write copy items 1 and 2 from the spec, then merge. Unblocks 954 |
| 954 | 953's branch | `1c156658` | APPROVED, zero threads |
| 951 | `redesign/main` | `90c49dce` | **DIRTY.** Merge-forward first, then copy items 3 and 4 |
| 964 | `redesign/main` | `94701d56` | awaiting `pullfrog-approval`. Three races already fixed; no further change known to be needed |
| 965 | `redesign/main` | `4b8d043b` | APPROVED, CLEAN. Merge it |
| 890 | `redesign/main` | `df2d862d` | leave it. The spec says why |

**Open pull requests, `orbit-api` (7).**

- **518** `9765492f` on `redesign/main`, CLEAN, zero threads, no `pullfrog-approval` at that head yet.
  **Merging it releases 894, 956, 957, 958 and 959.** Its last two Pullfrog reviews are DISMISSED
  from 09-11 at old commits, so it needs a fresh review.
- **523** `1ccb2d8f` on `redesign/main`, APPROVED and CLEAN. Mergeable now.
- **521** `cc86c612` on `main`, CHANGES_REQUESTED. A live calendar timezone defect, not redesign work.
- **520** `ce610484` on `main`, BLOCKED. Gating matrix tooling, not redesign work.
- 512, 511, 510 are dependabot on `main`.

**Branches with work and no pull request: none.** Wrapped stage 7 became 963.

**Dirty worktrees: four, all in `orbit-ui-mobile`, all last touched 2026-08-25 and blocking nothing.**
`orb-70-android-widget` 34 files, `ticket-351-primitives` 179, `orb65-red-evidence` 4,
`ticket-174-measure` 1. Leave them. `orbit-api` has none.

**Stashes: 4 in `orbit-ui-mobile`, 0 in `orbit-api`.** Every owning ticket shipped. Leave them.

**Detached HEADs: three, all safe**, commits already reachable.

**Tickets: 123 `repo:ui`, 66 `repo:api`.** Filed 2026-09-14 and not started: `#535` layout guard has
no 320px width, `#536` worker cost (pull request 964), `#537` batch Pullfrog fixes and route
mechanical orchestrator work, `#538` readiness identity (pull request 965). `#534` is fixed inside
961; close it when that lands.

**Ignored paths.** This session's scratchpad holds `sleep-decisions.md`, 62 logged decisions. Every
durable fact is in the spec. It dies with the session.

## What to do, in order

1. **Read the running worker's worktree** and drive 960 to green.
2. **Merge `orbit-api` 518**, then 523. 518 releases five UI pull requests. It needs a fresh Pullfrog
   review at `9765492f` first.
3. **Label the goals figure on 961**, then merge the Wrapped stack in order: 960, 961, 962, 963.
4. **Write 953's two strings and merge 953, then 954.** That finishes Perfil.
5. **Merge-forward 951, write its two strings, merge it.**
6. **Drive Progresso once 518 is in**: 894, then 956, 957, 958, 959.
7. **Merge 965, then 964** once its review lands.
8. **Then About stages 3, 6, 7 and 8, and onboarding, the tour and the feature guide.** All copy,
   all yours, none blocked.
9. **Then keep going down the screen list above** until every R ticket is closed. Take them in the
   order that unblocks the most: a screen nothing is stacked on before one that is.
10. **Then run `node tools/redesign-coverage.mjs --json`** and close the effort against what it
    reports, not against this prompt. If it lists a surface nobody rebuilt, that surface is the next
    ticket.

**Do not stop because the pull requests ran out.** That is the middle of the job, not the end. The
end is every screen ticket closed and the coverage mapping clean.

## When this run is allowed to end

**Only when `.claude/specs/orbit-redesign.md` is done.** Nothing else is an ending, and a blocker
least of all. This is not a `--sleep` rule; it is how every run against a spec works.

His words, 2026-09-14: "ANY RUN ends only when the original spec is done ... anytime i run /handoff,
the handoff needs to list a clear goal: finish the original spec. if its not done, then your work is
not done, and if it means fixing blockers, taking decisions, whathever it takes, you will do it,
until the spec is finished with the best approach possible ... theres no blocker impossible of being
fixed by you, you create the blockers, you fix them, always doing the best approach."

So:

- **Waiting on CI or a review is waiting, not blocking.** Start the next thing while it runs.
- **A stacked child is not blocked; its parent is the work.** Go do the parent.
- **A finding too large for the pull request it appeared in becomes its own ticket AND you pick that
  ticket up.** Filing it is not a disposition.
- **A missing capability is built.** A missing branch, gate, tier, test harness or tool is created,
  not reported. `orbit-api` had no `redesign/main` on 2026-09-14 and that was treated as a blocker
  for hours; creating it took one command.
- **A recorded blocker in the readiness ledger is a TODO, not a finish line.** This session ended a
  turn as BLOCKED with six ledger rows. That was wrong, and it is why you are reading this section.

Re-derive what is left rather than trusting this prompt:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200

Every open ticket whose scope falls inside `.claude/specs/orbit-redesign.md` is still your work. The
spec is the goal; this prompt is only where to start.

The only honest early ending is external: the Codex allowance is exhausted, the machine stops, or
Thomas says stop. Say which one it was, and never report it as the work being finished.

## --sleep

This run continues unattended. Take every decision yourself, always the best approach and never the
easiest, write each one to a decision log in your own scratchpad as it is made, and keep shipping
until he says stop. The sleep skill carries the rest.

Four rules that cost real work on 2026-09-14:

- **Read every worker's `## Assumptions` even on a clean exit.** One claimed the API had no
  goal-completion producer; it has had one since api `#484`.
- **Grep for the behaviour, not the identifier you expect.** Twice this cost a wrong conclusion: a
  Perfil row that exists as `shareCard.entry`, and an Expo function that is re-exported with
  `export *` so its name appears nowhere in the index.
- **A test that has only ever been green has not been shown to notice anything.** Reproduce the break
  first, every time. Six findings this session were exactly this defect.
- **Never ask him a question whose recommended answer is obviously right**, and if you do run
  `/questions`, ask every survivor in rounds of four until none is left.
