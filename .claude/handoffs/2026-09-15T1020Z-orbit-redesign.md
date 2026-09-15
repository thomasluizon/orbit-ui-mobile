Read `.claude/specs/orbit-redesign.md` first. It carries the standing instructions, the decisions,
the constraints and the state. This prompt only says what to do next.

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line. Only `launch-worker.mjs` and `submit-cloud-worker.mjs --watch`
register one.

`.claude/rules/core.md` carries the operating contract, D89 and D90 included.

## The goal

**Finish `.claude/specs/orbit-redesign.md`.** Not the open pull requests: those are the middle of the
job. The run ends when every screen ticket is closed and `node tools/redesign-coverage.mjs` reports a
valid mapping with nothing missing. Until then the queue is never empty.

That command WORKS now. `#356` merged, so it validates 190 surfaces across the 21 canvas documents,
8 deleted and 3 named exclusions, and it fails on an invented document, a missing one, or a live
surface hidden in the tombstone list. It is the completion gate; run it before closing anything.

Re-derive what is left rather than trusting this prompt:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200

121 `repo:ui` tickets are open. Eleven are screens: `#53`, `#56`, `#57`, `#58`, `#63`, `#67`, `#71`,
`#73`, `#74`, `#76`, `#329`. `#76`'s work is complete and it can close once you judge it against the
coverage command.

## In flight, with a disposition for each

**Running workers: none.** The Codex allowance ran out at 08:30 UTC and Thomas reset it by hand at
about 10:20. Nothing is mid-flight.

**Open pull requests, `orbit-ui-mobile`.** Read live 2026-09-15 at 10:20 UTC. Four dependabot ones on
`main` are not this effort.

| PR | base | head | disposition |
|---|---|---|---|
| 954 | `redesign/main` | `efa88425` | merged forward and CLEAN. A review was requested at 10:05 and had not landed. Poll, then merge |
| 957 | `redesign/main` | `2bd5ce88` | same shape as 954. Poll, then merge |
| 961 | `redesign/main` | `0a5ad417` | CLEAN except SonarCloud, which does not gate `redesign/main`. Poll, then merge |
| 958 | 957's branch | `b6fb6396` | CONFLICTING. Merge-forward after 957 lands. Its own findings are all resolved |
| 959 | 958's branch | `4557939f` | APPROVED and clean. Merge when 958 does |
| 962 | 961's branch | `6e40e930` | APPROVED, CONFLICTING. Merge-forward after 961 lands |
| 963 | 962's branch | `b34c0d88` | APPROVED and clean. Merge when 962 does |

**Open pull requests, `orbit-api`.** 521 (`cc86c612`, the live calendar timezone defect `#526`) is
CHANGES_REQUESTED and 520 (`ce610484`, gating matrix tooling) is BLOCKED on review. Neither is
redesign work, so Thomas's standing instruction routes both to `main`: clear their findings and merge
them. Three dependabot ones sit beside them. `orbit-api` has no dirty worktree and no stash.

**Uncommitted work that matters, exactly one item.**
`C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-73-static-s5`, branch
`feature/ticket-73-static-s678` cut from `56ddfdd6`, holds 8 modified files, +263/-61: About stages 6,
7 and 8. It is **WEB ONLY**, so it fails Cross-Platform Parity as it stands. Read it, then either
finish it with a worker or reset it and order the stage cleanly. Do not push it half done.

**Every other dirty worktree, stash and detached HEAD is old debt and blocks nothing.** The spec's
constraints section lists them with the two that look like lost commits and are not.

**Branches with no pull request:** only `feature/ticket-73-static-s678`, because its work is
unfinished.

**Ignored paths.** The previous session's scratchpad holds `sleep-decisions.md`, 99 logged decisions.
Every durable fact is now in the spec. It dies with that session.

## What to do, in order

1. **Merge what is already clean**: 954, 957, 961. Each needs only a Pullfrog review of its current
   head; requests went out at about 10:05.
2. **Unwind both stacks**: merge-forward 958 then merge it and 959; merge-forward 962 then merge it
   and 963. Measure each branch's OWN diff first and put the figure in the order, the way the spec's
   stage section describes.
3. **Finish About**: decide the fate of the half-built stages 6 to 8, then stage 3.
4. **Then `#76`**, which needs only judging against the coverage command and closing.
5. **Then the rest**: the six Progresso sweeps, `#67` onboarding, `#53` Goals, `#74`'s copy pass.
6. **Then run `node tools/redesign-coverage.mjs`** and close the effort against what it reports, not
   against this prompt.

## When this run is allowed to end

**Only when the spec is done.** A blocker is the next piece of work, never an ending. Waiting on CI
or a review is waiting: start the next thing while it runs. A stacked child is not blocked; its
parent is the work. A finding too large for its pull request becomes a ticket AND you pick it up. A
missing capability is built.

The only honest early ending is external: the Codex allowance is exhausted, the machine stops, or
Thomas says stop. Say which one it was, and never report it as the work being finished.

## --sleep

This run continues unattended. Take every decision yourself, always the best approach and never the
easiest, write each one to a decision log in your own scratchpad as it is made, and keep shipping
until he says stop.

Five things that cost real work on 2026-09-15, none of them in the spec's general sections:

- **Run one local worker at a time on this machine.** The host's memory guard killed two workers and
  three background waiters in one go with 8.5 GB free. Poll reviews inline rather than holding
  background waiters open.
- **A merge-forward and any order that reads another branch must run LOCAL.** A Cloud container has
  no origin remote and cannot fetch.
- **Run `npm run type-check` from the repository ROOT after every round.** Per-workspace runs never
  reach `packages/shared`, and that gap shipped five type errors from containers that looked green.
- **Read only the LATEST check run per name.** A superseded run's `failure` sits on the same commit
  and reads as red.
- **Pullfrog posts empty-bodied COMMENTED reviews while it works**, and `list-bot-threads.mjs`
  returns on the first one. The verdict is `pullfrog-approval` at the exact head.

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact. All
of it was read live on 2026-09-15 at 10:20 UTC.
