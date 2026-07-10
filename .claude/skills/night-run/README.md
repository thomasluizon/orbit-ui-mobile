# night-run

Unattended overnight queue-drain for Claude Code. Drains a list of tasks one at a time, each in a **fresh `claude -p` session**, and stops every task at a **draft PR** so you review in the morning. It never merges and never touches `main`.

Invoke via the `/night-run` skill (which sets up the queue, gates on your approval, and launches this driver). `run.mjs` is the engine you can also run directly.

## The idea

A single long Claude session degrades as its context fills ("context rot"), so the reliable way to work through many tasks unattended is **fresh context per task**. Native `/goal` and `/loop` stay in one growing session and cannot self-`/clear`, so the fresh-context reset has to come from an external driver. `run.mjs` is that driver: it loops over a queue and spawns a new `claude -p` per task, with durable state in files and git between them. This is the automation of the split-session campaign pattern in `WORKFLOW.md`.

## Why a Node driver (not a bash script, not a live Claude session)

- **Not a live Claude session:** a running Claude session that shells out to `claude -p` taints each child with `CLAUDECODE` / `CLAUDE_CODE_ENTRYPOINT`, which hangs roughly half of nested runs on startup (anthropics/claude-code#26190). The driver strips those vars before every spawn, and holds no task context of its own to rot.
- **Not a bash script:** `spawnSync('claude', argsArray, { shell: false })` passes arguments with no shell quoting (verified on this machine), which sidesteps the PowerShell/`.cmd` quoting footguns. The prompt goes over stdin, so it has no length limit. This mirrors the proven spawn pattern in `../second-opinion/second-opinion.mjs`, improved to `shell: false`.

## Safety model

Layered, so no single failure is catastrophic:

1. **Inherited hooks (primary guard).** The child runs without `--bare`, so it loads the project `PreToolUse` hooks. `git-guardrails` blocks any push/force-push to `main`, `--no-verify`, and unsigned commits from inside every task. The Expo-pin and content guards apply too.
2. **Prepare, not merge.** Each task works on its own `feature/`/`fix/` branch off an up-to-date base and ends at a **draft** PR. The driver returns every repo to its base branch between tasks and stashes (never discards) any leftover changes.
3. **Budget caps.** `--max-budget-usd` per task (hard ceiling per child) plus a `totalBudgetUsd` accumulator that halts the run.
4. **Circuit breaker.** After `maxConsecutiveFailures` hard failures the run halts instead of burning budget in a loop.
5. **Denylist + permission posture.** `disallowedTools` blocks the nastiest bash patterns. The default `permissionMode` is `bypassPermissions` so the child never stalls on a prompt at 3am; the guardrails above are what contain it. Lower this to a curated `allowedTools` allowlist if you want stricter control (at the cost of stall risk).
6. **Stop flag.** `touch .claude/night-run/STOP` halts gracefully before the next task.

Residual risk: under `bypassPermissions` the child can run arbitrary bash within the repo. Start every run from a **clean, committed tree** so the worst case is recoverable via git, and sandbox in Docker if a run will touch anything outside the repo.

## Files

Committed (the engine and its docs):

- `run.mjs` — the driver.
- `config.example.json` — documented defaults; copy to `.claude/night-run/config.json` and adjust.
- `SKILL.md` — the `/night-run` runbook.
- `README.md` — this file.

Runtime (gitignored, under `.claude/night-run/`):

- `config.json` — the active config for a run.
- `queue.json` — `[{ id, label, repo }]` in run order.
- `prompts/task-<id>.md` — the self-contained prompt per task.
- `runs/<timestamp>/` — `run.log`, `STATUS.md`, `SUMMARY.md`, `task-<id>.json` per run.
- `STOP` — presence halts the driver before its next task.

## Config knobs (`config.json`)

| key | default | meaning |
|---|---|---|
| `model` / `fallbackModel` | `opus` / `sonnet` | driver model and overload fallback |
| `permissionMode` | `bypassPermissions` | child permission posture (never stalls) |
| `perTaskBudgetUsd` | `4` | hard `--max-budget-usd` per child |
| `totalBudgetUsd` | `20` | run halts when cumulative spend hits this |
| `perTaskTimeoutMs` | `3600000` | per-task wall-clock cap (60 min) |
| `maxConsecutiveFailures` | `2` | circuit breaker threshold |
| `disallowedTools` | `[rm -rf, reset --hard, push --force]` | denylist passed to the child |
| `addDirs` | `[orbit-api]` | extra repos the child can read (`--add-dir`); read-only, not required clean |
| `repos` | `[.]` | repos reset to base + required clean between tasks; add orbit-api only for cross-repo *write* tasks |
| `push` | `true` | require `gh` auth and open PRs |

## Run it directly

```
node .claude/skills/night-run/run.mjs --dry-run   # preflight only, prints the plan
node .claude/skills/night-run/run.mjs             # drain the queue
```

Reads `.claude/night-run/config.json`, `queue.json`, and `prompts/` (its `--dir`, default `.claude/night-run`). Use `--dir <path>` to point at a different runtime dir.
