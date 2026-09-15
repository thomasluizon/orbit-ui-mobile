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
job. The run ends when every screen ticket is closed and `node tools/redesign-coverage.mjs --json`
reports a mapping with nothing missing. Until then the queue is never empty.

Re-derive what is left rather than trusting this prompt:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200

Ten screen tickets are open: `#53`, `#56`, `#57`, `#58`, `#63`, `#67`, `#71`, `#73`, `#74`, `#76`.
**`#356` gates every completion claim** and is stale in a way you can see: `R6-screen-goals`,
`R9-screen-streak` and `R10-screen-achievements` hold zero surfaces. Run it before closing anything.

## In flight, with a disposition for each

**Two running workers, outcome unknown.** Read both worktrees first; a finished worker leaves
commits, a dirty tree, or nothing, and each means something different.

| worktree | branch | log | sent to do |
|---|---|---|---|
| `C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-71-perfil-s8` | `feature/ticket-71-perfil-s8` | `%TEMP%/orbit-workers/ORB-65-1789435637388.log` | 953 round 5: drop "after your plan ends" from `warningPro`, fix the `Auth/Commands` WHY path |
| `C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-540-mobile-icu` | `fix/ticket-540-mobile-icu` | `%TEMP%/orbit-workers/#540-1789435156700.log` | `#540`: wire a real ICU parser into mobile i18next, with a test that renders through the REAL config |

**Open pull requests, `orbit-ui-mobile` (15; the 4 dependabot ones on `main` are not this effort).**
Read live 2026-09-15 at 01:29 UTC.

| PR | base | head | disposition |
|---|---|---|---|
| 960 | `redesign/main` | `ef6b0c8d` | request a review; four rounds are done and no further change is known to be needed |
| 961 | 960's branch | `6051de1f` | **DIRTY.** Merge 960 forward, then ONE job: point the SHARE CARD at `shareCard.stats.goalsClosed`. 960 already owns the key and the slide |
| 962 | 961's branch | `6e40e930` | APPROVED, CLEAN. Merge when 961 does |
| 963 | 962's branch | `b34c0d88` | APPROVED, CLEAN. Merge when 962 does |
| 894 | `redesign/main` | `854ad507` | request a review; three rounds are done |
| 956 | 894's branch | `b49b420d` | APPROVED, CLEAN |
| 957 | 956's branch | `5812ff33` | APPROVED, CLEAN |
| 958 | 957's branch | `5ffa297f` | **three open P1 findings, spec already posted on `#329`.** This is the largest unstarted piece of the Progresso stack |
| 959 | 958's branch | `4557939f` | APPROVED, CLEAN |
| 953 | `redesign/main` | `aef33003` | the running worker owns it. Verify, then drive it green |
| 954 | 953's branch | `1c156658` | APPROVED, zero threads. Merge when 953 does |
| 951 | `redesign/main` | `182fef4e` | one finding: restore the canvas Send-disabled rule. Spec posted on `#73` |
| 964 | `redesign/main` | `94701d56` | blocked on the `SKILL.md` doc change. See the spec's own section |
| 890 | `redesign/main` | `df2d862d` | same blocker as 964 |

Every one of 890, 894, 951, 953, 958, 960, 961 and 964 has `pullfrog-approval` FAILURE. 954, 956,
957, 959, 962 and 963 are SUCCESS and need only their parents.

**Open pull requests, `orbit-api` (5).** 521 (`cc86c612`, `main`, a live calendar timezone defect)
and 520 (`ce610484`, `main`, gating matrix tooling) are not redesign work. 510, 511 and 512 are
dependabot. **No `orbit-api` pull request is blocking the redesign any more.**

**Branches with work and no pull request:** `fix/ticket-540-mobile-icu` only, because its worker has
not finished. Every other redesign branch has one.

**Unpushed commits:** none, on any of the six active branches. Checked.

**Dirty worktrees: six.** Two are the running workers above. The other four are
`orb-70-android-widget` 34 files, `ticket-351-primitives` 179, `orb65-red-evidence` 4,
`ticket-174-measure` 1, all last touched 2026-08-25 and blocking nothing. Leave them.

**Stashes: 4 in `orbit-ui-mobile`, 0 in `orbit-api`.** Every owning ticket shipped. Leave them.

**Detached HEADs: three, all safe**, commits already reachable. `orbit-api` has no dirty worktree and
no stash.

**Ignored paths.** This session's scratchpad holds `sleep-decisions.md`, 72 logged decisions. Every
durable fact is now in the spec. It dies with the session.

**Tickets: 124 `repo:ui`, 67 `repo:api`.** `#538` is still OPEN although `ui#965` merged it; close
it. `#539` is closed by `api#524` and `#534` closes when 960 lands.

## What to do, in order

1. **Read both running worktrees** and drive 953 and `#540` to green.
2. **Land `#540` early.** Eleven ICU strings render as garbage on Android right now, and both 960 and
   894 added plural strings that are broken until it merges.
3. **Merge-forward 961, point the share card at the new key, then merge the Wrapped stack in order:
   960, 961, 962, 963.**
4. **Take 958's three findings in ONE order**, then merge the Progresso stack: 894, 956, 957, 958, 959.
5. **Restore the canvas Send rule on 951, then merge 951.** That unblocks About stages 6, 7 and 8.
6. **Merge 953, then 954.** That finishes Perfil.
7. **Decide the `SKILL.md` question and land 890, 964 and `#537` together.** The spec's own section
   sets out the conflict; it is a decision to take, not a blocker to report.
8. **Then About stages 3, 6, 7 and 8, `#76`'s stage 8, onboarding, and the six Progresso sweeps.**
9. **Then the rest of the screen list**, taking the screen nothing is stacked on before one that is.
10. **Then run `node tools/redesign-coverage.mjs --json`** and close the effort against what it
    reports, not against this prompt.

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

Five things that cost real work on 2026-09-14 and 09-15:

- **Check copy that carries a number or a date against the rule that produces it.** Three strings
  written in one night were each wrong that way, and one of them told trial accounts they had 30 days
  when the server gives them 7.
- **Verify a Pullfrog finding against the tree before spending a worker on it.** Two were already
  fixed. Equally, verify one you are about to refuse: the canvas Send rule was real and the override
  was mine.
- **Never hand a worker a caller list from memory.** Grep for the behaviour. Two lists were wrong.
- **A COMMENTED review with an empty body and zero threads still leaves `pullfrog-approval` red.**
  Only `--re-review` flips it.
- **`compose-prompt.mjs` appends every ticket comment, newest last.** With several branches live on
  one ticket, post a routing comment last saying which branch runs which stage.

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact. All
of it was read live on 2026-09-15 at 01:29 UTC.
