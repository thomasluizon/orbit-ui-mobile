# Orbit hook engine: shared logic core

The surviving session hooks keep their rule logic **once** in this `_lib/`
directory. The `.mjs` files in `.claude/hooks/` are thin adapters: read the stdin
payload, call a `_lib` rule, `exit 2` + stderr on a block. Wired in
`.claude/settings.json` (`SessionStart` / `PreToolUse` / `PostToolUse`).

Every `PreToolUse` guard is registered on **PowerShell** and `Bash` so either
shell receives the same checks. `forbid-approval-prompt` is the one exception:
it mirrors a check that Claude Code runs for the Bash tool and the Monitor tool,
so it is registered on `Bash` and `Monitor`.

Deterministic checks live in ESLint, Roslyn, and `guards.yml`.
Session hooks block commands or edits before they happen.

| `_lib` module | rules | Claude Code hook |
|---|---|---|
| `rules-git.mjs` | git workflow (protected main, no-verify, worktree junction footgun) | git-guardrails (PreToolUse Bash, PowerShell) |
| `rules-orchestrator.mjs` | model spend routes through the launcher; no agent admin merge | orchestrator-guardrails (PreToolUse Bash, PowerShell) |
| `rules-lessons.mjs` | count unreviewed lesson headings before `## Graduated` | surface-pending-lessons (SessionStart) |
| `rules-source.mjs` | idempotent raw index SQL in EF migrations | forbid-ef-migration-raw-index (PostToolUse Edit/Write) |
| `rules-dependencies.mjs` | nothing writes inside `node_modules`, for any caller | forbid-node-modules-write (PreToolUse Write/Edit/MultiEdit, Bash, PowerShell) |
| `rules-approval.mjs` | an unattended run refuses each shell command that Claude Code holds for an approval | forbid-approval-prompt (PreToolUse Bash, Monitor) |
| `working-directories.mjs` | the directories that the settings files add to the working directories of a session | forbid-approval-prompt |
| `repo-roots.mjs` | which repository owns a path, and the linked worktree that resolves to its main checkout | orchestrator-guardrails, forbid-worker-browser, forbid-invented-identifier |
| `rules-handoff.mjs` | a committed or stopping `NEXT.md` matches the handoff mode the owner asked for | require-handoff-prompt (PreToolUse Bash, PowerShell; Stop) |
| `handoff-git.mjs` | every `NEXT.md` version a commit could record, and the newest committed one on any branch | require-handoff-prompt |
| `io.mjs` | payload normalizers | both |

`rules-orchestrator.mjs` is **cost-raising defence in depth and never the control**:
it is bypassable through another tool, a shell wrapper, or script-file indirection,
and its own header says so. The control for the admin merge is the prohibition in
the worker contract and `CLAUDE.md`.

`rules-dependencies.mjs` splits the same way, and its header names the split. The
FILE path (Write, Edit, MultiEdit) is the one it really closes, because that is
how an agent edits. The COMMAND path is defence in depth with disclosed bypasses.
Detection for whatever still arrives is `node tools/check-dependency-edits.mjs`.

## What Claude Code holds for an approval in every permission mode

`rules-approval.mjs` reads this from the permission flow of the installed Claude Code (2.1.325).
In `bypassPermissions` mode that flow allows a call unless a `safetyCheck` reason carries a circuit
breaker with `bypassImmune: true`. Read the list again from the installed source when Claude Code
changes; do not extend it from memory.

| circuit breaker | raised by | hook coverage |
|---|---|---|
| `dangerousRemoval` | the Bash tool and the Monitor tool, for `rm` and `rmdir` | `REMOVAL_RULES`, one rule for each group of `removalRule` values |
| `unfinishedCheck` | a permission check that threw | none: no command shape exists |
| `restrictedMode` | a session in restricted mode | none: a session setting, not a command |
| `outsideReadsBlocked` | `permissions.blockReadsOutsideWorkingDirectories` | none: this repository does not set it |
| `isolatePeerMachines` | the SendMessage tool | none: not a shell command |
| `connectorFileSend` | a connector tool | none: not a shell command |

Each removal rule refuses a superset of the `removalRule` values it names, because the analyzer
behind them is not a stable interface. Three values depend on the state of that analyzer and have no
command shape: `unparsed_line`, `nestedSpansOverrun` and `backtick_body_overrun`. A script file that
runs `rm` is not read either. For those cases, and for `unfinishedCheck`, the control is the stuck
limit in `tools/lib/background-runs.mjs`: a background subagent that waits on a prompt makes no
transcript progress, and the drain stops its wait after the limit.

The Bash tool and the Monitor tool share one permission check, and no other tool calls it:
`REMOVAL_CHECK_TOOLS` holds both names, and `.claude/settings.json` registers the hook on both.

The removal check also holds a removal of a working directory of the session. Claude Code builds
that set from the session directory and from `permissions.additionalDirectories` of each settings
source. `working-directories.mjs` reads the sources that are files: the user settings, the project
settings, the local project settings, `managed-settings.json` and its `managed-settings.d`
directory. A relative entry resolves from the project directory. A hook cannot read three sources:
a directory from `--add-dir` or `/add-dir` that no settings file holds, the `--settings` argument,
and a managed policy that is not a file. The stuck limit covers a prompt from one of those.

The hook is active for a launched worker (`ORBIT_LAUNCH_WORKER`) and for the session that owns a
`sleep: true` run record, with its subagents. An attended session receives no refusal. It loads
only in a session whose project checkout holds it, so a worker in a repository without the hook
receives no refusal: `tools/compose-prompt.mjs` writes that fact into the order of such a worker.

`node .claude/hooks/test-hooks.mjs` proves it with `_lib` unit checks, real hook
files run against stdin payloads, bidirectional wiring checks, and required
agent and skill frontmatter fields. Run it locally after touching anything here.
