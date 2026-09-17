# Finish the Orbit redesign

Read `.claude/specs/orbit-redesign.md` first. It is the living spec and it holds everything durable:
the standing instructions, the decisions, the constraints, the full state and every answer Thomas has
given. This prompt only says what to do next.

`.claude/specs/beta-release.md` is the record for work that ships off `main`, and it covers TWO
releases. Read its constraints once; they bite on any `main` work.

**Read the brain notes the spec names before you act.** They are listed under
`## Decisions this effort runs on`, eighteen of them, by exact filename. Open them through the
Obsidian MCP: `mcp__obsidian__obsidian_list_notes`, then `mcp__obsidian__obsidian_get_note`. On
2026-09-16 the MCP was unreachable and the check fell back to frontmatter on disk; every note read
`status: accepted` and only one file in the whole `Decisions/` directory carried a `superseded_by`,
and it is not one of the eighteen. **Backlinks were never read. Re-confirm through the MCP when it
is up.**

## Your entry point

`/sleep`. It enters `/orchestrate --sleep` itself, so do not treat them as two choices. Do not
restate what either one does; work through them.

## The goal

**Finish `.claude/specs/orbit-redesign.md`.** The run ends when every screen ticket is closed and
`node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing. That command is
necessary and NOT sufficient: it validates the MAPPING only, and it reads a manifest no CI job
regenerates. Judge every ticket against its own acceptance criteria in the tree before closing it.

A blocker is the next piece of work, not an ending. Re-derive what is left:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 300
    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh pr list --repo thomasluizon/orbit-api --state open

## Do this first: `#570`

Thomas asked for it by name on 2026-09-17. **`#570` is the next immediate ticket, before anything
else.**

`tools/check-review-harness.mjs` requires two skills where
`.claude/playbooks/redesign-screen.md:89-113` requires three source families and four lanes plus the
`design-reviewer` and `completeness-critic` close gate. A pull request can therefore pass that gate
with two honest lines while the execution lane, the gates lane and both agents were never run.

`tools/lib/review-harness.mjs` already exists as the single source PR 991 introduced, and both the
local order and the Cloud order derive from it. This ticket makes the GATE read the same constant.

It was filed rather than fixed because **D95 is absolute: a run must not edit the gate it is judged
by**, and `Redesign Review Harness` judges 991. Whoever does `#570` must not be inside a pull request
that gate is judging. The ticket body carries the full scope and acceptance criteria.

## Read this before you merge anything

**An APPROVED Pullfrog review is not the verdict.** A later review of the SAME head supersedes it,
and 994 proved it live: `APPROVED@01:52` then `COMMENTED@02:29` on one head, carrying two new P1s.

Decide every merge on **the LAST Pullfrog review of the exact head being APPROVED AND the newest
`pullfrog-approval` check run at that head concluding `success`**, ignoring SonarCloud only when the
base is `redesign/main`. When `pullfrog-approval` is ABSENT rather than failing, an APPROVED review
at the exact head stands in for it; `record-readiness.mjs --help` states that rule. That condition
merged 1000, 1006, 1009 and api 520 cleanly and refused everything else.

**Rebuild the tool that does exactly that read.** It lives in a scratchpad that dies with its
session, and it is about five minutes: last bot review at head, newest check run per NAME, unresolved
bot threads, and reds excluding SonarCloud.

Two cheap things that save real time:

- `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0` is the read.
  Without those flags it posts `@pullfrog review` and waits up to fifteen minutes.
- That tool RECORDS every thread id it prints, which is what clears
  `forbid-invented-identifier.mjs`. An id read through raw GraphQL is refused even when correct.
- **`--match-head-commit` takes the FULL sha, COPIED from `gh pr view --json headRefOid` in this
  run.** A reconstructed one was refused with `Head branch was modified`, which is the guard working.

## In flight, with a disposition on every row

**Thirteen pull requests are open and every one has its review back. No worker is running.** Nothing
is blocked; each row is one round of work.

| PR | repo | head | disposition |
|---|---|---|---|
| 1007 | ui | `a128ca12` | round 2 pushed, **awaiting the review of that head**. Five P1s answered, including the onboarding parser that rewrote `Read a book` to `Read book` and `Trabalhar na postura` to `Trabalhar postura`. Read the review, then drive |
| 1002 | ui | `1f4022d0` | round 2 pushed, **awaiting review**. Three P1s where clearing a suppression changed behaviour. Hold the ratchet floor: web 23, mobile 20 |
| 994 | ui | `cdbbbedd` | **zero reds, zero threads, approval ABSENT.** Request a review of this head; it may be mergeable immediately |
| 1008 | ui | `56d48167` | 3 reds, 3 threads. It removes **116** suppressions, the largest single clearance. High value, merge it early |
| 1005 | ui | `1c4e90fd` | 1 red, 2 threads |
| 1001 | ui | `744173b3` | 2 reds, 2 threads |
| 1003 | ui | `b52e3d79` | 1 red, 1 thread |
| 1004 | ui | `e002e817` | 1 red, 1 thread |
| 992 | ui | `fb520fb1` | 1 red, 1 thread. A second mobile `RadioGroup` was deleted and every caller migrated |
| 991 | ui | `3cda0bd9` | 1 red, 1 thread. Do NOT widen `check-review-harness.mjs` here; that is `#570` |
| 970 | ui | `b56d1b5e` | CHANGES_REQUESTED, 1 thread |
| 528 | api | `dfb885b3` | 1 thread, no reds. **Its manual step IS the ticket**: flip `RequireApiKeyCreationStepUp` to `true` in `AppConfigs` AFTER the deploy |
| 521 | api | `44611e5f` | 2 reds, 1 thread. Round 5 moved the recurrence refusal server side |
| Dependabot | both | ui 798/799/801/881, api 510/525/526 | Leave. Not this effort |

Every worktree is clean with nothing unpushed, and there are no stashes in either repository.

## Do this, in this order

1. **`#570`**, as above. Thomas named it.
2. **Drive the eleven ui pull requests to merge.** Take 994 and 1008 first: 994 may already be
   mergeable and 1008 carries 116 suppressions.
3. **`orbit-api` 521 and 528**: clear their findings, then merge. **Merging is not deploying.** 520
   is merged to api `main` at `fd219126` and NOT deployed; the deploy and the `AppConfigs` flip are
   Thomas's, in that order.
4. **Re-run `node tools/redesign-coverage.mjs`** once the screen pull requests merge, and judge each
   remaining ticket against its acceptance criteria in the tree.
5. **Reclaim `C:\Users\thoma\orca\.purge`** single-threaded, when no worker is running. It holds
   roughly 150 staged worktrees. `robocopy /MIR /MT:64` over it is what killed five tasks at once.

## Five things that cost real work on 2026-09-17

- **A ticket that reads blocked is a lead, not a fact.** Three were wrong in one night. `#58` and
  `#373` were already delivered, and `#76`'s blocker had been merged in api PR 527 a day earlier.
  Check the tree against the acceptance criteria before building or before reporting a block.
- **An already-done ticket gets a comment and a closure, never an empty pull request.** Write the
  per-criterion evidence into the closing comment.
- **A fresh worktree has NO `node_modules` and a worker launched into one produces nothing.** Run
  `npm install` and confirm 961 entries before composing the prompt. `#63` burned a launch on this.
- **A pull request body can lose every newline, and then a heading is not a heading.** 992's harness
  gate failed three times while the block was visibly in the body, because the body was one line.
  Read it as the gate reads it before re-running a sweep.
- **A ticket body can carry an instruction that is actively wrong.** `#67` says to delete the feature
  guide; `#73` says that instruction must not be executed, and PR 1005 had just rewritten that
  drawer. Post the correction to the TICKET before composing, because the worker reads comments.

## The machine

`vmmemWSL` runs Docker Desktop with live indinero containers, and it is what trips the low-memory
watchdog. `free -m` inside it reported 5,719 MB genuinely used against 719 MB of cache, so there is
nothing to reclaim there without stopping somebody else's work. `dotnet build-server shutdown`
returns about 1.3 GB that api rounds leak into `VBCSCompiler`. Below roughly 7 GB free, run ONE
worker at a time and do not run a root `turbo type-check` or a vitest suite beside it.

**A worktree's `tools/node_modules` is a JUNCTION to the main checkout's `node_modules`.** Check for
a reparse point before operating on any path inside a worktree, and use `rmdir` rather than `rm -rf`
for install debris, because `rmdir` cannot remove a populated directory.

## `--sleep`

Thomas ran `/wrap-up --sleep`. Nobody is going to open this file, so do not stop after reading it.
Read and execute `.claude/skills/sleep/SKILL.md`, write run state under this session's own id, and
leave a live wake source before the turn ends. **A worker launched by a previous session does not
wake you**: its wake source belongs to that session. Own your own. Take every decision yourself,
always the best approach and never the easiest, and log each one.

## One more thing

Every identifier above came from a previous session. Treat each as a lead to verify, not a fact.
Three tickets that read blocked on 2026-09-17 were not, and one merge was refused because a sha was
typed from memory instead of copied.
