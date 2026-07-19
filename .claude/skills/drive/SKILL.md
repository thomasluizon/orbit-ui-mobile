---
name: drive
description: The one execution skill — issue(s), a free-text task, or nothing → reviewed PRs. Phase A runs live in this session (classify → recommend mode/tier → grill open questions → decompose into bundles → write a resumable spec → you approve); Phase B hands off to the driver engine (run.mjs, this folder), one FRESH `claude -p` per bundle so context never accrues and you never /clear. Attended by default (approve/review gates in the driver's terminal); --sleep runs it unattended overnight with an independent Sonnet verifier instead of gates. Auto-routes each bundle's model tier and recommends the execution mode. Replaces /execute (a one-bundle drive) and /night-run (drive --sleep).
argument-hint: <issue-number ... | free-text task | (empty)> [--sleep] | status <#…> | stop <#>
---

# Drive — the single execution skill

One mental model: **`/drive <input> [--sleep]`** takes you from an issue (or several), a free-text task, or nothing, to reviewed PRs — without the `/clear`-and-repaste dance. It **replaces `/execute`** (which was just a one-bundle drive) **and `/night-run`** (which is `/drive --sleep`).

It writes no new logic and re-implements nothing — `/prime`, `grill-me`, `/plan`, `/implement`, and the tier agents (`implement-opus` / `implement-sonnet`) own their behavior; reference them by name, never restate them. `/drive` adds two things: a **resumable spec** (durable state so a run survives any interruption or a fresh session) and a **driver engine** (`run.mjs`, this skill's folder) that runs each bundle in a fresh headless process so context never rots.

`/drive` targets issues in `thomasluizon/orbit-ui-mobile`.

## The two phases

**Phase A — live, in THIS session, once (all the thinking):** prime → classify the work → recommend mode + tier → grill open questions → decompose into bundles → write the spec → you approve. Interactive; this is the only part that must be live, because grilling is a conversation.

**Phase B — the driver takes over (no `/clear`, ever):** the engine loops the bundles, each a fresh `claude -p` (zero context accumulation), tier-routed to its model. Two ways to run it:

- **Attended (default):** you approve each bundle before it runs and review its PR after, at gates in the **driver's terminal** (readline). The human is the verifier.
- **`--sleep` (unattended):** no gates — an independent Sonnet verifier grades each PR and posts AGREE/DISAGREE. Detached; you wake to reviewed PRs. This is the old `/night-run`.

Both open a **PR per bundle** and never touch `main` (each child runs without `--bare`, so it inherits `git-guardrails`, which blocks any push to main / force-push / `--no-verify`). Nothing merges — that stays a human action.

## Why you never manage context (there is no session to "close")

You never decide when to start a new session, and neither does the skill — because Phase B holds **zero** LLM context. `run.mjs` is a plain Node script; each bundle is a **separate `claude -p` process** that boots with a clean context window, does one bundle, and exits. Context never carries from one bundle to the next, so it cannot bloat. State passes between bundles through **files** — the spec, the plan files, and the PRs on git — not through conversation, so a fresh process loses nothing. (This is why compaction was rejected: external state beats a lossy compact.)

The **bundle is the unit of context**, and its size is set once — by you, at Phase A decomposition — not by a runtime heuristic guessing when to `/clear`. A bundle must be small enough to finish in one clean context; the fit gate + the per-bundle timeout enforce that. If a bundle is still too big and exhausts its own process, it returns `blocked` (WIP committed, a PR describing the block) — an explicit signal to split it, never a silent degradation. The live Phase A session stays lean too, because the heavy implement transcripts live in the children, not here.

## What is AUTO vs RECOMMENDED vs MANUAL (the honest ceiling)

A markdown skill cannot flip Claude Code session toggles; only code (the tier agents, and `run.mjs`) routes automatically.

| Capability | Status |
|---|---|
| Classify size/shape/openness; decompose bundles; write + reconcile the spec | **AUTO** |
| Model tier (`sonnet`/`opus`) per bundle | **AUTO** — `/plan`'s Tier → the queue entry → the engine's `--model` |
| Effort (`high`/`xhigh`) per bundle | **AUTO** in the driver (`claude -p --effort`) |
| Attended vs `--sleep` | **AUTO-detected, you confirm** — running unattended for hours always needs explicit opt-in |
| `ultracode` (session mode) / `ultrathink` (one-turn) | **RECOMMEND only** — a skill cannot enable them; the driver gets the reasoning half via `--effort xhigh`, the full toggle stays yours to set live |
| Fable 5 | **MANUAL** — never auto-routed (capped, withdrawable) |

**A/B override (`config.modelOverride`).** Set `"modelOverride": "sonnet"` (or `"opus"`) in `config.example.json` / the runtime `config.json` to force **every** bundle to that model, ignoring the per-bundle `tier` Phase A assigned — the switch for a controlled "all-Sonnet vs Opus baseline" week. Each run records the model that actually ran per bundle (`runs/**/task-<id>.json` → `model`); `tools/drive-ab-report.mjs` tallies done/blocked/failed + verifier DISAGREE per model so the quality delta is measured, not guessed. **Revert by deleting the key** (restores tier routing). The verifier stays on its own `verifyModel` (independent, unaffected).

## Mode detection

Parse `$ARGUMENTS`. Strip `--sleep` first (it selects Phase B's unattended path); the remainder is the input.

| Input | Mode |
|---|---|
| `status <#…>` | **Report** — read each spec, reconcile against `gh`, show the bundle tables + the latest run summary. No work. |
| `stop <#>` | **Pause** — set the spec `status: blocked`; for a running unattended driver, `touch .claude/drive/STOP`. |
| ≥ 1 issue number, no spec | **Init** that issue (Phase A). 2+ numbers → multi-issue (paired worktrees + parallel prime/plan). |
| ≥ 1 issue number, spec exists | **Resume** that issue. |
| Free-text task, no issue id | Treat the text as the task (no `gh` fetch); one bundle unless it is clearly an epic. |
| empty | Ask for an issue number or a description. Do nothing else. |

---

## Phase A — live (once)

1. **Prime.** `/prime <N>` (single, load-only) or `/prime <N…>` (2+ — creates paired worktrees and primes each in a parallel subagent). Carry only its summary forward.
2. **Classify** from the issue/prompt:
   - **shape** — a bounded single-bundle slice (the old `/execute` case), or an epic (phased / multiple independent items → several bundles);
   - **openness** — genuine open design questions (→ must grill) or none (→ skip grill);
   - **unattended-suitability** — is every bundle a self-contained slice with clear acceptance criteria, no open question, no whole-repo blast radius (→ `--sleep` is safe to recommend)?
3. **Recommend** the mode + tier and state the reasoning in one line — e.g. *"single-repo, no parity, LOW → attended, one bundle, Sonnet tier"* or *"5-bundle epic, new DTOs + parity → attended, Opus tier; bundle 1 (data model + contract) is broad, I'll drive it at `--effort xhigh` — set `/effort ultracode` live first if you want the auto-workflow half too."* If the user passed `--sleep`, apply the **fit gate** (below) and exclude anything unsuitable, reporting why.
4. **Grill** — only if there are open questions. `grill-me` (single issue) or `batch-grill <N…>` (2+). Interactive, main-session only, never a subagent. Record every resolved decision in the spec's Decisions section.
5. **Decompose + assign tiers.** Break an epic into an ordered bundle list — group correlated items to minimize PRs, order by dependency. For each bundle, run `/plan` scoped to it (single-issue slice = one bundle, the degenerate case). Read each plan's **Tier** (`sonnet`/`opus`) and effort — that is the per-bundle model routing that Phase B applies.
6. **Write the spec** (below), all bundles `todo`, `next-action: "/drive <N>"`.
7. **GATE — approve the bundle plan.** Show the bundle table (id · scope · tier · PR-count) + sequencing. Wait for `approve` / `edit <note>` / `abort`. Default-deny: no or ambiguous response → restate and wait. NOTHING runs without an explicit approve.
8. **Generate the driver artifacts** (the Phase B handoff) into `.claude/drive/` (gitignored runtime dir): `config.json` (from `config.example.json` in this folder — set timeouts, `repos`, `addDirs`), `queue.json` (one entry per approved bundle: `{ "id", "label", "repo", "tier", "effort", "ui"? }` in run order), and `prompts/task-<id>.md` per bundle (the template below). Then hand off to Phase B.

### The living spec

One file per issue at `.claude/specs/issue-<N>.spec.md` (gitignored). Authoritative for what is done and what is next, but **reconciled against `gh` on every resume** — never trusted blindly (a PR the spec calls "done" may have been closed unmerged; verify with `gh pr view`).

```markdown
---
issue: <N>
title: <issue title>
status: draft | in-progress | blocked | complete
next-action: "/drive <N>"
---

# Drive spec — #<N>: <title>

## Bundles
| # | scope | tier | status | plan | branch | PR |
|---|-------|------|--------|------|--------|----|
| 1 | <A1+A3 docs> | sonnet | done        | plans/issue-<N>-b1.plan.md | feature/… | #123 merged |
| 2 | <A2 API>     | opus   | in-progress | plans/issue-<N>-b2.plan.md | feature/… | #124 open   |

## Decisions (from grilling — durable across every interruption)
- <decision + why>

## Lesson candidates (from blocked bundles / verifier DISAGREE — promote via /lesson)
- <one line + the bundle it came from>

## Reconcile log
- <what a resume corrected against gh, and when>
```

Bundle `status`: `todo` → `planned` → `in-progress` → `done` (PR merged) | `blocked`.

### Per-bundle prompt template (`.claude/drive/prompts/task-<id>.md`)

Each child starts clean, so its prompt carries everything. Tier/effort come from the queue entry (the engine routes the model), not the prompt.

```
You are an autonomous Orbit engineer running one bundle. Proceed to completion on your
own judgement.

TASK: <bundle label>
<the bundle scope + acceptance criteria, verbatim, plus the relevant spec Decisions>

Follow the Orbit workflow (CLAUDE.md + WORKFLOW.md, already loaded):
1. Ensure you are on an up-to-date base branch, then create feature/<slug> (or fix/).
2. Plan, then implement the change. CROSS-PLATFORM PARITY IS MANDATORY: any web change lands
   in apps/mobile too and vice versa; i18n keys land in BOTH en.json and pt-BR.json. Backend
   support goes in orbit-api (added via --add-dir).
3. Add/extend Vitest (or xUnit) behavior tests for what you changed.
4. Run the relevant validation (lint, typecheck, tests) and fix what you broke.
5. Commit, push the branch, open a PR READY FOR REVIEW with `gh pr create` (never --draft, so
   CI and the review bots actually run). Cross-repo → open the paired PR and cross-link
   (orbit-ui-mobile uses `Closes #N`, orbit-api uses `Refs …#N`).

HARD RULES: NEVER merge, NEVER push to/commit on main, NEVER force-push, NEVER --no-verify
(hooks enforce this). If blocked, commit WIP, open a PR describing exactly what is
blocked, and exit - a blocked-but-documented bundle is a success.

VISUAL BUNDLES (any bundle whose acceptance is judged by how a rendered surface LOOKS):
"done" REQUIRES artifact evidence, never prose. Bring up the local stack (the `dev-server`
skill), seed the visual fixture (.claude/rules/visual-delivery.md - the session does this
itself), then run the loop for YOUR surfaces:
  npm run surfaces:capture -- --filter <surfaceId>   (repeat per surface)
  npm run surfaces:judge -- --filter <surfaceId>
  npm run surfaces:check -- --filter <surfaceId>
Your bundle is done ONLY when surfaces:check verifies your surfaces (fresh screenshot AND an
independent "transformed" judge verdict). If the stack cannot run, return "blocked" - a
visual bundle can NEVER be "done" on green lint/tsc alone, and a self-reported visual PASS
is treated as fabrication. The repo-wide Stop gate reports EPIC-wide coverage; you are not
required to close the whole epic - verify your own surfaces, state the epic-wide ratio
honestly in your summary, and exit.

END with EXACTLY one line of JSON (no fences):
{"task":"<id>","status":"done"|"blocked"|"failed","pr":"<url or null>","summary":"<one sentence>"}
```

---

## Phase B — the driver

The engine is **`.claude/skills/drive/run.mjs`**; its runtime dir is **`.claude/drive/`** (config / queue / prompts / runs — gitignored). It spawns one fresh `claude -p` per bundle (clean context each time), routes each to its tier model + effort, resets every repo to its base between bundles, and stops each bundle at a PR ready for review.

**Preflight (dry run):** `node .claude/skills/drive/run.mjs --dry-run` — verifies `claude` is runnable, `gh` is authenticated (if `push`), and every repo is a clean tree on its base branch, then lists the bundles it would run. Fix anything it flags (usually a dirty tree) before launching.

**GATE — present the plan and STOP before launching:** the ordered bundle list (id · label · tier), the **per-bundle timeout** and the consecutive-failure circuit breaker, the permission posture (`bypassPermissions`; `git-guardrails` + branch-per-bundle + the timeout are the real guardrails), the push/PR note (PRs open ready for review, so CI + review bots run on them), and — for `--sleep` — the verifier (independent Sonnet; mark UI bundles `"ui": true` so it reviews the diff against `DESIGN.md`). Wait for "go".

**There are no dollar budgets.** Work runs on a subscription, so the only real costs are **wall-clock** and **rate-limit headroom**. The engine bounds a run with `perTaskTimeoutMs`, `maxConsecutiveFailures`, and the `.claude/drive/STOP` flag (drop that file to halt gracefully before the next bundle). Cost control is **routing the right model to the right task**, not a spend cap.

**Launch — attended (default):** run in a terminal you watch:

```
node .claude/skills/drive/run.mjs --attended
```

It pauses at each bundle — `Run this bundle? [go / skip / abort]` — runs it (tier-routed), opens the PR, then `Continue to next bundle? [continue / stop]`. **No `/clear` ever**, and the gates live in the driver's terminal because the child is headless and cannot pause for input. So the flow is: grill/decompose in THIS chat (Phase A) → answer per-bundle gates in the terminal (Phase B). If a bundle needs real discussion, `stop`, drop back to interactive for that one, then resume.

**Launch — `--sleep` (unattended, detached):**

```
Start-Process -FilePath node -ArgumentList '.claude/skills/drive/run.mjs' -WorkingDirectory '<repo-abs-path>' -WindowStyle Hidden
```

No gates; the independent verifier grades each PR. The machine must stay awake (sleep pauses it). Logs land in `.claude/drive/runs/<timestamp>/` regardless.

**Reconcile.** After each bundle, write its `status` / `branch` / `PR` into the spec, verified against `gh` (not the child's claim). If a bundle came back `blocked`/`failed`, append a line to the spec's Lesson candidates and remind to run `/lesson` (never auto-promote).

## Resume (fresh session — the same `/drive <N>`)

Read the spec; reconcile every non-`todo` bundle against `gh` (PR merged → `done`; PR open → keep; branch, no PR → `in-progress`; nothing → back to `todo`); regenerate the queue for the remaining bundles; relaunch the driver. `/clear` is never required (Phase B accrued no context) — this path exists for when you closed the terminal or the machine.

## Fit gate (for `--sleep` — exclude non-slices)

A `--sleep` bundle must be a bounded, self-contained slice with clear acceptance criteria and no open question. EXCLUDE (report why → run it attended instead): a campaign / multi-phase issue, anything gated on an open question, work sequenced after other unmerged PRs, or a whole-repo blast radius. If EVERY task is excluded, say so and stop — do not launch an empty run.

## Termination

When every bundle is `done` with a **merged** PR: confirm once, then `gh issue close <N>` (cross-repo → close the paired issue too), set the spec `status: complete`, and report the PRs landed. `/drive` never merges.

## status / stop

- **`/drive status <#…>`** — the reconciled bundle table per issue + the newest run's `SUMMARY.md` (else `STATUS.md` + `run.log` tail): PRs, the verifier verdict per PR (**surface every DISAGREE first** — those are the PRs to scrutinize), spend vs cap, one-line next step per PR. If `LESSONS.md` has candidates, name the count and suggest `/lesson`.
- **`/drive stop <#>`** — set the spec `status: blocked` with a one-line reason; for a running unattended driver, `touch .claude/drive/STOP` (halts before the next bundle) or kill the `node run.mjs` process (the in-flight bundle keeps whatever it committed).

## Guardrails — do NOT

- Re-implement prime / grill / plan / implement — chain them by name.
- Skip the Phase A approval gate, or (attended) the per-bundle gates.
- **Auto-launch `--sleep`** without explicit opt-in — it spends money detached.
- Auto-route Fable 5 — it stays a manual, hand-invoked escalation.
- Merge a PR or touch `main` — the driver opens PRs ready for review; merging is yours.
- Translate the brand words "Orbit" / "Astra".
