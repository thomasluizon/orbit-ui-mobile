---
name: progress
description: Answer "what happened" in product terms: what a person can now do, what is half built, and what Thomas has to decide. Reads live state, never a remembered summary. Defaults to THIS SESSION; --full adds the whole effort's spec below it. Use when he asks for a progress update, how something is going, or says /progress.
argument-hint: "[--full] [optional area, for example \"calendar\" or \"perfil\"]"
effort: medium
---

# Progress

**Input**: `$ARGUMENTS`. `--full` anywhere in it adds the whole-effort section. Anything else is an
area to narrow to.

**At a glance:** Thomas asks what the product does now. Answer in screens and behaviours. A ticket
number, a pull request number or a commit SHA belongs in this answer only when he asks which one.

## What he is asking

"Is the calendar redesigned yet." "Can someone see their Google events." "What is left."

He is not asking which tickets closed. Numbers are how the work is tracked, not what it is.

## Two scopes, and the default is the session

| invocation | what it answers |
|---|---|
| `/progress` | what THIS SESSION changed, and nothing else |
| `/progress --full` | this session first, then the whole effort below it |
| `/progress <area>` | the same, narrowed to one screen or surface |

The default is deliberately narrow. Mid-run he is asking what just happened, and a whole-effort
summary buries that under work he already knows about.

## Read live state first

Never answer from memory, and never from a standing notes file such as `hot.md`. Both go stale
within a day.

**State the integration branch rather than assuming one.** Resolve it this way:

1. Read the checkout branch with `git rev-parse --abbrev-ref HEAD`.
2. Read the repository's open pull requests with
   `gh pr list --state open --limit 100 --json number,headRefName,baseRefName`.
3. If one row's `headRefName` exactly matches the checkout branch, start with its `baseRefName`.
   While that candidate is itself an open row's `headRefName`, it is a stacked pull request head,
   not the integration branch; replace it with that row's `baseRefName`. The first candidate that is
   not an open head is the integration branch. If no row matches the checkout branch, the checkout
   branch itself is the integration branch. A duplicate matching head or a cycle is ambiguity: say
   so and do not guess. This rule is anchored to one exact head, so unrelated bases cannot tie it.
4. State the resolved branch in the answer. Run `git fetch origin <integration-branch>` before
   comparing commits, and read `origin/<integration-branch>`. If the fetch fails, say it could not be
   verified rather than claiming work landed.

For the session scope:

1. Get the live session id from `currentRunIdentifier()` in
   `tools/lib/identifier-ledger.mjs`. Use `readRunState()` only when its `sessionId` exactly matches.
   With no matching record, there is no session baseline. State "No session baseline is available."
   Then report the effort scope instead by following the full-scope procedure once. Do not silently
   turn an absent baseline into an empty session or call all visible work session-owned.
2. Enumerate the matching record's append-only `readinessLedger`. Each row's `repositoryKey` maps to
   a repository path in `.claude/orchestrator.json`; `prNumber` identifies the session-owned pull
   request; `receiptPath` is provenance, not merge status. Ignore any undeclared top-level key.
3. In each mapped repository, run `gh pr view <number> --json state,mergeCommit` at answer time.
   `OPEN` is mid flight and `CLOSED` did not merge. For `MERGED` with a non-null `mergeCommit.oid`,
   run `git merge-base --is-ancestor <merge-commit-oid> origin/<integration-branch>` in that
   repository. Only exit 0 proves the merge commit reached the integration branch. A stacked child
   merged into its parent's head cannot pass until that commit arrives on the integration branch.
   If the field is absent or the check errors, say arrival could not be verified. Read the pull
   request and its ticket for the behaviour it carries. The ledger establishes session ownership;
   commit ancestry establishes what landed.
4. Run `git status --short` in the current checkout so work before its first commit or pull request is
   visible there. This does not create a session baseline. It also cannot see uncommitted work in
   linked worktrees from the orchestrating checkout. When no ledger row names that work yet, say the
   session report can omit pre-pull-request changes in linked worktrees. Use `remaining` for queued
   work and the session's decision log for unresolved decisions.

For the full scope, add:

4. The effort's spec under `.claude/specs/<slug>.md`. Find it the way `/handoff` does: if the opening
   prompt names one, use that one; otherwise match by scope, never by feel. Read its State section
   for what it claims, then CHECK the claim against the tree rather than repeating it.
5. The ticket list for the effort, and for any screen you are unsure about, its ticket body's stage
   list compared against the merged commits.

A stage whose merge commit is an ancestor of the integration branch is shipped there. If nothing on
that branch reaches a real person yet, say "built" rather than "live", and say so once rather than
in every line.

## Name the behaviour, not the stage

Derive what each ticket MEANS to a person from its own title and body, at the time you answer. Do not
carry a table of tickets in this file: it rots the moment a ticket is retitled, split or closed.

"The calendar has its month, week and range views and logs the last seven days" beats "stages 1 to 9
merged".

## Shape of the answer

Three things, in this order:

1. What a person can do now that they could not before.
2. What is half built, and what is missing from it.
3. What is waiting on Thomas, phrased as the decision, not the ticket.

With `--full`, answer those three for the session, then the same three for the whole effort
underneath, clearly separated and clearly labelled. The session part comes first and stays first,
even when the effort part is larger.

Keep it under his writing contract: 12 lines, 200 words. If that will not fit, you are including
detail he did not ask for. `--full` earns more room, because two scopes cannot fit in one: run long
the way the contract allows, and add a heading per scope so he can skim back.

## Be honest about half done

A screen with six of nine stages built is not "nearly done", it is missing three behaviours. Name
them. A screen blocked on a capability in another repository is blocked, not in progress.

If a defect shipped and was caught, say what it would have done to someone: "a second tap could undo
the first write" tells him more than "fixed a data-loss bug".

A session that merged nothing says so. A run whose only output was review rounds is a run that
merged nothing, however much it did.

## When he names an area

`/progress calendar` answers for that screen only, in the same three parts, with room for one more
sentence of detail. `--full` combines with an area: this session's changes to that screen, then that
screen's whole state.
