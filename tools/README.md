# tools/

> **At a glance** - reusable, agent-callable scripts for the Orbit harness, versioned with the repo.
> - A script lives here when it is worth running more than once. Throwaways go to the scratchpad, never here; `check-root-allowlist.mjs` enforces that boundary.
> - Every tool is non-interactive, supports `--help`, and returns meaningful exit codes (see `CONVENTIONS.md`).
> - `test-tools.mjs` EXECUTES every script here. A new tool with no coverage entry fails it, so coverage lands in the same PR as the tool.
> - Nine of these are the orchestration core: `plan-queue`, `compose-prompt`, `launch-worker`, `verify-delivery`, `list-bot-threads`, `resolve-bot-thread`, `teardown-worktree`, `lib/orchestrator-config`, and `test-tools` itself.
> - `verify-delivery.mjs` is the SOLE authority for the word "delivered". A worker's exit code is never evidence.
> - `list-bot-threads.mjs` makes "the second reviewer never ran" a verdict. Silence is never read as approval.

Reusable scripts an agent (or a human) invokes from the CLI. The bar for landing a file here: it has a
single clear purpose and you will run it again. One-off commands stay in your shell history or the
scratchpad. The root allowlist gate rejects any undeclared root file or directory regardless of its
name or git status. Read `CONVENTIONS.md` before adding one.

## The orchestration core

| Tool | What it does | Usage |
|---|---|---|
| `plan-queue.mjs` | Resolves a scope (explicit tickets, a Linear project, or the whole board) into ONE ordered execution plan: which tickets are admissible, which are deferred and why, the wave order, and which of them stack. A blocker inside the queue is a stack edge because the branch can carry it; a blocker outside it that is still open defers the ticket, because its branch would have to contain work that does not exist. Cross-repo blockers order but never stack: GitHub requires one repository per stack. It plans only, and writes nothing anywhere. | `node tools/plan-queue.mjs (--tickets ORB-1,ORB-2 \| --project <name> \| --board)` (`--format markdown`) |
| `compose-prompt.mjs` | Builds one worker prompt: the Linear ticket verbatim, its comments in order, the orchestrator's brief (objective, scope, output, boundaries), and the finishing contract. Refuses to write inside any declared repo, because a worker that finds its own work order in the tree can commit it. | `node tools/compose-prompt.mjs --issue ORB-N --repo <ui\|api\|landing> --out <abs path>` |
| `launch-worker.mjs` | Spawns ONE headless worker and supervises it in the foreground, so its death is the orchestrator's wake signal. stdin is explicitly closed: an inherited-but-unwritten pipe hangs `codex exec` forever on Windows (openai/codex#20919). Two clocks from `config.timeouts`: a hard ceiling and a no-progress timer, both killing the whole process tree. | `node tools/launch-worker.mjs --issue ORB-N --worktree <path> --prompt <file>` (`--codex-only`, `--dry-run`) |
| `verify-delivery.mjs` | Derives one verdict from git and gh artifacts ONLY: `DELIVERED`, `NO_COMMIT`, `UNPUSHED`, `NO_PR`, `STALE_PR`, `OVERSIZE`. Exit 0 means delivered. Never reads the worker's own exit code, which proves nothing: `codex exec` exits 0 with zero output when detached from a TTY (openai/codex#19945), and `claude` can hang after emitting its own success event (anthropics/claude-code#25629). | `node tools/verify-delivery.mjs --issue ORB-N --worktree <p> --branch <b>` |
| `list-bot-threads.mjs` | Reports what the GitHub Codex reviewer said about ONE pull request, and makes "it never reviewed" a verdict rather than a silence read as approval. Derives that verdict from the presence of a bot REVIEW, never from the thread count: an empty thread list is ambiguous between "clean" and "not yet", and a body-level `CHANGES_REQUESTED` opens no thread at all. Checks `isDraft` before waiting, because a draft attracts no review ever. Severity comes from the P1/P2/P3 badge, failing closed to P1. | `node tools/list-bot-threads.mjs --pr <n>` (`--wait-seconds`, `--poll-seconds`, `--bot`) |
| `resolve-bot-thread.mjs` | Replies to ONE Codex review thread and then resolves it, in that order, never the resolve alone. The reply is posted first and the resolve is attempted only once it is confirmed, so a bare resolve is impossible rather than discouraged: a closed thread with no reason is indistinguishable from one nobody read. Reply body on stdin; an empty body is refused before any mutation. | `node tools/resolve-bot-thread.mjs --thread <PRRT_...> < reply.txt` (`--dry-run`) |
| `teardown-worktree.mjs` | Removes one completed Orca worktree only after four independent work-loss checks pass: clean tree, PR merged with its merge commit in the target branch, local tip contained in the PR head, and the Linear issue Done. Verifies removal from the filesystem and git, never from Orca's reply. | `node tools/teardown-worktree.mjs (--issue ORB-N \| --worktree <path>)` |
| `lib/orchestrator-config.mjs` | The one reader of `.claude/orchestrator.json`. Resolves the engine invocation and refuses a working copy that disagrees with `origin/main` when the checkout does not contain it, which is how a launch once started a worker on an already-superseded model. | imported, not invoked |

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

Its sibling is `node .claude/hooks/test-hooks.mjs`, which proves the four session hooks block and allow
as specified, and that every hook wired in `.claude/settings.json` exists on disk and vice versa.

## Fixtures

`__fixtures__/orca-linear-envelopes.json` is RECORDED REAL CLI OUTPUT, 3,358 lines of it. Tests assert
against what the tools actually emitted, never against a hand-written shape. Do not regenerate it from
a guess: two measured incidents in this repository involved a worker inventing a field while the same
commit added a mock that agreed with the guess, so the harness stayed green over a real defect.
