---
name: progress
description: Answer "what happened" in product terms from live state. Defaults to everything since the previous owner-typed /progress or /wrap-up in the open chain and current session; --full adds the whole effort's spec below it. Use when he asks for a progress update, how something is going, or says /progress.
argument-hint: "[--full] [optional area, for example \"calendar\" or \"perfil\"]"
effort: medium
---

# Progress

Update any tracked spec's single `## Current state` section in place. Do not append a dated session
section or copy a timed run log into tracked prose.

**Input**: `$ARGUMENTS`. `--full` anywhere in it adds the whole-effort section. Anything else is an
area to narrow to.

**At a glance:** the owner asks what the product does now. Answer in screens and behaviours. A ticket
number, a pull request number or a commit SHA belongs in this answer only when he asks which one.

## What he is asking

"Is the calendar redesigned yet." "Can someone see their Google events." "What is left."

He is not asking which tickets closed. Numbers are how the work is tracked, not what it is.

## Two scopes, and the default follows the previous report

| invocation | what it answers |
|---|---|
| `/progress` | what changed since the previous owner-typed `/progress` or `/wrap-up` in the proven transcripts, across repositories |
| `/progress --full` | the default scope first, then the whole effort below it |
| `/progress <area>` | the same, narrowed to one screen or surface |

The boundary is the most recent earlier owner-typed `/progress` or `/wrap-up` in every open chain
entry's `transcriptPath` and the current session transcript. Both commands report progress to the
owner. An owner command is a `type: "user"` row without `isMeta` or `isSidechain`, whose message
contains `<command-name>/progress</command-name>` or `<command-name>/wrap-up</command-name>`.
Tool-result blocks never count. No origin metadata is required. If the current transcript's last
owner message is either command, exclude that invocation and deduplicate rows of the same prompt.
Commands in unrelated project transcripts do not set the boundary. With no earlier invocation,
use the open chain start, then the current session start. State which baseline was used. A missing
recorded transcript is an error to report, never evidence that no previous command exists.

First get the exact current session id from `currentRunIdentifier()` in
`tools/lib/identifier-ledger.mjs`, then run:

```bash
node tools/progress-window.mjs --session <current-session-id> --transcript <current-transcript-path>
```

The transcript flag is optional when the run record or the project transcript directory names
it. The helper reads all recorded chain transcript paths, discovers the current transcript in the
project directory when needed, and reads live merges in every configured repository, web, API and landing release runs, Android uploads, and closed and newly created
tickets from `window.startedAt` through now. `window.baselineSource` and top-level `baselineSource`
name `previous-progress`, `chain-start` or `session-start`. The previous command timestamp is
`window.startedAt`. Its `entries` include every overlapping session, archived chains
and the current session last. Work between sessions has a null session id and still belongs in
the report. This is evidence of work during the window, not proof that the orchestrator authored
every change.

`window.startedAt` is the ISO UTC boundary for the whole report.
Start the answer's first line with that window start in the owner's local time, using
`window.localStartedAt` when the machine uses that timezone, otherwise converting `window.startedAt`
to the owner's known timezone. Name the previous command or fallback source alongside that timestamp. With a chain fallback,
say that no earlier owner progress command was found in the proven transcripts.

Entries that ended before the window are dropped. Every overlapping chain entry retains its
complete decisions and owner questions; merges, releases and tickets are included only from the
window start. Read those sources with equal weight. For sessions without a decision log, derive decisions and owner questions from
the fallback `conversation`. It carries only owner-typed prompts and assistant text replies within
the window, each capped at 1,500 characters plus a visible truncation marker. Tool results, system
notifications and skill bodies are excluded. Entries with non-empty `decisions` omit `conversation`.
Do not compress earlier sessions to a token line while giving the current session the whole report.
Gather every entry before the ancestry checks below. Deduplicate repository and pull request pairs
without dropping decisions or owner questions. Use the helper's merges alongside ledger identities
for those checks. All overlapping sessions form one report in the existing product answer shape.
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

**State the integration branch rather than assuming one.** Resolve it separately inside every
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
   - Two or more rows are `OPEN`: that is the ambiguity, and it should not happen. Say so, name
     every open number, and do not guess.

   Then read the deciding row:
   - `OPEN` or `MERGED`: replace the candidate with that row's `baseRefName` and continue the walk.
   - `CLOSED` with nothing merged: the chain is unresolved. Name that pull request number and its
     head, say the stack's parent never merged, and never report that head as the integration
     branch.

   A cycle is the other ambiguity: say so and do not guess. This walk begins from one exact anchor,
   so unrelated bases cannot tie it.

   `tools/lib/integration-branch.mjs` implements this base-chain rule as the executable contract.
   Any change to the rule must change that function and its cases together.

   Reading only open heads is what this replaces. It accepted every absent head as integration, so a
   closed parent resolved to its own feature branch: PR 575's base is `feature/539-b5-apply-design`,
   that branch is PR 560's head, and 560 is `CLOSED` with `mergeCommit` null.
4. State the current checkout's resolved branch in the answer. Before comparing commits, run
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
   resolved integration branch there. `OPEN` is mid flight and `CLOSED` did not merge. For `MERGED`:
   - When `baseRefName` equals that repository's resolved integration branch and `mergeCommit.oid` is
     non-null, run
     `git merge-base --is-ancestor <merge-commit-oid> origin/<integration-branch>` there. Only exit 0
     proves direct arrival.
   - With any other `baseRefName`, say the pull request landed into `<baseRefName>` and that ancestry
     cannot prove arrival across that squash boundary. Name the base so the owner can follow it. Do not
     claim the work will reach integration or already did.
   If a required field is absent, the fetch fails, or the ancestry check errors, say arrival could
   not be verified for that repository. Read the pull request and its ticket for the behaviour it
   carries. The live window includes work regardless of ledger ownership; direct-base ancestry
   establishes what landed.

The standing orchestrator practice retargets a stacked child onto the integration branch before merging
its parent. `.claude/specs/orbit-redesign.md` and `/merge-prs` own that rule.
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
3. What is waiting on the owner, phrased as the decision, not the ticket.

With `--full`, answer those three for the default time window, then the same three for the whole effort
underneath, clearly separated and clearly labelled. The default scope comes first and stays first,
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
sentence of detail. `--full` combines with an area: changes to that screen since the previous report, then that
screen's whole state.
