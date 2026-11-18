# Orbit hook engine: shared logic core

The surviving session hooks keep their rule logic **once** in this `_lib/`
directory. The `.mjs` files in `.claude/hooks/` are thin adapters: read the stdin
payload, call a `_lib` rule, `exit 2` + stderr on a block. Wired in
`.claude/settings.json` (`SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PostToolUse` / `Stop`).

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
| `shell-subset.mjs` | the modelled shell subset (`readCommand`, `walkCommands`) for the git rule, the approval rule and the handoff gate, with no part run | git-guardrails, forbid-approval-prompt, require-handoff-prompt |
| `command-expander.mjs` | the text inspector: shell bodies read as words and commands for the other rules, with no part run | the shell rules above |
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

The 10 rules in `REMOVAL_RULES`, in source order, and the `removalRule` values
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
| `not-modelled` | `inline_shell_unchecked`, `eval_trap_string`, `unparsed_line` |

`not-modelled` is the fail-safe rule. The reader is an allow list: `readCommand` in `shell-subset.mjs` reads one small
grammar, and names each other construct as not modelled. The approval rule and `checkGitCommand` in `rules-git.mjs` read only
the parsed words of that grammar, through `walkCommands`, never the text of the command. The refusal names the construct, and
it asks for the plain subset, for a `.mjs` file that `node` runs for a search or a filter, or for a script file that the agent
runs by its literal path.

The grammar:

- outside a quote, only printable ASCII, a space, a tab and a line end; a quote can hold any character
- plain words, `'...'` quotes, `"..."` quotes and a backslash before one printable character
- simple commands joined by `;`, `&&`, `||`, `|` and a line end, and a `#` comment at the top level
- `for NAME in WORDS; do LIST; done`, where each word is literal, and `if LIST; then LIST; [else LIST;] fi`
- the redirects `>`, `>>` and `<` and `&>` to a literal path, with or without a file descriptor, and `>&N`, such as `2>&1`
- a here document outside a substitution, with a quoted literal delimiter, such as `<<'EOF'`, and an exact end marker line
- `VAR=value` before a command or alone, but not in a pipeline
- `$NAME`, `${NAME}`, `${NAME:?message}`, a leading `~` and `$(command)`, where the reader reads the command of the
  substitution with the same grammar. The reader reads `~` as the home directory of the hook, and the line cannot change it,
  because `HOME` is in `REFUSED_ASSIGNMENT`
- `cd PATH` as one whole simple command at the top level of the line, not in `for`, `if`, a pipeline or a substitution

The reader is an allow list in each class:

- A command word must be in `KNOWN_COMMAND_WORDS`: the wrappers that do not change the user, the allowed builtins, the allowed
  programs and the POSIX shells. Each other command word is refused. A path is judged by its last part, so `/usr/bin/git` is `git`, and
  `./run.sh` is refused. The refusal lists the known words.
- `adb` and `emulator` run no git and no host shell, and `forbid-worker-browser` refuses both for each launched worker that is not a device
  proof. `xcrun` is allowed only with `simctl` as its first word, because `xcrun` resolves any developer tool by name. `tar` is allowed only with
  the options that list or extract (`TAR_LETTERS`, `TAR_FLAGS` and `TAR_VALUE_OPTIONS` in `shell-subset.mjs`), because `-I`,
  `--use-compress-program`, `--to-command`, `--checkpoint-action` and `--info-script` run a program. `git archive` is allowed without
  `--exec` and `--remote`. A read-only review and a device proof need these commands for their own orders.
- `rules-worker.mjs` keeps no list of wrappers, reserved words or redirect forms. It judges the program and the arguments that
  `readCommand` and `invocationsOf` find, so a wrapper that the reader passes through never hides a `gh` write or an `adb` serial.
  For a command outside the subset, the read-only rule and the device proof refuse it, and the browser rule of another worker reads the text
  segments with `invocationsOf` and `LIST_START_WORDS`. Two rules read what a program takes in the same word as its option, so each is an
  allow list: a proof lets only `-s <pinned serial>` lead an `adb` call and boots only the AVD `orbit-proof-<pinned port>`, and a read-only
  run refuses each `curl` call to a GitHub host. A `for` loop that binds a pinned name, and an `xargs` that runs `gh`, `curl`, `adb`,
  `emulator` or the boot tool, are refused, because the loop and the standard input decide the value that no word on the line shows. A word that the walk cannot resolve (it tracks lower-case names only: `M=-XPOST; gh api … $M`, `T=-t1; adb $T shell …`) refuses the call to `gh`, `curl`, `wget`, `adb`, `emulator` or the boot tool, in a read-only run and in a proof, with one exception: a proof reads `$ANDROID_SERIAL` and `$ORBIT_PROOF_EMULATOR_PORT` (bare or braced, with no modifier) as their pinned values.
- The allowed builtins are `cd`, `echo`, `printf`, `test`, `[`, `true`, `false`, `:`, `pwd`, `export`, `local`, `readonly`,
  `declare`, `typeset`, `unset`, `set`, `exit`, `type` and `kill`. `cd` is followed. `set` takes only `-e`, `-u` and `-x`.
  `printf` takes no `-v`. `export`, `local`, `readonly`, `declare`, `typeset` and `unset` take only a name and `NAME=value`,
  with no option and no subscript. No other builtin can assign a name, so `read`, `getopts`, `mapfile`, `readarray`, zsh
  `zformat`, `print -v` and `declare -n` are refused.
- A name in `REFUSED_ASSIGNMENT` is refused in each way that the grammar can assign or export it: an assignment word, a
  `for` name, a `NAME=value` word of a wrapper such as `env`, and a word of a declaration builtin, with or without `=`.
  `env -i`, `env -u NAME`, `env --unset`, `env --ignore-environment` and `env -` remove a name, so they are refused too.
- The options of a wrapper are read from `WRAPPER_OPTIONS`: `env` takes only `--` and `NAME=value` words, `nice` takes `-n N`,
  `timeout` takes `-s SIG`, `-k DURATION`, `--preserve-status` and `--foreground` and then one duration word, `time` takes
  `-p`, `stdbuf` takes `-i`, `-o` and `-e` with a value, `command` takes `-v` and `-V`, `ionice` takes `-c` and `-n` with
  a value, and `xargs` takes `-0`, `-r`, `-t`, `-n`, `-L`, `-P`, `-I` and `-d`. A short option with a value can hold the
  value in the same word, such as `-n5`. `exec`, `nohup`, `noglob`, `builtin` and `setsid` take no option. Each other word that starts with `-` before the command word is refused, so `env -P`, `env -i`, `env -u`,
  `exec -c`, `sudo -u` and each prefix of a GNU long option, such as `env --sp=` or `env --ign`, never pass. `runuser` reads
  its first word as a user name, not as a command, so it is no wrapper and is refused.
- `chdir`, `pushd` and `popd` are refused. `cd PATH` is the only builtin that changes the directory, and the walk follows it.
- Each rule reads a program in the shell directory after the `cd` model. A program runs in the shell directory when it is a command
  word, a command after a wrapper of `WRAPPERS` that does not change the user, or a command after `find -exec` or `-ok`, up to its
  `;` or `{} +`. The reader refuses these ways to run a program in another directory, or a program that no rule reads:
  - `find -execdir` and `-okdir` run the command in the directory that holds each found file. The refusal asks for `-exec`
    with an absolute path. A `{}` in a `git` argument after `find -exec` is refused too, because `find` replaces it with each
    found path.
  - A computed word of `find` can be `-exec`, `-execdir`, `-ok` or `-okdir`, so the walk reads each word of `find` after it
    replaces the variables that it knows. A word with a known value is refused when that value is such an action. A word with
    an unknown value, a glob or a brace expansion passes only when the reader can prove that the shell makes no such action from
    it: each expansion is quoted, and the first character is literal and is not `-`, or the word has no glob and no brace and
    holds a literal character other than a letter and `-`. So `find "$DIR/" -name "*$ext"` and `find apps/*/src` pass, and
    `x=-execdir; find P "$x" ...`, `find "$DIR"`, `find P -{print,execdir} ...` and `find P -execdi? ...` are refused.
  - `xargs` adds words from standard input, which no rule reads. An `xargs` whose command is a wrapper, `find`, `git` or a
    shell is refused, because that command can read a program or an action from those words. An `xargs` with no command
    word is refused too. An `xargs` whose command runs no other program, such as `grep` or `rm`, is read.
  - `sudo`, `doas` and `pkexec` run the command as another user. `sudo` runs it in the directory that `-D` or the `runcwd`
    of its policy names, `pkexec` runs it in the home directory of that user unless `--keep-cwd`, and each one gives git the
    home and the config of that user. Each one is refused with each word.
  - `env -C` and `env --chdir` are options that `WRAPPER_OPTIONS` does not name, so they are refused. `xargs`, `nice`,
    `timeout`, `time`, `stdbuf`, `nohup`, `setsid`, `ionice`, `exec` and `command` have no option that changes the
    directory, and they run the command in the shell directory. A wrapper word must be literal, also when no command word
    follows the wrappers.
  - `make -C` is refused, because `make` is not on the allow list. `git -C` is read: the rule gives git each `-C` word.
  - A program on the allow list that runs code from its arguments or from a file, such as `npm --prefix`, `npm exec` or `node`,
    gives no command that a rule reads, in any directory. The limit below names it.
- The POSIX shells (`bash`, `sh`, `zsh`, `dash`, `ksh` and others) are allowed only with a script file. Each other shell,
  from a list of known names and from `/etc/shells`, is refused with any word, for example `csh`, `tcsh`, `fish` and `pwsh`.
- A `git` command in an unattended run, and in a protected repository in an attended session, must use a subcommand in
  `GIT_SUBCOMMANDS` of `rules-git.mjs`. An alias, `subtree`, `send-pack`, `submodule`, `difftool` and each other subcommand are
  refused, and the refusal names the script file route. `rebase -x` and `--exec`, `bisect run`, `fetch` and `pull` with
  `--upload-pack`, `ls-remote --upload-pack`, `push` with `--receive-pack` or `--exec`, and `grep -O` run a command, so they
  are refused too. The `git procedure:` rows of `test-hooks.mjs` read each git subcommand that a code span of a Markdown
  file under `.claude/` or `tools/` names, and require it in `GIT_SUBCOMMANDS`. The same rows also read each fenced
  `bash` block with no `<placeholder>` of `orchestrate/SKILL.md` and `sleep/SKILL.md`, and require that both rules pass it in an
  unattended run.
- `git worktree remove` with a word that git reads as force (`--force`, each prefix of it down to `--f`, or a short group with
  `f`, such as `-ff`) is refused in each repository and session, because it follows a Windows junction and deletes the target.

The walk unrolls a `for` loop over its literal words. It knows the value of a variable with a lower case name that the line
sets to a literal value, such as `d=/work/$w` in a loop over `w`, until a declaration builtin runs. A `git` argument and the
path of a `cd` can use such a variable. A variable with an upper case name, such as `$WT`, is never known, because the shell
sets many upper case names itself (`PWD`, `OLDPWD`, `REPLY`, `RANDOM`, `SECONDS` and others). The walk keeps the values as a
chain of changes, so its time grows about linearly with the number of assignments. Two states whose maps hold the same
entries are one state: each map keeps the count and an order-free hash of its entries, and the walk compares the entries only
when the count and the hash are equal. The walk refuses a line with more than 64 states. The shell can skip an item after `&&` or
`||` and a branch of `if`, so a rule that follows a `cd` reads the later commands in each directory that is possible.

A glob, a brace expansion, a substitution, a word that starts with `=`, and a variable whose value the walk does not know make
a word dynamic. A dynamic word is not modelled in a command word or a wrapper word (also after a wrapper such as `nice` or
`env`), in a command that names a shell, and in a `git` argument or a `cd` path. In a word of `find`, it is not modelled unless the
reader proves that it is no action that runs a program (see above). Each other construct is not modelled, for example:

- a byte outside printable ASCII outside a quote, such as a carriage return, a form feed or U+00A0
- `{ ... }`, `( ... )`, `[[ ]]`, `(( ))`, `$(( ))`, `$[ ]`, `while`, `until`, `case`, `select`, `elif`, `!`, a function and a
  background `&`, and the zsh short forms of `if`, `for` and `while`
- `${ }` with an operator, `$NAME[` and `$NAME:` (a zsh subscript and modifier), an ANSI-C quote, a `$"..."` quote, a
  backtick, a line continuation, a here-string, `<<-`, `&>>`, a redirect to a path that is not literal, and the zsh numeric
  glob `<N-M>` or `<->`, which bash reads as two redirects
- `eval`, `source`, `.`, `let`, `alias`, `trap`, `setopt`, `set -o`, `printf -v`, `hash`, `sched`, `break`, `continue`,
  each wrapper option that `WRAPPER_OPTIONS` does not name, and the zsh command words `nocorrect`, `repeat`, `-`, `always` and `foreach`
- a POSIX shell with `-c`, a shell that reads its script from standard input, from a pipe, from a here document or a `<` file
  of its own, or from a path under `/dev` or `/proc`, and a `-c` after a shell word anywhere in a command
- an assignment to a name in `REFUSED_ASSIGNMENT`: the prompt names (`PS1` to `PS4`, `PROMPT`, `RPROMPT`, `SPROMPT`,
  `PROMPT_COMMAND`), `IFS`, `BASH_ENV`, `ENV`, `CDPATH`, `SHELLOPTS`, `BASHOPTS`, `ZDOTDIR`, `PATH`, `path`, `FPATH`, `fpath`,
  `NULLCMD`, `READNULLCMD`, `EDITOR`, `VISUAL`, `PAGER`, `SSH_ASKPASS`, an `LD_*` or `DYLD_*` name, a `GIT_*` name, and the
  names that give the shell or git a directory or a config file: `HOME`, each `XDG_*` name, `PWD`, `OLDPWD`, `USERPROFILE`,
  `HOMEDRIVE` and `HOMEPATH`
- text with a `[` and a `$(` or a backtick, which bash can run as a subscript

The reader models shell syntax, not what a program does with its arguments. A program on the allow list that runs code from
its arguments or from a file, such as `node -e`, `npm run`, `npx`, `awk` with `system()`, GNU `sed` with `e`, `gh` with an
alias or an extension, `orca` with a terminal or an agent command, and `dotnet` or `cargo` with a project, is not read. An alias, a function or an option of the user
profile, a config file that the agent writes (for example a git alias or `url.*.pushInsteadOf` in a git config file), and a
script file that the agent runs by its path are not read. A `cd` that fails is read as a `cd` that succeeds, and a `CDPATH` in
the environment is not read.

`checkGitCommand` refuses a command outside the grammar in an unattended run, the same runs in which the approval rule applies.
In an attended session it refuses such a command only when the text, with its heredoc bodies, quotes and backslashes removed, names
`git` and a push or a hygiene marker: `push`, `no-verify`, `no-gpg-sign`, `gpgsign`, `hookspath`, or a `-n` group in a word after `commit`
in the same command that `expandCommands` finds. A `;`, `|` or line end inside quotes or a substitution does not end that command. It also
refuses such a command when the text of one command that `expandCommands` finds is a `git worktree remove` with a force word. So the
default commit form of Claude Code, `git commit -m "$(cat <<'EOF' ... EOF)"`, and a git command with a variable argument pass
attended, and the handoff gate reads such a commit from its text. A variable that holds a push or a hygiene flag is not read in an
attended session. The rule reads a `PowerShell` command with the same bash grammar: this is a deliberate choice, because a
cmdlet is not in `KNOWN_COMMAND_WORDS`. So an unattended run refuses each cmdlet, and an attended session refuses a cmdlet line
only when its text names git and a push or a hygiene marker.
The rule never resolves a `-C` path in Node: it gives git the directory after the `cd` model and each raw `-C` word, as
`git -C <dir> -C <w1> ... -C <wn> remote get-url --push <remote>`, because git applies `-C` with `chdir`, which follows a
symlink before it reads `..`. The shell `cd` reads `..` by text, so the `cd` model does the same.
The handoff gate reads each git command that can record the index, `RECORDING_SUBCOMMANDS` of `rules-handoff.mjs` (`commit`,
`merge`, `cherry-pick`, `revert`, `rebase`, `am`, `pull` and `stash`), with the same reader, `readGitCommands`, and gives git the same
chain: the directory after the `cd` model, then each `-C` word after a lower case variable and `~` are replaced. `git stash`
records the index in a stash commit, and `git merge --ff-only refs/stash` can put that commit on the branch, so the gate judges
each form of `stash` that records: no word, an option, `push`, `save` and `create`. `list`, `show`, `drop`, `pop`, `apply`,
`clear`, `branch` and `store` record nothing. Text that runs no such command, such as an `echo` or a `gh` body, gives no chain.
In an unattended run, the gate refuses a command outside the subset that names one of these subcommands, with the same rewrite
advice. In an attended session, the gate reads the chain of such a command from its text.
Each chain keeps its subcommand. When a handoff doc under `.claude/specs/` or `.claude/handoffs/` changed, the adapter
`require-handoff-prompt.mjs` merges `origin/main` into the relay branch, but only before a `git commit`. It never runs before
a merge, a pull, a rebase, a cherry-pick, a revert, an `am` or a stash, so the hook never moves HEAD before the command that
the agent asked for, and a `git pull` on `main` passes.
In a protected repository, the push rule allows only `git push origin <branch>`, `git push -u origin <branch>` and
`git push origin HEAD:<branch>`, where `<branch>` is a plain branch name that is not `main` or `master`. A push in the same command as a
`git config` or `git remote` change is refused.
git gives a push with no destination the ref that its local word resolves to, and a symbolic ref resolves to its target, so the text of
`<branch>` does not prove where the push goes. For `git push [-u] origin <branch>` the adapter asks git, in the same chain of directories:
`git -C <dir> -C <w1> ... rev-parse --symbolic-full-name <branch>`. The push passes only when the output is `refs/heads/<branch>`. A word
that git cannot resolve is refused, so the branch must exist before the command of the push. `HEAD:<branch>` names its destination, so git
resolves no local word for it. A push to a protected repository is also refused in the same command as a `git symbolic-ref` command or
as a redirect that writes a path with a `.git` segment, because each one can make the word a symbolic ref after the hook reads it.
The rule reads no other command that writes a ref file, such as `cp` or `tee`, and no config that maps a branch to another destination.
The rule judges each repository word of a push: the first word that is no option, and each value of `--repo <x>` and
`--repo=<x>`. In an unattended run and in a protected repository, a URL or a path passes only when it is byte-equal to a
canonical form, `https://github.com/<owner>/<repo>` or `git@github.com:<owner>/<repo>`, each with an optional `.git`, with no
dot segment, no percent escape, no repeated or trailing `/`, and no query or fragment. The refusal names the canonical forms.
In an attended session in a repository with no protection, a URL or a path is judged by its repository name: with no case,
with each `.` and `..` segment, each repeated or trailing `/` and each trailing `.git` removed. A percent escape, a `?`, a
`#` or a path that ends in no name makes the target protected. A named remote is judged by `git remote get-url --push <name>`,
with the same name reader.

In each repository and each session, a git command takes only `-C <path>` and options that change no config, no repository and no hook
before the subcommand, so `-c`, `--config-env`, `--git-dir` and `--work-tree` are refused. This refusal is the hooks hygiene: `-c`,
`-ccore.hooksPath=…` and `--config-env` are the only ways to give a git command another `core.hooksPath`, so no other check reads it.

Widen the grammar only with a construct that the reader models exactly in bash and in zsh, and add its rows to the `subset:`
group of `test-hooks.mjs`. Do not add a second reading of a construct that the reader does not model.

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
