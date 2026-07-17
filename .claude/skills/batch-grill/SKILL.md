---
name: batch-grill
description: Grill a SET of correlated issues together instead of one at a time — collect the union of their open questions into one frontier, ask each shared question once and apply it to every affected issue, surface cross-issue conflicts before planning, and persist each issue's resolved decisions. Used by /execute and /drive in multi-issue mode; can also be run directly over 2+ already-primed issues.
argument-hint: <issue-number> <issue-number> [issue-number ...]
---

# Batch Grill: frontier grilling across correlated issues

Multi-issue grilling done as ONE interrogation over the whole set, not N serial ones. It
builds on `grill-me` — every individual question still follows grill-me's contract
(AskUserQuestion, recommended-answer-first, research the codebase instead of asking) — and
adds only the cross-issue layer: ask each shared question once, catch conflicts between
issues, and attribute answers back per issue. Interactive, main-session only; **NEVER a
subagent** (it is a conversation with the user).

## Precondition

The issues are already primed (via `/prime <N…>`), each with its **open questions / risks**
surfaced — batch-grill consumes those. If an issue's open questions are missing, request them
before starting. Requires **2+ issues**; for a single issue use `grill-me`.

## The loop

1. **Collect the frontier.** Gather the union of every issue's open questions. Tag each
   question with the issue(s) it belongs to.
2. **Cluster.** Merge questions that are the SAME decision across issues into one shared
   question (e.g. "which toast component for errors?" raised by #12 and #15 → one question,
   applies to both). Leave issue-specific questions standalone.
3. **Detect conflicts.** Flag where two issues imply INCOMPATIBLE answers to a shared concern
   (e.g. #12 assumes cursor pagination, #15 assumes offset). Surface the conflict as its own
   question — resolving it matters more than either issue's local answer, and it must be
   resolved before planning either.
4. **Grill the frontier in rounds.** Ask via AskUserQuestion following `grill-me`'s mechanics
   (recommended answer first, batch up to 4 per call). Ask each shared/conflict question
   ONCE. Research codebase-answerable facts (`Glob`/`Grep`/`Read`, `gh`) instead of asking.
   Respect dependencies — hold a question whose prerequisite is unanswered to the next round;
   repeat until the frontier is empty.
5. **Attribute + persist.** Write each issue's resolved decisions to the **caller's durable
   store**, exactly:
   - invoked by `/execute` → `<worktree>/.claude/plans/issue-<N>.decisions.md`, a
     `## Decisions (from grilling)` block.
   - invoked by `/drive` → the issue's `.claude/specs/issue-<N>.spec.md` **Decisions** section.
   - invoked directly → `.claude/plans/issue-<N>.decisions.md` per issue.

   A shared answer is written into EVERY affected issue's store, marked as a cross-issue
   decision. A resolved conflict is recorded in every issue it touched.

## Rules

- Follow `grill-me` for every individual question — do not restate or override those mechanics.
- Do not write code or plans during batch-grilling.
- **Attribution must be exact** — never apply a shared answer to an issue it does not affect.
- The caller (`/execute` GATE B, `/drive`) or the user exits the loop; that exit is the
  caller's grill gate. On direct invocation, stop when the frontier is empty and report the
  per-issue decisions files written.
