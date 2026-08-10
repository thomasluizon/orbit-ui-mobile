---
name: merge-prs
description: Merge a frozen set of already-approved pull requests after an /orchestrate run. Accept optional PR URLs, repo#number references, or unambiguous PR numbers; with no arguments, recover the PR set from the current conversation and orchestration scratchpad. Order dependencies, update branches with main, admin-squash merge without rerunning approval/CI on the mechanical update commit, synchronize GitHub tickets, and clean only the merged PRs' branches and worktrees. Use only when Thomas explicitly invokes /merge-prs after every target PR has a clean pr-review, green CI, and zero unresolved Codex threads.
---

# /merge-prs

Turn one frozen, already-approved PR set into merged `main` branches, closed tickets with Status Done, and clean
local/remote state. Optimize for elapsed time. This is a delivery command, not another review run.

## Authorization boundary

Invoking `/merge-prs` is Thomas's explicit authorization to merge exactly the frozen target set. In
this skill only, `gh pr merge --admin --squash` is allowed. The exception exists because every target
must already have passed independent review, Codex-thread resolution, and CI before this skill starts.

- Never extend the set after preflight without a new explicit instruction.
- Never merge a draft, a PR outside the frozen set, or a PR that was not ready at its approved head.
- Never use the REST pull merge endpoint or GraphQL `mergePullRequest`; the exception covers only
  `gh pr merge --admin --squash --match-head-commit <sha>`.
- Never push to `main`, force-push, rebase an update, bypass hooks, or change a gate/baseline.
- Do not launch tickets, implement review findings, or request another review. A non-mechanical code
  conflict is a handoff, not permission to redesign approved code.
- `/orchestrate` and `/pr-review` still never merge. This authorization is not transferable to them.

Use an owner-scoped `GH_TOKEN` per process. Never call `gh auth switch`.

## Resolve the target set

Accept any mix of PR URLs, `owner/repo#123`, or bare numbers when the repository is unambiguous.

With no arguments, recover the set in this order:

1. PRs explicitly named in the current conversation's immediately preceding `/orchestrate` run.
2. That run's scratchpad `queue-run.jsonl`, per-ticket artifacts, and final status summary.
3. PR URLs recorded on the corresponding GitHub tickets.

Do not substitute every open PR in an account or repository. Exclude PRs and worktrees identified as
another session's work. If the recovered set is not unique, ask Thomas for the missing PR links before
any merge.

Freeze a ledger containing repository, PR number/URL, ticket, base branch, approved head SHA, head
branch, worktree path, and review artifact. Append later merge and cleanup results; never silently
replace the set.

## Preflight once, before the first merge

Read the repository instructions and confirm every external response shape live before reading its
fields. Then prove for every frozen PR:

- state is OPEN, base is `main`, and draft is false;
- the independent `pr-review` verdict is CLEAN for the recorded approved head;
- the Codex connector reviewed that head and every Codex review thread is resolved;
- all CI checks on that approved head are settled and green;
- the PR is mergeable against its then-current base;
- its ticket board Status is In Review, or is In Progress only for a handoff Thomas has now accepted;
- `node tools/complete-ticket.mjs --issue "<actual-ticket-reference>" --preflight` succeeds for its
  open ticket and configured project item;
- its worktree and branch belong to this PR, not another session.

Run the completion preflight for EVERY frozen pull request before merging ANY of them. Abort before
merging anything if a target fails preflight. Do not turn `/merge-prs` into a fixer.

## Compute the merge order

Build a dependency DAG and topologically sort it:

1. Respect explicit stacked bases, ticket relations, PR-body dependencies, and cross-links.
2. Merge schema, migration, API, or other provider changes before their consumers.
3. Merge shared/foundation changes before feature changes that use them.
4. For cross-repo work, merge `orbit-api` before `orbit-ui-mobile`, then landing consumers.
5. Use ascending PR creation/number order only as the deterministic tie-breaker for independent work.

Print the frozen order once. Do not repeatedly re-plan it. Independent repository lanes may run in
parallel only when the DAG proves there is no provider/consumer edge.

## Fast merge loop

For each PR in order:

1. Re-read PR state and exact head SHA. Stop on an unexpected user push or changed target.
2. Fetch the repository's current `main` using the scoped token.
3. If `main` advanced since the PR's approved base, run:

   ```text
   gh pr update-branch <pr> --repo <owner/repo>
   ```

   Use the normal merge-commit update; never `--rebase`.
4. If GitHub reports a conflict:
   - Regenerate canonical generated artifacts for generated-only conflicts, stage named files, commit,
     and push normally.
   - For a product-code conflict or ambiguous resolution, stop that dependency lane and hand over the
     exact files. Approval of the old diff is not approval of newly invented conflict resolution.
5. Fetch the updated PR head. Prove it contains the approved head and current base, and that every new
   commit is only the base integration or the generated-only conflict resolution just recorded.
6. Do **not** wait for CI or request pr-review/Codex again for that mechanical update. Those receipts
   were frozen at preflight; avoiding a serial full-matrix rerun is this skill's purpose.
7. Admin-squash merge the exact head:

   ```text
   gh pr merge <pr> --repo <owner/repo> --admin --squash --match-head-commit <updated-head-sha>
   ```

8. Confirm live that state is MERGED and record the squash commit before advancing the next PR.

`--admin` bypasses branch-policy waiting; it does not make a conflicted or raced head acceptable.

## Tickets and cleanup

Immediately after each confirmed merge:

1. Set the ticket board Status to Done, close the GitHub issue as completed, and add one concise
   idempotent comment with repository, PR, and squash SHA. Never mark Done or close the ticket before
   GitHub confirms MERGED. Run
   `node tools/complete-ticket.mjs --issue "<actual-ticket-reference>"` for the Done and close
   transition. Use only repository ticket tools and never issue a raw ticket mutation.

   That tool now posts the ticket's **manual steps** as a comment before it closes the issue, and
   returns them on its `manualSteps` field. **Collect every one of them across the merged set.** A
   ticket with no such step returns null and is silent, which is the normal case.
2. Run the repository's canonical teardown tool for that ticket.
3. If a server-side update left the local worktree at the approved head, fetch
   `refs/pull/<pr>/head`, fast-forward that exact local branch, and rerun teardown.
4. Delete the remote head branch only after confirming the PR is merged; accept already-absent as
   success.
5. Never touch an unscoped worktree, branch, terminal, untracked file, or another session's PR.
6. Never use raw `git worktree remove --force`. For a residual directory after registered teardown,
   validate its absolute path, inspect junctions/reparse points, remove junctions first, and use the
   safe native cleanup path required by repository instructions.

After the full set merges, fetch/prune and fast-forward each primary `main` checkout. Preserve all
pre-existing unrelated residue.

## Final audit

Do not finish until the ledger proves:

- every frozen PR is MERGED with a squash SHA;
- every ticket is Done with one merge comment;
- every target worktree and local/remote head branch is gone;
- every explicitly excluded worktree and unrelated residue still exists untouched;
- each primary checkout is on clean, current `main` except documented pre-existing residue.

Return the merge order, PR/ticket/commit mapping, cleanup result, exclusions preserved, and any lane
that required a human conflict handoff.

## Still outstanding: the manual steps this merge did NOT do

End the report with one explicit **"Still outstanding"** list: every manual step collected above, per
merged ticket, expanded and numbered, or the single line `No manual steps outstanding.`

This is not a courtesy summary. orbit-tickets#81 merged on 2026-08-08 with the body line "Rollout:
merge, deploy to Render, then set `PostHog:ApiKey` in the Render env. The code path is inert until
the key exists." Review was clean, CI was green, the ticket closed Done, and nothing in this skill
ever mentioned the key. It happened to be set already, so nothing was lost, which is exactly why it
is worth writing down: the merge path could not tell the difference. A merge is not a deploy and a
deploy is not a rollout. Say what is left, at the moment Thomas is reading, or it is not said at all.

**Never do the step yourself.** These land in a vendor console under Thomas's account. Print them.
