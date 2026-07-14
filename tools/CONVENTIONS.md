# tools/ conventions

> **At a glance** - the contract every script in `tools/` follows so an agent can call it blind.
> - One clear purpose per script; if it grows a second job, split it.
> - Always: `--help`/`-h`, meaningful exit codes, non-interactive, cwd-safe.
> - POSIX `.sh` is the baseline; add a `.ps1` twin only when it must run in the user's PowerShell shell.
> - Large payloads come in on stdin, never argv; secrets never appear in argv.

A tool here is something an agent invokes without reading its source. That only works if every tool obeys the same contract.

## The contract

- **Single purpose.** One script does one thing. A second responsibility means a second script (or a shared step), not a flag matrix.
- **`--help` / `-h`.** Print usage and exit `0`. Cover every flag, the stdin shape, and the exit codes. This is the tool's spec.
- **Meaningful exit codes.** `0` on success; non-zero on failure, with distinct codes for distinct failure classes when a caller would branch on them. Write errors to stderr, results to stdout, so output can be piped.
- **Non-interactive.** Never prompt. No `read`, no `Read-Host`, no confirmation gates. Every input arrives as a flag, an argument, or stdin. A destructive action takes an explicit `--yes`-style flag rather than asking.
- **Cwd-safe.** Resolve paths from the script's own location (`dirname "$0"` in bash, `$PSScriptRoot` in PowerShell), not the caller's working directory, so the tool runs from anywhere.
- **stdin for big payloads.** A claim, a diff, a dossier, a file list goes in on stdin, not as a giant argv string. Small scalars (a repo slug, a PR number, `--model`) are fine as arguments.
- **No secrets in argv.** Tokens and keys are visible in the process table and shell history. Read them from the environment or a file, never a positional argument or flag value.

## POSIX vs PowerShell

- **`.sh` is the baseline.** It runs in the night-run bash loop, in CI, and in Git Bash on Windows. Keep it POSIX-ish and give it LF line endings.
- **Add a `.ps1` twin only when the tool must run in the user's primary PowerShell shell** (the interactive path). The twin mirrors the `.sh` interface exactly: same flags, same stdin shape, same exit codes. Do not maintain a `.ps1` for a script that only ever runs in the bash loop.
- Prefer delegating to an existing vetted helper (a `.mjs`, a `gh` call) over reimplementing its logic in shell. The wrappers stay thin.

## Adding one

Use `/make-tool`. It scaffolds the script to this contract and adds the catalog row to `README.md`. Do not abstract across tools on the first shared line (rule 6, extract on the third real use); two twenty-line wrappers do not need a shared library.
