---
name: progress
description: Answer "what changed" in product terms from live state, as what got merged and what is built but not merged. Defaults to everything since the previous owner-typed /progress across sessions and repositories; --full adds the whole effort below it; --remaining reports what is still pending on the board instead. Use when he asks for a progress update, how something is going, what is left, or says /progress.
argument-hint: "[--remaining | --full] [optional area, for example \"calendar\" or \"perfil\"]"
effort: medium
---

# Progress

Update any tracked spec's single `## Current state` section in place. Do not append a dated session
section or copy a timed run log into tracked prose.

**Input**: `$ARGUMENTS`. `--remaining` anywhere in it selects the report of pending work. `--full`
anywhere in it adds the whole-effort section. Anything else is an area to narrow to.

**At a glance:** the owner asks what changed in the product. Answer in screens and behaviours. A
ticket number, a pull request number, a commit SHA or a version is how the work is tracked. Give one
only in the reply to a later question that asks for it.

## What he is asking

"What changed in the calendar." "Can someone see their Google events." With `--remaining`: "What
is left."

He is not asking which tickets closed or which version shipped.

## Three scopes, and the default follows the previous report

| invocation | what it answers |
|---|---|
| `/progress` | what got merged since the previous owner-typed `/progress` across every session and repository, then what is built but not merged |
| `/progress --full` | the default scope first, then the whole effort below it |
| `/progress --remaining` | what is still pending on the board until the board is empty, with no window |
| `/progress <area>` | any of the three, narrowed to one screen or surface |

`--remaining` replaces the report, so `--full` adds nothing to it. Its procedure is the section
"`--remaining`: what is pending until the board is empty". The window procedure below (the helper
and the ancestry check) does not apply to it. `--remaining` keeps the base-chain
walk of step 3, started at the own `baseRefName` of each open pull request, to find a stacked pull request.

The previous owner-typed `/progress` is the boundary, including work before the current chain
started. With no earlier invocation, use the open chain start, then the current session start.
State which baseline was used. Skip the current invocation and deduplicate rows of one owner
prompt. Skill expansions, tool results and model-invoked `/progress` calls do not set the boundary.

First get the exact current session id from `currentRunIdentifier()` in
`tools/lib/identifier-ledger.mjs`, then run:

```bash
node tools/progress-window.mjs --session <current-session-id> --transcript <current-transcript-path>
```

The transcript flag is optional when the run record or the project transcript directory names
it. The helper scans the project's top-level transcripts and reads live merges in every configured
repository, web, API and landing release runs, Android uploads, and closed and newly created
tickets from `window.startedAt` through now. `baselineSource` names `previous-progress`,
`chain-start` or `session-start`. Its `entries` include every overlapping session, archived chains
and the current session last. Work between sessions has a null session id and still belongs in
the report. This is evidence of work during the window, not proof that the orchestrator authored
every change.

`window.startedAt` is the ISO UTC boundary for the whole report.
Start the answer's first line with that window start in the owner's local time, using
`window.localStartedAt` when the machine uses that timezone, otherwise converting `window.startedAt`
to the owner's known timezone. Name the fallback when no previous report exists.

Read every entry's merges, releases, closed and created tickets, decisions and owner questions
with equal weight. Decisions are each entry's `decisionNotes`, the decision run notes posted to
tickets and to the run record. For sessions without one, derive decisions and owner questions from
the fallback `conversation`. It carries only owner-typed prompts and assistant text replies within
the window, each capped at 1,500 characters plus a visible truncation marker. Tool results, system
notifications and skill bodies are excluded. Entries with decision notes omit `conversation`.
Do not compress earlier sessions to a token line while giving the current session the whole report.
Gather every entry before the ancestry checks below. Deduplicate repository and pull request pairs
without dropping decisions or owner questions. Use the helper's merges alongside ledger identities
for those checks. All overlapping sessions form one report in the answer shape below. A release,
a decision and an owner question are evidence of what a merge changed for a person. They are not
parts of the answer.
Do not close the chain here; the owner's handoff closes it after reporting.

Release `time` is dispatch creation, so a run finishing after a relay stays with the entry that
launched it. `branch` is the source named in the title; `dispatchBranch` is the workflow ref.
Null environment, track or version means the run did not carry that metadata. Say it could not
be read, never infer it from the dispatch ref. A successful run is release evidence; a failed
or unfinished run is not live. A closed ticket alone never proves shipped behaviour.
A source error or incomplete pagination makes the window unverifiable; report that limitation
instead of treating missing evidence as an empty relay.

## Read live state first

Never answer from memory, and never from a standing notes file such as `hot.md`. Both go stale
within a day.

**Resolve the integration branch rather than assuming one.** Resolve it separately inside every
repository whose work you report, using one base-chain rule:

1. In that repository, read its open pull requests with
   `gh pr list --state open --limit 100 --json number,headRefName,baseRefName,isCrossRepository`.
   That listing finds the anchor in step 2; step 3 resolves each candidate in every state, not only
   this one. `isCrossRepository` is requested HERE and not only in step 3, because step 2 matches on
   `headRefName` alone and a fork's row carries the same branch name.
2. Choose the anchor that identifies the work in that repository. For the current checkout, read
   `git rev-parse --abbrev-ref HEAD`; if one open row's `headRefName` exactly matches it **AND that
   row's `isCrossRepository` is false**, start with that row's `baseRefName`, otherwise start with
   the checkout branch itself. A row that matches the name but belongs to a fork is not this
   repository's pull request, so it never supplies the anchor, and a checkout whose branch only a
   fork owns falls through to the real no-pull-request path rather than adopting a stranger's base.
   For a session ledger row, use the row's `prNumber` to find that repository's session pull request
   and start with its `baseRefName`; do not assume the orchestrating checkout's branch exists in a
   sibling repository.
3. While the candidate is itself some pull request's `headRefName`, it is a stacked pull request
   head, not the integration branch. Resolve that head in every state, because a stacked parent can
   be closed while it is still the child's recorded base:

   ```bash
   gh pr list --head <candidate> --state all --limit 10 \
     --json number,state,baseRefName,isCrossRepository
   ```

   **Drop every row whose `isCrossRepository` is true, before anything else.** `--head` filters on
   the branch NAME only and its own help says the `<owner>:<branch>` form is not supported, so on a
   public repository a FORK's pull request carrying the same branch name comes back in this
   listing. A fork's pull request is never this repository's stacked parent, and following its
   `baseRefName` would walk into a stranger's branch.

   An empty array, or one left empty by that filter, means the candidate is no pull request's head
   in this repository, and that candidate is the integration branch.

   **One row decides it, and which row is deterministic.** A branch name can be reused, so this
   listing returning several rows is normal rather than ambiguous:
   - Exactly one row has `state` `OPEN`: that row decides, whatever the numbers are. A branch can
     have only one live pull request, and the live one is the current one.
   - No row is `OPEN`: the highest `number` decides. Numbers increase, so that is the most recent
     use of the name.
   - Two or more rows are `OPEN`: that is the ambiguity, and it should not happen. Say so and do
     not guess.

   Then read the deciding row:
   - `OPEN` or `MERGED`: replace the candidate with that row's `baseRefName` and continue the walk.
   - `CLOSED` with nothing merged: the chain is unresolved. Say the stack's parent never merged,
     and never report that head as the integration branch.

   A cycle is the other ambiguity: say so and do not guess. This walk begins from one exact anchor,
   so unrelated bases cannot tie it.

   `tools/lib/integration-branch.mjs` implements this base-chain rule as the executable contract.
   Any change to the rule must change that function and its cases together.

   Reading only open heads is what this replaces. It accepted every absent head as integration, so a
   closed parent resolved to its own feature branch: PR 575's base is `feature/539-b5-apply-design`,
   that branch is PR 560's head, and 560 is `CLOSED` with `mergeCommit` null.
4. Before comparing commits, run
   `git fetch origin <integration-branch>` in that mapped repository and read
   `origin/<integration-branch>` there. A failed fetch makes arrival unverifiable for that repository
   only; it does not affect the other repositories.

For the default time window:

1. Get the live session id from `currentRunIdentifier()` in
   `tools/lib/identifier-ledger.mjs`. Use `readRunState()` only when its `sessionId` exactly matches.
   The helper's chain or exact transcript establishes the time baseline even without a matching
   run record. When it returns `baseline: "unavailable"`, there is no session baseline.
   State "No session baseline is available."
   Then report the effort scope instead by following the full-scope procedure once. Do not silently
   turn an absent baseline into an empty session or call all visible work session-owned.
2. Start with every helper entry's `merges`, whose `repository` is the repository key and `id`
   is the pull request number. Add the matching record's append-only `readinessLedger` and
   every open chain entry's `shipped` rows, retaining mid-flight work as well as merges.
   A shipped row's `repository` is the repository key and `pullRequest` is its
   pull request number. Union those identities before the live reads below. Each ledger row's `repositoryKey` maps to
   a repository path in `.claude/orchestrator.json`; `prNumber` identifies the session-owned pull
   request; `receiptPath` is provenance, not merge status. Ignore any undeclared top-level key.
3. In each mapped repository, run
   `gh pr view <number> --json state,mergeCommit,baseRefName` at answer time. Use this pull request's
   `baseRefName` as the session anchor for the same base-chain rule above, then fetch that repository's
   resolved integration branch there. `OPEN` belongs to part 2 of the answer and `CLOSED` did not
   merge. For `MERGED`:
   - When `baseRefName` equals that repository's resolved integration branch and `mergeCommit.oid` is
     non-null, run
     `git merge-base --is-ancestor <merge-commit-oid> origin/<integration-branch>` there. Only exit 0
     proves direct arrival.
   - With any other `baseRefName`, the pull request landed into `<baseRefName>` and ancestry
     cannot prove arrival across that squash boundary. Put that work in part 2 as merged into a
     stack that did not reach the integration branch. Do not claim the work will reach integration
     or already did.
   If a required field is absent, the fetch fails, or the ancestry check errors, say arrival could
   not be verified for that repository. Read the pull request and its ticket for the behaviour it
   carries. The live window includes work regardless of ledger ownership; direct-base ancestry
   establishes what landed.

The standing orchestrator practice retargets a stacked child onto the integration branch before merging
its parent. `/orchestrate` and `/merge-prs` own that rule.
4. Run `git status --short` in the current checkout so work before its first commit or pull request is
   visible there. This does not create a session baseline. It also cannot see uncommitted work in
   linked worktrees from the orchestrating checkout. When no ledger row names that work yet, say the
   session report can omit pre-pull-request changes in linked worktrees. Use `remaining` for queued
   work and the decision run notes for unresolved decisions.
5. For part 2, read the open pull requests of every repository that `repos` in
   `.claude/orchestrator.json` names. Part 2 is the state at answer time, so it includes a pull
   request that opened before the window:

   ```bash
   gh pr list --state open --limit 100 \
     --json number,headRefName,baseRefName,isCrossRepository,title,isDraft,statusCheckRollup,mergeable
   ```

   This listing carries every field of the base-chain listing, so one read serves both. A listing
   of 100 rows is incomplete: read it again with a larger limit. Read each pull request and its
   ticket for the behaviour it carries. Each `statusCheckRollup` entry carries `name`, `status` and
   `conclusion`, and `pullfrog-approval` is the review. A completed entry passes when its
   `conclusion` is `SUCCESS`, `NEUTRAL` or `SKIPPED`, the rule `PASSING_CONCLUSIONS` in
   `tools/lib/readiness-receipt.mjs` states. Any other conclusion fails, and `CANCELLED` and `TIMED_OUT`
   are included. A check that ran more than once at the same head, as `PR Metadata` does after an
   edit or a label, keeps every run in the rollup: read only the newest entry of each `name` by
   `startedAt`, as `newestChecks` in that file does. For the stacked row, run the base-chain walk
   of step 3 from the own `baseRefName` of that pull request. A walk that ends at that same branch
   means the pull request is not stacked. A walk that cannot resolve is not a wait:
   a parent that closed with nothing merged never merges, so say the work needs a new base, and a
   cycle or two open rows is the ambiguity that step 3 names. Only for a pull request that is not stacked, read
   the checks that its base branch requires with
   `gh api repos/<owner>/<repo>/branches/<baseRefName>/protection/required_status_checks`, where
   `<owner>/<repo>` is the `origin` remote of the checkout that `repos` in `.claude/orchestrator.json`
   maps the repository to, as `repositorySlug` in `tools/lib/github-auth.mjs` reads it. A stacked
   base has no branch protection, so this read answers 404 for it: a stacked row skips the read, because its
   row already says what holds it. Each `checks[].context` is a required `name`. A required check
   has no entry when no newest entry carries its `name`. A retarget does not start the full checks:
   they run on the first push after it. When the read fails for a pull request that is not stacked,
   say that the required checks could not be read. Those newest entries, `isDraft` and the required
   checks say what holds the work.
   Use the first row that applies:

   | the row shows | what holds the work |
   |---|---|
   | `isDraft` is true | nobody offered it for review yet |
   | an entry whose `status` is not `COMPLETED` | the checks did not finish |
   | a completed entry other than `pullfrog-approval` that fails | a check fails: say what that check protects |
   | `pullfrog-approval` is completed and fails | the review asked for a fix |
   | no `pullfrog-approval` entry | the review did not run yet |
   | the base-chain walk that starts at its own `baseRefName` ends at another branch | it waits for the work it is stacked on to merge, and the full checks run on its first push after it targets the integration branch |
   | `mergeable` is `CONFLICTING` | it conflicts with its base: the conflict needs a fix, then the checks and the review run again |
   | `mergeable` is still `UNKNOWN` after `gh pr view <number> --json mergeable` | GitHub has not said yet whether it conflicts with its base |
   | a check that the base branch requires has no entry | the full checks did not run on this head: they run on its next push |
   | `pullfrog-approval` passes, every other entry passes and `mergeable` is `MERGEABLE` | only the merge is left |

   Work that a ledger row or step 4 shows with no pull request is built on a local head: say nobody
   offered it for review yet.

For the full scope, add:

6. The effort's spec under `.claude/specs/<slug>.md`. Find it the way `/handoff` does: if the opening
   prompt names one, use that one; otherwise match by scope, never by feel. Read its State section
   for what it claims, then CHECK the claim against the tree rather than repeating it.
7. The ticket list for the effort, and for any screen you are unsure about, its ticket body's stage
   list compared against the merged commits.

A stage whose merge commit is an ancestor of the integration branch is merged there. If nothing on
that branch reaches a real person yet, say "merged" rather than "live", and say so once rather than
in every line.

## Name the behaviour, not the stage

Derive what each ticket MEANS to a person from its own title and body, at the time you answer. Do not
carry a table of tickets in this file: it rots the moment a ticket is retitled, split or closed.

"The calendar has its month, week and range views and logs the last seven days" beats "stages 1 to 9
merged".

## Shape of the answer

The first line is the window start. Then the answer has exactly two parts, in this order:

1. **Merged.** What got merged in the window, as behaviour a person sees or a capability the run
   gains, grouped by product area.
2. **Built, not merged.** What is built and not merged at answer time, in the same terms and the
   same groups. Each item says what still holds it, in plain words.

The answer has no pull request number, ticket number, commit SHA, version number or release
run, and no count of merges or tickets. It has no list of releases: a release is in the answer only
as the behaviour that reached people because of it. Owner questions belong to `/questions`. Changes
with no behaviour for a person and no capability for the run, such as dependency updates, share one
line.

Say an evidence limit in the same plain words, next to the item it affects: a source that could not
be read, or work that merged into a stack and not into the integration branch.

With `--full`, answer those two parts for the default time window, then the same two parts for the
whole effort underneath, clearly separated and clearly labelled, under the same rules. The default
scope comes first and stays first, even when the effort part is larger.

Keep it under his writing contract: 12 lines, 200 words. If that will not fit, you are including
detail he did not ask for. `--full` earns more room, because two scopes cannot fit in one: run long
the way the contract allows, and add a heading per scope so he can skim back.

## Be honest about half done

A screen with six of nine stages built is not "nearly done", it is missing three behaviours. Behaviour
that nobody built is neither merged nor built, so it has no part of its own. Name the three as a
qualifier inside the item of that screen, in the part where the six built stages sit. `--remaining`
lists them as pending work. A screen blocked on a capability in another repository is blocked, not in progress.

If a defect shipped and was caught, say what it would have done to someone: "a second tap could undo
the first write" tells him more than "fixed a data-loss bug".

A session that merged nothing says so. A run whose only output was review rounds is a run that
merged nothing, however much it did.

## When he names an area

`/progress calendar` answers for that screen only, in the same two parts, with room for one more
sentence of detail. `--full` combines with an area: changes to that screen since the previous report, then that
screen's whole state. `--remaining` combines with an area: the pending work of that screen only.

## `--remaining`: what is pending until the board is empty

`/progress --remaining` reports pending work and not progress. It has no window and needs no session
baseline. It keeps the product terms and the ban on numbers and versions of the window report.

Read live state:

1. Run `node tools/plan-queue.mjs --board`. It reads every open ticket of the configured project
   through the ticket adapter and prints one plan. `admitted` rows are in dependency order,
   blockers first, by `position`. The tool does not read the order that the owner sets on the
   board, so never present this order as the owner's priority. Rows carry `identifier`, `repo`, `title`,
   `state` and `blockedBy`. `deferred` rows carry only `identifier`, `reason` and `detail`: they are
   pending too, and they follow the admitted rows. The tool reads at most 250 tickets. A
   `counts.requested` of 250 is incomplete: run again with a larger `--limit`. Exit 1 means the
   board has no open ticket: say that nothing is pending. Exit 2 means the board could not be read:
   say that, and do not report an empty board.
2. Read each deferred ticket, and each admitted ticket whose title does not say what a person
   gains, with `gh issue view <ticket-number> --repo <ticket-repository> --json title,body`. The
   ticket repository is `tickets.repository` in `.claude/orchestrator.json`.
3. Read the open pull requests of every configured repository with the step 5 listing of the
   window report, plus the `body` field. A pull request builds one ticket. When its
   `headRefName` carries `ticket-<ticket-number>` or the `orb-<n>` of the ticket, as
   `tools/run-status.mjs` reads it, that is the ticket. Only a head that names no ticket links
   by its first `Tracks` line, as `Tracks #<ticket-number>` or `Tracks <ticket-repository>#<ticket-number>`.
   A later `Tracks` line names the effort the ticket belongs to, not a ticket this pull request
   builds. A ticket that only a later `Tracks` line names is not built: it waits for the tickets
   that those pull requests build. Any other number in a title or body is a reference, not a
   link. The pull request proves that work started. The board `state` does not: a ticket in
   `Todo` can have an open pull request.

Shape: one heading for each product area, the areas and the items in dependency order, one line
for each item. Each line says what a person can do when the item is done, or which capability the run
gains, and one of these states:

- Not started.
- Built and in review, with what holds it from the step 5 table.
- Waits for another pending item, named by its behaviour.

The 12-line contract does not apply: the answer is as long as the board.
