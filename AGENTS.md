# AGENTS.md (orbit-ui-mobile)

Instructions for Codex (CLI workers and the cloud reviewer). Claude Code reads
CLAUDE.md; the two must not fork: this file holds the worker contract and the review
rules, and DEFERS to `CLAUDE.md` (same directory) for repo conventions. Read CLAUDE.md
before writing code.

## Worker contract

- Your prompt is a Linear ticket body. Execute exactly it: scope and out-of-scope are
  binding; an impossible or contradictory ticket means STOP and report, never improvise.
- Finish = lint + type-check + tests green for the touched workspaces, commit, push,
  one PR to the ticket's target branch linking `ORB-N`, then own its review cycle
  through approval with zero unresolved threads. The pull request must be ready for review, never a draft.
  Never merge. Never push to `main` or `redesign/main` directly.
- After pushing, poll your pull request. Reconcile each automated review finding
  against the diff, fix valid findings, commit and push the fix, reply on the thread
  naming the fix commit, resolve the thread, and repeat until the review decision is
  approved with zero unresolved threads. Never resolve a thread opened by a human,
  and never report completion while any thread remains unresolved.
- Use `node tools/pr-watch.mjs --repo <owner/name> --pr <number> --once` for each
  low-level transition wake-up only. After every call and before waiting or
  reporting completion, run
  `node tools/worker-status.mjs --worktree <path> --issue ORB-N --json`. That
  full-surface completion poll inventories review submissions, review threads and
  their nested comments, and PR conversation comments, and fails closed on an
  incomplete inventory. Read unmet item bodies through GitHub's read APIs,
  reconcile them, then poll again. An informational automated finding that needs
  no code change may be resolved after replying with
  `No code change required: <reason>. Evidence: <PR commit>`. The named commit must
  be on the PR and change the reviewed path.
- For an automated finding in a review body or PR conversation comment with no
  thread, post a PR comment naming that activity ID and the PR commit that addresses
  it so the pre-merge verification can prove it was handled.
- Escalate when you disagree with a finding, when you are blocked on a decision you
  may not make, or when two consecutive cycles fail on the same finding. Report one
  escalation carrying the finding and your reasoning; otherwise report once when the
  pull request is approved with zero unresolved threads.
- Parity is mandatory for `parity:yes` tickets: `apps/web` and `apps/mobile` change in
  the SAME PR, logic and behaviour identical; i18n keys land in `en.json` AND
  `pt-BR.json` in the same edit.
- `visible-effect` tickets: capture the affected surfaces, read every captured
  screenshot, and critique the pixels against `DESIGN.md` plus
  `RENDER-CORRECTNESS.md`. Revise and re-capture until the critique is clean or a
  hard cap of three capture-critique iterations is reached; the cap prevents a
  subjective review loop from consuming the worker budget. Before In Review, attach
  the final screenshots and the critique to the Linear issue. At the cap, the
  critique must explicitly report every unresolved finding. For `parity:yes`, critique
  both platforms or name the platform not covered and why.
- Gates you will hit (all CI-enforced, none optional): ESLint `local/*` rules, the
  spacing-scale and z-index ratchets (`eslint-suppressions.json` may only shrink), the
  dash ban (`tools/check-dashes.mjs`; never type an em dash anywhere, including
  commits and PR text), the copy register (`tools/check-copy.mjs`), cross-platform
  parity, and the arch-map drift job (`node tools/arch-map.mjs` after changing routes,
  endpoints, or module structure, commit the regenerated artifacts).
- Never edit a gate baseline to admit a new violation. Fix the violation.

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

### Guardrails you must not trip

These hold for EVERY worker and every engine. They are enforced by CI, GitHub branch
protection, and the lefthook pre-commit/pre-push hooks, NOT by the Claude Code session
hooks (those do not run under a codex worker or a raw shell). This list is the readable
copy; the gates are the enforcement.

- Never push or force-push to `main` (or `redesign/main`). Branch to
  `feature/`|`fix/`|`chore/`, open a PR, squash-merge only. Never reuse a squash-merged
  branch.
- Never bypass the git hooks: no `--no-verify` (or its `-n` commit alias), no
  `--no-gpg-sign` and no `commit.gpgsign=false`. Fix what a hook flags, then commit.
- Never `git worktree remove --force`: on Windows it follows a junction and deletes the
  link target. Remove the junctions first, then remove the worktree without `--force`.

## Code Review Rules

Only what no gate can check; mechanical findings belong to CI and are noise here.
Flag P0/P1 only.

1. **A DTO field renamed, removed, or retyped that a shipped mobile client still
   reads.** The Contract Drift job cannot judge this: it does not know the Play-fleet
   lag. Safe path: append-only optional fields; breaking changes use expand-contract
   plus the `AppConfig.MinSupportedVersion` gate.
2. **`AppConfig.MinSupportedVersion` raised before the carrying build is live in the
   Play fleet.** Safe path: raise it only after the build carrying the change is the
   fleet minimum.
3. **A mobile mirror that exists but behaves differently from the web change.** The
   parity CI job sees file presence, not behaviour. Safe path: same logic, same error
   handling, same i18n keys; platform adapters differ only in the adapter layer.
4. **A load-bearing string changed**: URL slug, anchor id, primary nav label, form
   field `name` or order. Every test stays green while SEO/analytics/autofill
   regresses. Safe path: treat as a decision needing sign-off, not a refactor.
5. **A field, flag, or exit code read from an external interface with no evidence in the
   pull request body, or a harness fixture asserting a shape no evidence supports.** No
   gate can see this: the harness is green precisely because the author wrote both the
   code and the fixture. Safe path: the complete redacted response shape plus a way to
   re-derive it, or a design that does not read the unconfirmed field.
