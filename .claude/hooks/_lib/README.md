# Orbit hook engine: shared logic core

The surviving session hooks keep their rule logic **once** in this `_lib/`
directory. The `.mjs` files in `.claude/hooks/` are thin adapters: read the stdin
payload, call a `_lib` rule, `exit 2` + stderr on a block. Wired in
`.claude/settings.json` (`SessionStart` / `PreToolUse` / `PostToolUse`).

Every shell guard in `PreToolUse` is registered on the `Bash|Monitor` matcher and on
**PowerShell**, so each tool that runs a shell command receives the same checks. In Claude
Code 2.1.325 the Monitor tool takes a shell command as `tool_input.command` and sends it through
the permission check of the Bash tool. Claude Code 2.1.325 also runs the hooks of a `Bash`
matcher for a Monitor call that has a command, and sends them `tool_name: "Bash"`. That rule is
internal to Claude Code, so the matcher names `Monitor` explicitly: each guard then gets
`tool_name: "Monitor"` and the full Monitor input, and the guarantee does not depend on that rule.
A Monitor that opens a WebSocket (`tool_input.ws`) has no command, and each guard allows it.
`forbid-approval-prompt` is the one exception: it mirrors that shared check, so it is on
`Bash|Monitor` and not on `PowerShell`. It is also registered on each tool in
`PERSON_PROMPT_TOOLS`, which waits for the answer of a person. `test-hooks.mjs` fails when a guard
on the Bash matcher is not also on the Monitor matcher, or has no Monitor refusal test.

Deterministic checks live in ESLint, Roslyn, and `guards.yml`.
Session hooks block commands or edits before they happen.

| `_lib` module | rules | Claude Code hook |
|---|---|---|
| `rules-git.mjs` | git workflow (protected main, no-verify, worktree junction footgun) | git-guardrails (PreToolUse Bash, Monitor, PowerShell) |
| `rules-orchestrator.mjs` | model spend routes through the launcher; no agent admin merge | orchestrator-guardrails (PreToolUse Bash, Monitor, PowerShell) |
| `rules-lessons.mjs` | count unreviewed lesson headings before `## Graduated` | surface-pending-lessons (SessionStart) |
| `rules-source.mjs` | idempotent raw index SQL in EF migrations | forbid-ef-migration-raw-index (PostToolUse Edit/Write) |
| `rules-tickets.mjs` | writes to the ticket repository and its project board go through the repository tools | forbid-raw-ticket-mutation (PreToolUse Bash, Monitor, PowerShell; PostToolUse Edit/Write/MultiEdit) |
| `rules-identifier.mjs` | a GitHub node id in a command comes from output that this run read | forbid-invented-identifier (PreToolUse Bash, Monitor, PowerShell) |
| `rules-worker.mjs` | a launched worker starts no dev server, browser driver or emulator | forbid-worker-browser (PreToolUse Bash, Monitor, PowerShell) |
| `rules-dependencies.mjs` | nothing writes inside `node_modules`, for any caller | forbid-node-modules-write (PreToolUse Write/Edit/MultiEdit/NotebookEdit, Bash, Monitor, PowerShell) |
| `rules-approval.mjs` | an unattended run refuses each shell command that Claude Code holds for an approval, and each tool that waits for the answer of a person | forbid-approval-prompt (PreToolUse Bash, Monitor, and each tool in `PERSON_PROMPT_TOOLS`) |
| `working-directories.mjs` | the directories that the settings files add to the working directories of a session | forbid-approval-prompt |
| `repo-roots.mjs` | which repository owns a path, and the linked worktree that resolves to its main checkout | orchestrator-guardrails, forbid-worker-browser, forbid-invented-identifier |
| `rules-handoff.mjs` | a committed or stopping `NEXT.md` matches the handoff mode the owner asked for | require-handoff-prompt (PreToolUse Bash, Monitor, PowerShell; Stop) |
| `handoff-git.mjs` | every `NEXT.md` version a commit could record, and the newest committed one on any branch | require-handoff-prompt |
| `rules-relay.mjs` | the context relay: drain sources, thresholds, and the superseded session | relay-at-threshold (PostToolUse, Stop), require-wake-source (Stop), forbid-superseded-session (PreToolUse, UserPromptSubmit) |
| `rules-sleep.mjs` | an unattended run never ends a turn with no live wake source | require-wake-source (Stop) |
| `command-expander.mjs` | shell bodies read as words and commands, with no part run | the shell rules above |
| `io.mjs` | payload normalizers | each adapter |

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

The 11 rules in `REMOVAL_RULES`, in source order, and the `removalRule` values
that each one covers (the `covers` text of its refusal):

| rule | covers |
|---|---|
| `command-substitution` | `wholeSubstitution`, `emptyExpansion` |
| `variable-path` | `variable_path`, `variable_path_set_in_command`, `var_root_child`, `placeholder_root_child` |
| `brace-expansion` | `inline_shell_unchecked` |
| `windows-path` | `backslash_only`, `windows_unplaceable_path` |
| `derived-variable` | `derived_var` |
| `glob-target` | `unresolvable_target`, `relative_glob_after_cd`, `multi_level_glob` |
| `critical-path` | `root`, `home`, `tmp`, `other_critical_path` |
| `working-directory` | `working_directory` |
| `mounted-drive` | `mounted_drive_path` |
| `unreadable-script` | `inline_shell_unchecked`, `eval_trap_string`, `unparsed_line` |
| `unmodelled-construct` | `inline_shell_unchecked`, `unparsed_line` |

`unmodelled-construct` is the fail-closed rule, and `checkGitCommand` in `rules-git.mjs` applies the same reading to the git rules.
The reader in `command-expander.mjs` reads a command exactly only for the constructs that it models in one way for bash and for zsh.
`unmodelledConstruct` names each other construct:

- a here-string
- a `$"..."` quote
- a run of `$` before a `'`
- an ANSI-C quote that spells a character as a code
- a line continuation inside a word
- a `<<` that is no heredoc with one plain end marker line
- a quote or an escape in the name of a program that the rules read
- an `eval` or a `-c` script that holds the value of a variable

For a command with one of these, the rules read the text again with `looseReadings`: no quote, no escape, and each word
counts as a word of a command. A command passes only when that text holds nothing that a rule refuses. The refusal asks for a
plain form. A heredoc body that no shell reads is data, so a construct that the body names does not count. Add a construct to
this list when the reader cannot prove one reading; do not add one more exact case to the reader.

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

## What waits for the answer of a person

A tool that asks a person stops the run until the person answers, with no limit. Claude Code 2.1.325
marks five tools with `requiresUserInteraction() { return true }`: `AskUserQuestion`,
`OfferChromeSetup`, `PublishPlugin`, `SendToProject` and `ShowOnboardingRolePicker`.
`PERSON_PROMPT_TOOLS` holds the five names, and `.claude/settings.json` registers the hook on each.
In an unattended run, `checkPersonPrompt` refuses each one by its name. Its message tells the agent
to decide with the best option and to write the decision to the decision log. For a real owner
question, the agent adds a `{ question, blocks }` row to `openOwnerQuestions` through
`updateRunState` and asks the question in plain reply text, which never blocks the run.
A launched worker records the decision in the assumptions section of its order.

## When the refusals apply

Both refusals are active for a launched worker (`ORBIT_LAUNCH_WORKER`) and for the session that owns a
`sleep: true` run record, with its subagents. An attended session receives no refusal. The hook loads
only in a session whose project checkout holds it, so a worker in a repository without the hook
receives no refusal: `tools/compose-prompt.mjs` writes that fact into the order of such a worker,
and tells every local worker to call no tool that waits for a person.

`node .claude/hooks/test-hooks.mjs` proves it with `_lib` unit checks, real hook
files run against stdin payloads, bidirectional wiring checks, and required
agent and skill frontmatter fields. Run it locally after touching anything here.
