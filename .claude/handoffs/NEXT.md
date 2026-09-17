# Work the batches to a production release

Read `.claude/specs/orbit-prod-release.md` first, and read `## The order` in it before anything
else. That spec is the living record: the standing instructions, the decisions, the constraints, the
full state and every answer Thomas has given. **It was renamed from `orbit-redesign.md` on
2026-09-17**, when he widened the goal from finishing the redesign to clearing the whole board.

`.claude/specs/beta-release.md` is the record for work that ships off `main`. Read its constraints
once; they bite on any `main` work.

**Read the brain notes the spec names before you act**, through the Obsidian MCP:
`mcp__obsidian__obsidian_list_notes`, then `mcp__obsidian__obsidian_get_note`. List the
`Decisions/` directory and copy the filenames that come back rather than the ones you remember. On
2026-09-16 the MCP was unreachable and the check fell back to frontmatter on disk; backlinks were
never read. Re-confirm through the MCP when it is up.

## Your entry point

`/sleep`. It enters `/orchestrate --sleep` itself, so do not treat them as two choices. Do not
restate what either one does; work through them.

## The goal

**Finish `.claude/specs/orbit-prod-release.md`**, which means an empty board and a production
release. The order is fixed and it is in that spec. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400
    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh pr list --repo thomasluizon/orbit-api --state open
    gh pr list --repo thomasluizon/orbit-landing-page --state open

A blocker is the next piece of work, not an ending.

## The order, and it is not negotiable

Thomas set this on 2026-09-17. Work it in this sequence, and read the spec's `## The order` for the
reasoning behind each batch and its full ticket list.

1. **Batch 0a: `#585`.** The tools harness is 1,707 serial assertions, about ten minutes, with no way
   to run less of it, and `CLAUDE.md` requires it after any change under `tools/**` or `.claude/**`.
   It gates every harness change in every batch below and it has already been starved twice on this
   machine. Add `--only <name>`, keep the full run as the default and the gate, print elapsed time
   and assertion count, decide parallelism on a measurement.
2. **Batch 0b: the harness, 25 tickets.** He moved this to the front: "i want this batch before the
   redesign." Re-read each against the tree first; several describe a state the last two weeks
   already changed.
3. **Batch 0c: the live Android defect.** 1011 is READY: merge it to `main`, then `/android-release`
   to the open track on his standing permission. Then `#574`, `#563`, `#134`.
4. **Batch 1: close the redesign.** The eleven remaining redesign pull requests, then the open
   `539 Redesign` screen tickets. Done when every screen ticket closes against its own acceptance
   criteria AND `node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing.

## THE REDESIGN GATE. Stop here.

His words, 2026-09-17:

> work the batches until the redesign finishes, when it finishes, i will test everything in the
> redesign/main branch, when i approve everything, THEN we merge to main, and only then the redesign
> is finished and we can continue to the other batches

So when batch 1 closes:

1. **Ship `redesign/main` to a CLOSED Play INTERNAL track** with `/android-release`. Answered
   2026-09-17: he tests it as a real update, not a sideloaded file. Not the open track. Not `main`.
2. **Tell him it is ready to test, and STOP.** Do not merge. Do not start batch 2a. Do not start
   anything else in the spec. Waiting on him here is a legitimate ending under `/sleep`, reported as
   blocked on his approval, never as finished.
3. On his explicit approval: merge `redesign/main` into `main`, then `/android-release` to the OPEN
   track. The redesign is finished at that merge and not before it.
4. Batch 2a starts after that release. The order after the gate, reworked with him on 2026-09-17 so
   the store and the landing page stop showing a product that no longer exists:
   **2a** the twelve API contracts the UI waits on, **2b** every remaining ticket that changes what a
   person sees (the UI those contracts unblock, the design-system corrections, the packaging copy),
   **3** the landing page and the Play listing TOGETHER, **4** the component-library migration, which
   changes zero visuals, **5** Astra, **6** security, correctness and the deletions, **7**
   `/prod-readiness` and every finding it raises. The spec carries the ticket list and the reasoning
   per batch.

## In flight, with a disposition on every row

**Two pull requests are READY right now.** Nothing is blocked; each other row is one round of work.

| PR | base | head | disposition |
|---|---|---|---|
| 1011 | `main` | `719a771a` | **READY.** APPROVED at head, `pullfrog-approval` SUCCESS, zero reds, zero pending, zero threads. Merge first, then release. |
| 1008 | `redesign/main` | `c7d60ad0` | **READY.** Same condition met. 116 suppressions. Merge second. |
| 1010 | `chore/ticket-560-sweep-order` | `d5f7178f` | `#570`, stacked on 991. **Retarget onto `redesign/main` BEFORE 991 merges**, or merging the parent auto-closes it. |
| 1007 | `redesign/main` | `a128ca12` | `#67`. Three P1s, order posted on the ticket. |
| 1005 | `redesign/main` | `1c4e90fd` | `#73`. Worker reaped mid-round, worktree DIRTY with two unfinished test files. **Relaunch**, do not push. |
| 1004 | `redesign/main` | `e002e817` | `#57`. Order posted. |
| 1003 | `redesign/main` | `b52e3d79` | `#63`. Order posted. |
| 1002 | `redesign/main` | `baeec3dc` | `#545`. No review at head; request one. |
| 1001 | `redesign/main` | `744173b3` | `#562`. Order posted. |
| 994 | `redesign/main` | `1b0fdb44` | `#557`. Commit `b4338304` is in the worktree, CLEAN, **unpushed**. Verify and push it. |
| 992 | `redesign/main` | `fb520fb1` | `#543`. Order posted. |
| 991 | `redesign/main` | `3cda0bd9` | `#560`. Worktree DIRTY on purpose, mid red experiment. Finish it. |
| 970 | `redesign/main` | `b56d1b5e` | `#558`. CHANGES_REQUESTED. Order posted. |
| api 528 | `main` | `dfb885b3` | `#529`. Order posted; its open question is answered from the source. |
| api 521 | `main` | `44611e5f` | `#526`. Order posted. |
| Dependabot | both | ui 798/799/801/881, api 510/525/526 | Leave. Not this effort. |

`orbit-landing-page` has 5 open pull requests, untouched by this effort; batch 3 owns that repo.

**Four codex processes were alive at handoff.** Read every worktree before assuming anything: a
finished worker leaves commits, a dirty tree, or nothing, and each means something different.
Stashes: none, in any repository. `orbit-api` and `orbit-landing-page` checkouts: clean.

## How to decide a merge

**An APPROVED Pullfrog review is not the verdict.** A later review of the SAME head supersedes it.
1008 proved it live on 2026-09-17: `APPROVED@12:47:26` then `COMMENTED@12:53:10` on one commit,
carrying two new P1s, one of which was a name collision that would have shipped.

Decide every merge on **the LAST Pullfrog review of the exact head being APPROVED AND the newest
`pullfrog-approval` check run at that head concluding `success`**, ignoring SonarCloud only when the
base is `redesign/main`. When `pullfrog-approval` is ABSENT rather than failing, an APPROVED review
at the exact head stands in for it.

**Rebuild the tool that does exactly that read.** It lives in a scratchpad that dies with its
session, and it is about five minutes: last bot review at head, newest check run per NAME, unresolved
bot threads, and reds excluding SonarCloud.

Three cheap things that save real time:

- `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0` is the read.
  Without those flags it posts `@pullfrog review` and waits up to fifteen minutes.
- That tool RECORDS every thread id it prints, which is what clears
  `forbid-invented-identifier.mjs`. An id read through raw GraphQL is refused even when correct.
- **`--match-head-commit` takes the FULL sha, COPIED from `gh pr view --json headRefOid` in this
  run.** A reconstructed one is refused with `Head branch was modified`, which is the guard working.

## What cost real work on 2026-09-17

- **A ticket that reads blocked is a lead, not a fact.** Three were wrong in one night.
- **An already-done ticket gets a comment and a closure, never an empty pull request.** `#329` closed
  that way, with a per-criterion table checked against the tree.
- **A fresh worktree has NO `node_modules`.** Run `npm install` and confirm ~960 entries before
  composing the prompt.
- **A pull request body can lose every newline**, and then a heading is not a heading. Read it as the
  gate reads it before re-running a sweep.
- **A ticket body can carry an instruction that is actively wrong.** Post the correction to the
  TICKET before composing, because the worker reads comments and not your reasoning.
- **Check the sibling before you change a string.** `Mark read` was chosen for the bulk notification
  control without reading the single-item control, which already said `Mark read`. The review caught
  two identical names on one surface.
- **Claude Code's background-shell reaper is not a worker kill.** It stopped five tasks on
  2026-09-17 for low memory and says not to restart them unasked. Measure free memory, fix the cause
  if it is yours, then decide.

## The machine

`vmmemWSL` runs Docker Desktop. On 2026-09-17 an indinero `leap` stack held 3.6 GB and free memory
sat near 2.5 GB; Thomas confirmed that work is finished, so those containers may be stopped, and
`wsl --shutdown` with no container running returns about 3 GB more. Verify `wsl --list --running`
shows only `docker-desktop` before doing it. `dotnet build-server shutdown` returns about 1.3 GB
that api rounds leak into `VBCSCompiler`. Below roughly 7 GB free, run ONE worker at a time and do
not run a root `turbo type-check` or a vitest suite beside it.

**A worktree's `tools/node_modules` is a JUNCTION to the main checkout's `node_modules`.** Check for
a reparse point before operating on any path inside a worktree, and use `rmdir` rather than `rm -rf`
for install debris.

**Reclaim `C:\\Users\\thoma\\orca\\.purge`** single-threaded, when no worker is running. Roughly 150
staged worktrees. `robocopy /MIR /MT:64` over it is what killed five tasks at once.

## `--sleep`

Thomas ran `/wrap-up --sleep`. Nobody is going to open this file, so do not stop after reading it.
Read and execute `.claude/skills/sleep/SKILL.md`, write run state under this session's own id, and
leave a live wake source before the turn ends. **A worker launched by a previous session does not
wake you**: its wake source belongs to that session. Own your own. Take every decision yourself,
always the best approach and never the easiest, and log each one.

The one place this run stops and waits is THE REDESIGN GATE above. Everything before it is yours.

## One more thing

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact.
Three tickets that read blocked on 2026-09-17 were not, and one merge was refused because a sha was
typed from memory instead of copied.
