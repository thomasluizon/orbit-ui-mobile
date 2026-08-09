# tools/

> **At a glance** - reusable, agent-callable scripts for the Orbit harness, versioned with the repo.
> - A script lives here when it is worth running more than once. Throwaways go to the scratchpad, never here; `check-root-allowlist.mjs` enforces that boundary.
> - Every tool is non-interactive, supports `--help`, and returns meaningful exit codes (see `CONVENTIONS.md`).
> - `test-tools.mjs` EXECUTES every script here. A new tool with no coverage entry fails it, so coverage lands in the same PR as the tool.
> - The orchestration core includes queue planning, prompt/worker isolation, delivery verification,
>   final-head readiness receipts, ticket synchronization, review-thread handling, and teardown.
> - `verify-delivery.mjs` is the SOLE authority for the word "delivered". A worker's exit code is never evidence.
> - `list-bot-threads.mjs` makes "the second reviewer never ran" a verdict. Silence is never read as approval.

Reusable scripts an agent (or a human) invokes from the CLI. The bar for landing a file here: it has a
single clear purpose and you will run it again. One-off commands stay in your shell history or the
scratchpad. The root allowlist gate rejects any undeclared root file or directory regardless of its
name or git status. Read `CONVENTIONS.md` before adding one.

## The orchestration core

| Tool | What it does | Usage |
|---|---|---|
| `plan-queue.mjs` | Resolves a scope (explicit tickets, a GitHub milestone, or the configured board) into ONE ordered execution plan: admission and deferrals, DAG-safe waves, transitive fan-out (`unlocks`), and stackable dependency chains. A ticket whose same-repo blockers do not form one chain has no branch that can carry them, so it defers as `UNSTACKABLE_BLOCKERS_IN_QUEUE` and the rest of the board still plans; cross-repo blockers order but never stack. A still-open blocker outside the queue defers the ticket. It plans only, and writes nothing anywhere. | `node tools/plan-queue.mjs (--tickets ORB-1,ORB-2 \| --project <name> \| --board)` (`--format markdown`) |
| `compose-prompt.mjs` | Builds one worker prompt: the GitHub ticket body verbatim, the orchestrator's brief (objective, scope, output, boundaries), and the finishing contract. Refuses to write inside any declared repo, because a worker that finds its own work order in the tree can commit it. | `node tools/compose-prompt.mjs --issue ORB-N --repo <ui\|api\|landing> --out <abs path>` |
| `launch-worker.mjs` | Spawns one headless worker and supervises it in the foreground. Both clocks kill the complete process tree. Review mode requires an explicit repository, runs from that repository's primary main checkout, and mechanically rejects UI/API pr-review drift. GitHub credentials are owner-selected per child environment; global account state is never switched. A codex-only post-worker PR-body edit persists the pre-edit Guards baseline first, so later delivery cannot reuse old green CI. | `node tools/launch-worker.mjs --issue ORB-N --worktree <path> --prompt <file>` or `node tools/launch-worker.mjs --issue ORB-N --review --repo <key> --prompt <file>` |
| `verify-delivery.mjs` | Derives delivery solely from bounded Git and GitHub children: clean/pushed/current PR, exact current-head CI state, and GitHub compare `behind_by=0`. `OUT_OF_DATE` reports base/head SHAs and behind count. File and line counts remain `sizeAdvisory` and never block. Completed CI passes only on the confirmed `SUCCESS`, `NEUTRAL`, or `SKIPPED` allowlist; every other or future conclusion fails closed. Failed CI retains run/check ID, details URL, workflow, name, status and conclusion; newest rerun wins. `--codex-only` mechanically restores the degraded first line after later body edits. | `node tools/verify-delivery.mjs --issue ORB-N --worktree <p> --branch <b> --repo <key> [--codex-only]` |
| `record-readiness.mjs` | Re-reads the live PR base/head/draft and compare state, then persists and evaluates one repository-qualified receipt. READY requires CI, independent review, current connector review, zero threads, current base/head, non-draft state, live `behind_by=0`, and ticket synchronization simultaneously. Head/base changes produce explicit stale verdicts. In codex-only mode it persists the pre-edit Guards baseline before reasserting the degraded first line and refuses READY until replacement runs register. | `node tools/record-readiness.mjs --repo <key> --pr <n> --delivery <json> --review <json> --bot <json> --ticket <json> [--codex-only]` |
| `sync-issue-state.mjs` | Asserts the live ticket carries exactly the `repo:<key>` label matching `--repo` before either write, so a mistyped ticket key cannot move or comment on a stranger's ticket. Moves working and blocked states to In Progress and simultaneous technical readiness to In Review, never Done. Stores the last posted state to suppress duplicate comments and emits a receipt for the readiness state machine. | `node tools/sync-issue-state.mjs --issue ORB-N --repo <key> --pr <n> --state <working\|blocked\|ready> --head-sha <sha> --base-sha <sha> --message-file <path\|->` |
| `list-bot-threads.mjs` | Reports the repository-qualified Codex connector state for one PR. A bare number requires `--repo`; a full PR URL is accepted only when it maps unambiguously. A GitHub Review or clean connector issue comment counts only when its reviewed commit matches the current head. GitHub children have hard timeouts and full-tree cleanup; progress is emitted while waiting. Unresolved threads are reported separately. | `node tools/list-bot-threads.mjs --pr <n-or-url> --repo <key>` (`--wait-seconds`, `--poll-seconds`, `--command-timeout-seconds`, `--bot`) |
| `resolve-bot-thread.mjs` | Resolves the thread node FIRST and refuses unless its repository equals the slug `--repo` resolves to, so a globally unique node id can no longer choose a target in somebody else's repository. Then replies to ONE Codex review thread and resolves it, in that order, never the resolve alone: a closed thread with no reason is indistinguishable from one nobody read. Reply body on stdin; an empty body is refused before any mutation. | `node tools/resolve-bot-thread.mjs --thread <PRRT_...> --repo <ui\|api\|landing> < reply.txt` (`--dry-run`) |
| `salvage-worker.mjs` | Inventories a dead worker's dirty tree, runs a caller-specified workspace test into a real receipt, refuses unrelated pre-staged paths, and stages only repeated named paths. It may run before PR creation; once a PR exists it registers the repository-qualified PR as unready before commit/push. | `node tools/salvage-worker.mjs --issue ORB-N --repo <key> [--pr <n>] --worktree <p> --branch <b> --run-root <p> --test-command <json> --test-receipt <json> --message <m> --path <path>...` |
| `teardown-worktree.mjs` | Removes one completed Orca worktree only after four independent work-loss checks pass: clean tree, PR merged with its merge commit in the target branch, local tip contained in the PR head, and the ticket closed with board status Done. Verifies removal from the filesystem and git, never from Orca's reply. | `node tools/teardown-worktree.mjs (--issue ORB-N \| --worktree <path>) --repo <key>` |
| `lib/orchestrator-config.mjs` | The one reader of `.claude/orchestrator.json`. Resolves the engine invocation and refuses a working copy that disagrees with `origin/main` when the checkout does not contain it, which is how a launch once started a worker on an already-superseded model. | imported, not invoked |
| `lib/github-issues.mjs` | The one adapter for GitHub tickets. Resolves migrated ORB identifiers, normalizes issue and Projects v2 state, asserts the repository label before caller-owned writes, sets board status, posts comments, and lists tickets. | imported, not invoked |
| `lib/github-target.mjs` | Judges whether a caller-supplied GitHub node id belongs to the repository the caller named, before any write. A node that resolves elsewhere, or does not resolve at all, is refused. Also recognises the permissions error GitHub returns for a write aimed at another owner, so that error stops reading as a transient glitch. | imported, not invoked |
| `lib/identifier-ledger.mjs` | Records every node id the harness genuinely read back from GitHub, in `.git/orbit-observed-identifiers.json`. `list-bot-threads.mjs` writes it; `.claude/hooks/forbid-invented-identifier.mjs` reads it to tell a copied id from a typed one. | imported, not invoked |

## Product gates

These back required CI checks. They fail a merge.

| Tool | What it does | Usage |
|---|---|---|
| `check-dashes.mjs` | Fails on an em dash or en dash in a changed file, a PR title, or a PR body. Backs `Dash Ban`. Its baseline may only shrink. | `node tools/check-dashes.mjs --check` |
| `check-copy.mjs` | Enforces the copy register. Backs `Copy Register`. | `node tools/check-copy.mjs --check` |
| `check-suppressions-ratchet.mjs` | Fails when the lint-suppression count grows. Backs `Suppressions Ratchet` (escape hatch: the `ratchet:reseed` label). | `node tools/check-suppressions-ratchet.mjs` |
| `check-push-target.mjs` | Refuses a push whose target is a protected branch. | `node tools/check-push-target.mjs` |
| `check-root-allowlist.mjs` | Fails when an undeclared file OR directory exists at the repository root, including ignored and untracked ones. Backs `Root Allowlist`; declarations live in `root-allowlist.json`. | `node tools/check-root-allowlist.mjs` |

## Architecture map and visual evidence

| Tool | What it does | Usage |
|---|---|---|
| `arch-map.mjs` | Generates `architecture.json` and `architecture.html`, what an agent reads INSTEAD of exploring the codebase. Kept current by `arch-map.yml` in both repos; without that workflow it rots silently. | `npm run arch:map` |
| `surface-manifest.mjs` | Derives the visual-surface inventory into `.claude/manifests/surfaces.json`, one cell per surface x theme x locale. Emits no status field on purpose. | `npm run surfaces:manifest` |
| `capture-surfaces.mjs` | Playwright capture of one screenshot per manifest cell into `.artifacts/surfaces/`, against a running local stack. Reports every surface it cannot reach rather than skipping it. The D7 evidence mechanism. | `ORBIT_AUTH_TOKEN=... npm run surfaces:capture` |
| `orca-web-port.mjs` | Assigns a deterministic web port in the 3100-4099 window per Orca worktree and records it in the ignored `.orca/web-port`. Root stays on 3000; the database and API stay shared on 5432 and 5000. | `node tools/orca-web-port.mjs` (`--setup`) |

## Harness self-test

| Tool | What it does | Usage |
|---|---|---|
| `test-tools.mjs` | Executes every tool in this directory against its contract and fails on any tool with no coverage entry. Review-only evidence is not sufficient: a harness that is read but never run is how a gate reports green over work that never happened. | `node tools/test-tools.mjs` |
| `record-gh-fixtures.mjs` | Re-records the GitHub issue, label, and Projects v2 response path/type manifest from read-only live `gh` commands. It never creates, edits, comments on, or closes a ticket. | `node tools/record-gh-fixtures.mjs` |

Its sibling is `node .claude/hooks/test-hooks.mjs`, which proves the four session hooks block and allow
as specified, and that every hook wired in `.claude/settings.json` exists on disk and vice versa.

## Fixtures

`__fixtures__/gh-issue-envelopes.json` is recorded real `gh` output. Tests assert against what the CLI
actually emitted, never against a hand-written shape. Re-record it only with
`node tools/record-gh-fixtures.mjs`. The recorder is read-only and emits no write envelope. Two measured
incidents in this repository involved a worker inventing a field while the same commit added a mock that
agreed with the guess, so the harness stayed green over a real defect.
