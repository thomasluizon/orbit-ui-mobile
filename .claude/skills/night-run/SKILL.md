---
name: night-run
description: Set up and launch an unattended overnight run that drains a queue of GitHub issues (or a backlog file) one at a time, each in a FRESH `claude -p` session, and stops at a draft PR per task so you review in the morning. Automates the split-session campaign discipline (one stage per fresh context, state in files, never touch main) as a detached driver. Use when you want work prepared by morning. Not for a single task you are actively pairing on (use /execute).
argument-hint: [issue numbers | --label <label> | --backlog <file>] | status | stop
---

# Night Run: unattended overnight queue-drain

**Input**: $ARGUMENTS

Turn a list of tasks into finished, reviewable work by morning. The engine is `run.mjs` (this skill's folder): a Node driver that spawns **one fresh `claude -p` per task**, so every task starts with a clean context window instead of one long session that rots. Each task ends at a **draft PR** on its own branch. Nothing merges. `main` is never touched.

This is the automation of your existing split-session campaign pattern (WORKFLOW.md): one stage per fresh session, state externalized to files/git, human gate between phases. Overnight *throughput* is automated; overnight *merge* is not. You wake up to PRs to review.

## Why this shape (do not "simplify" it away)

- **Fresh `claude -p` per task**, driven by a Node script, because a live Claude session driving children taints them (`CLAUDECODE` inheritance hang, anthropics/claude-code#26190) and rots its own context. The driver strips those env vars and holds no task context itself.
- **The child inherits the project hooks** (it runs without `--bare`), so `git-guardrails` already blocks any push to `main`, force-push, and `--no-verify` from inside each task. That is the primary guardrail, doing real work for free.
- **Prepare, not merge.** Branch per task, draft PR, back to base. Recoverable by construction.

## Mode detection

Parse `$ARGUMENTS`:

- `status` -> **Report mode** (skip to the bottom). Read the latest run's `STATUS.md`/`SUMMARY.md` and list the draft PRs.
- `stop` -> **Stop mode**. `touch .claude/night-run/STOP` (the driver halts gracefully before its next task). For an immediate stop, tell me to kill the `node run.mjs` process.
- anything else (issue numbers, `--label X`, `--backlog file`, or a free description) -> **Setup + launch** (phases below).

---

## Phase 0 — Resolve the queue

Turn `$ARGUMENTS` into a concrete task list. Do NOT ask if you can infer it.

- **Issue numbers** (`72 73 80`) -> those issues.
- **`--label <label>`** or **`--milestone <m>`** -> `gh issue list --state open --label <label> --json number,title,body` (both repos if relevant).
- **`--backlog <file>`** -> each non-empty, non-`#` line is one free-form task (greenfield/refactor work, no issue).
- **Free description with no ids** -> propose a queue from open issues that match, and confirm the set once (single question, the matched issues pre-selected).

For each task capture: a stable `id` (issue number, or `b1`, `b2` for backlog lines), a short `label`, the source `body`, and the target `repo`. Order by dependency (a task that unblocks others goes first); note the order.

A single task is normal (a queue of one is the common case). Scale is not the question; *shape* is.

**Fit gate — is each task a night-run task?** A night-run task must be an unattended **slice**: bounded, with clear acceptance criteria, no open design decision, and self-contained enough to finish in one PR. Screen every task and EXCLUDE any that is:

- **A campaign / multi-phase issue** ("Phase 1... Phase 2...", "loop X to convergence", "drive the whole codebase to zero"). Too big for one fresh session and one PR.
- **Gated on an open question** ("confirm 100% vs 80%?", any unresolved design choice). Unattended, the child would just guess.
- **Sequenced after other unmerged work** ("do this after everything else is merged"). night-run cannot reason about cross-issue ordering.
- **Whole-repo blast radius.** Sprawling changes are exactly what a single unattended session does worst.

For each excluded task, report it as `not a night-run task -> decompose into slices first, or run it interactively (/execute, or the campaign loop in WORKFLOW.md)` and leave it out of the queue. If EVERY task is excluded, say so and stop (do not launch an empty run). A well-formed slice in, a reviewable PR out; a campaign in just burns budget.

## Phase 1 — Generate a self-contained prompt per task

Each child starts with a clean context, so its prompt must carry everything. Write one file per task to `.claude/night-run/prompts/task-<id>.md` using this template, filled from the issue/backlog content:

```
You are running UNATTENDED overnight as an autonomous Orbit engineer. No human will
answer questions. Proceed to completion on your own judgement; do not stop to ask.

TASK: <label>
<the issue body / backlog line, verbatim, plus any acceptance criteria>

Follow the Orbit workflow (CLAUDE.md + WORKFLOW.md), which is already loaded:
1. Ensure you are on an up-to-date base branch, then create `feature/<slug>` (or `fix/`).
2. Implement the change. CROSS-PLATFORM PARITY IS MANDATORY: any web change lands in
   apps/mobile too, and vice versa; i18n keys land in BOTH en.json and pt-BR.json. If the
   task needs backend support, make the paired change in orbit-api (added via --add-dir).
3. Add/extend Vitest (or xUnit for orbit-api) behavior tests for what you changed.
4. Run the relevant validation (lint, typecheck, tests) and fix what you broke.
5. Commit with a clear message. Push the branch. Open a DRAFT PR with `gh pr create --draft`.
   For cross-repo work, open the paired PR and cross-link them.

HARD RULES:
- NEVER merge. NEVER push to or commit on main/master. NEVER force-push. (Hooks enforce this.)
- If you cannot finish safely, commit WIP to the branch, open a DRAFT PR describing exactly
  what is blocked and why, and exit. A blocked-but-documented task is a success.
- Keep changes surgical and scoped to this task.

END your final message with EXACTLY one line of JSON (no fences):
{"task":"<id>","status":"done"|"blocked"|"failed","pr":"<url or null>","summary":"<one sentence>"}
```

Keep each prompt tight and specific. The `status` JSON line is how the driver records the outcome, so it is required.

## Phase 2 — Write the run artifacts

Into `.claude/night-run/` (gitignored runtime dir; create it if missing):

- **`config.json`** — copy `config.example.json` from this skill folder and adjust for this run: `perTaskBudgetUsd`, `totalBudgetUsd` (size it to the queue), `model`, `push`, `repos` (include orbit-api only if a task needs it), `addDirs`. Confirm the two absolute `repos`/`addDirs` paths match this machine.
- **`queue.json`** — array of `{ "id", "label", "repo" }` in run order.
- **`prompts/task-<id>.md`** — one per task (Phase 1).

## Phase 3 — Preflight (dry run)

Run the driver's own preflight without spawning anything:

```
node .claude/skills/night-run/run.mjs --dry-run
```

It verifies `claude` is runnable, `gh` is authenticated (if `push`), every repo is a clean git tree on its base branch, then prints the tasks it would run. Fix anything it flags (usually: commit/stash a dirty tree) before continuing.

## Phase 4 — GATE: present the plan and STOP

Show me, and wait for an explicit "go" before launching anything that spends money:

- the ordered task list (id + label + repo), and any excluded "needs grooming" tasks
- **per-task budget cap** and **total budget cap** (the hard ceiling)
- **permission posture**: `bypassPermissions` (child does not stall on prompts; `git-guardrails` + the `disallowedTools` denylist + branch-per-task are the guardrails). Flag this plainly so I can lower it.
- **push/PR**: draft PRs will be opened tonight (CI and review bots will run on them)
- model + fallback

Do not launch before I say go. (Autonomy within the run; a gate before it starts.)

## Phase 5 — Launch (after "go")

The driver must run **detached** so it survives this session ending. Give me the launch command and let me run it, or launch it for me if I am keeping this machine on.

**Recommended (fully detached, Windows PowerShell):**
```
Start-Process -FilePath node -ArgumentList '.claude/skills/night-run/run.mjs' -WorkingDirectory '<repo-abs-path>' -WindowStyle Hidden
```

**Observable (a terminal I can watch):** open a new terminal, `cd` to the repo, run `node .claude/skills/night-run/run.mjs`, leave it open.

Either way the driver logs to `.claude/night-run/runs/<timestamp>/run.log` + `STATUS.md`, so progress is on disk regardless. Note: the machine must stay awake (sleep pauses it). Then hand me: the run-dir path, the total-budget ceiling, and "check progress with `/night-run status`."

---

## Report mode (`/night-run status`)

1. Find the newest `.claude/night-run/runs/*/` dir. Read `SUMMARY.md` if the run finished, else `STATUS.md` + the tail of `run.log`.
2. `gh pr list --draft --author @me --json number,title,headRefName,url` in each repo to list what was prepared (cross-check against the run's PRs).
3. Summarize: tasks done / blocked / failed, total spent vs. cap, and a one-line next-step per PR (which to review first). Flag any task that halted the circuit breaker.

## Stop mode (`/night-run stop`)

`touch .claude/night-run/STOP` — the driver finishes the current task, then halts before the next (no half-done task). For an immediate hard stop, I kill the `node run.mjs` process; the in-flight task's branch keeps whatever it committed.
