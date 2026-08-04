# AGENTS.md (orbit-ui-mobile)

Instructions for Codex workers in this repository. Claude Code reads `CLAUDE.md`; the two must
not fork. This file DEFERS to `CLAUDE.md` (same directory) for every repo convention, so read it
before you write code. Your launch prompt already carries the objective, scope, caps, output
contract, and the merge and push prohibitions; this file holds only what neither of those does.

Beyond the gates `CLAUDE.md` names: `eslint-suppressions.json` and the dash and copy baselines
may only shrink, and any change to routes, endpoints, or module structure needs
`node tools/arch-map.mjs` re-run and its artifacts committed. Never edit a gate baseline to
admit a new violation; fix the violation.

### Never assume an external interface. Check it, then use it.

Before you read a field, flag, subcommand, exit code, or response shape from anything
outside this repository, confirm it exists. External means a CLI (`orca`, `gh`, `git`,
`codex`), an HTTP API, or a library you did not write.

Confirm it against the response itself, in this order:

1. Run a real invocation and read what came back.
2. If the command writes, read the installed package's own source where it builds the
   response.
3. If neither is possible, use schema introspection.

`--help` proves that a flag or a subcommand exists and nothing whatever about a response
body, so it never confirms a field. Documentation, your memory of a similar tool, and what
the shape "should" obviously be are never authority.

**Never satisfy an assumption by writing the stub that agrees with it.** You author both
the code and its harness fixture, so a fixture built from a guess makes the harness prove
that your code matches your belief, not that it works. A green harness over an invented
field is worth less than no test at all, because it buys false confidence.

**If you cannot confirm the field, do not read it.** Redesign so the unknown is not on the
path: use a value the interface already returns and the codebase already reads, or make the
operation's success depend only on the exit code. Say in the pull request body which field
you wanted and why you could not confirm it. Treating an unconfirmed field as a failure
signal is not failing closed, it is inventing a failure, because "the write failed" and
"the field does not exist" arrive as the same value.

When your change reads an external field, put the evidence in the pull request body,
whether or not the codebase already reads that field elsewhere. An existing read is not
evidence: it may be the unverified guess this rule exists to catch. You may cite the pull
request that first proved the field instead of running the command again.

What proves a field exists is the response shape, so paste the COMPLETE key set with types,
eliding nothing, and replace the values. Absence cannot be proven from an excerpt, and
absence is what this catches. Keep the literal format of any value your code parses: show a
timestamp as `"<ISO-8601 timestamp>"`, never as `"<redacted>"`, and list the full set of
accepted values for any field you compare against. A redacted block is not self-proving, so
also give the reviewer a way to re-derive it: the exact command with credentials replaced by
named placeholders, or the `file:line` in the installed package where the response is built.

Redact before you paste, always: never include a token, key, cookie, or credential in the
command you show, and replace any personal, customer, or account value with a placeholder.
A pull request body is readable by everyone with repository access and is permanent.

Measured cost of skipping this, both found on 2026-07-30:

A worker parsed `result.issue.updatedAt` out of `orca linear status set --json`. That field
does not exist. Every real post-merge Linear reassertion would have reported a false failure
and halted the unattended run at the first regressed ticket, on a write that had actually
succeeded. The harness stayed green through four review rounds because the same commit added
a mock that invented the field. Four rounds were spent tuning logic that could never run.

`tools/check-ticket.mjs` read `issue.parent` and matched a relation `relationship` of
`"parent"`. Orca emits neither, so the parent always resolved to null, the fallback that
could have answered was never reached, and the ledger-child gate merged by ORB-155 has never
once run against a real ticket. It reports green. Same defect class, opposite symptom: the
first fails loudly on work that succeeded, the second passes silently on work never checked.

Both shapes above are documentation and age like documentation. Confirm them yourself before
you rely on them; that is the whole point of this section.

## Guardrails you must not trip

- Never push or force-push to `main`, never reuse a squash-merged branch, and never bypass the
  git hooks: no `--no-verify` (or its `-n` commit alias), no `--no-gpg-sign`, no
  `commit.gpgsign=false`. Fix what a hook flags, then commit.
- Never perform an admin merge, in any shape: no `gh pr merge --admin`, no direct
  `PUT /repos/{owner}/{repo}/pulls/{number}/merge`, and no GraphQL `mergePullRequest`
  mutation. Naming the two raw API calls is deliberate; forbidding only the CLI flag leaves
  both API paths open. The admin override exists for Thomas alone. If a merge genuinely needs
  it, STOP and ask Thomas to merge it himself.
- Never `git worktree remove --force`: on Windows it follows a junction and deletes the link
  target. Remove the junctions first, then remove the worktree without `--force`.
