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

6. **Turn every plan into a work order. Not optional, and not only for visual work.**

   ```bash
   node tools/workorder.mjs --from-plan .claude/plans/<name>.plan.md   # once per plan
   ```

   This is what stops the child rediscovering its own file list, and it is the single largest measured cost in the whole loop (orientation 36.6% of actions, editing 5.6%). The plan's `## Files to Change` becomes a checkable ownership boundary, and `tools/check-diff-ownership.mjs` enforces it afterwards.

   If the tool reports that globs were **not** granted as ownership (`apps/web/**`), fix the PLAN: name the real files. A glob is not a boundary, and an agent handed one has no way to know when it has left its lane. A visual epic skips this step because `node tools/workorder.mjs` already derives its 217 work orders from the surface manifest.
7. **Write the spec** (below), all bundles `todo`, `next-action: "/drive <N>"`.
8. **GATE — approve the bundle plan.** Show the bundle table (id · scope · tier · PR-count) + sequencing. Wait for `approve` / `edit <note>` / `abort`. Default-deny: no or ambiguous response → restate and wait. NOTHING runs without an explicit approve.
9. **Generate the driver artifacts** (the Phase B handoff) into `.claude/drive/` (gitignored runtime dir): `config.json` (from `config.example.json` in this folder — set timeouts, `repos`, `addDirs`), then **generate the queue and the prompts; do not write them by hand**:

   ```bash
   node tools/workorder.mjs                      # regenerate the 217 work orders (reviewable diff)
   node tools/drive-queue.mjs --only-debt --dry-run   # see the bundle plan
   node tools/drive-queue.mjs --only-debt        # write queue.json + prompts/task-<id>.md
   ```

   `drive-queue.mjs` packs work orders into bundles within one platform and kind, caps each bundle on files, debt and count, tier-routes it, and writes a prompt that hands the child its work orders instead of a description of them. Hand-writing either file is how the previous queue became unrunnable (see below). For a non-visual epic with no work orders, write `queue.json` by hand — one entry per approved bundle, `{ "id", "label", "repo", "tier", "effort" }` in run order.

### The living spec

One file per issue at `.claude/specs/issue-<N>.spec.md` (committed). Authoritative for what is done and what is next, but **reconciled against `gh` on every resume** — never trusted blindly (a PR the spec calls "done" may have been closed unmerged; verify with `gh pr view`).

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

### Per-bundle prompt (`.claude/drive/prompts/task-<id>.md`) — GENERATED, not written

`node tools/drive-queue.mjs` writes these. Do not hand-write one, and do not paste a template
here: two properties of the generated prompt are load-bearing and a hand-written one loses both.

**1. It hands the child its work orders instead of describing the task.** The prompt's first
instruction is to read `.claude/workorders/<id>.md` for each work order in the bundle. That file
already contains the exclusive owned-file list, the enumerated `local/*` violations in those files
with counts, the judgement checks for that surface kind, and an append-only Timeline of what
previous sessions tried. This is the whole point: measured across nine drive-child transcripts,
orientation was **36.6%** of all actions and editing was **5.6%** — roughly 6.5 orientation actions
per edit. The manifest had held exclusive ownership for all 171 surfaces the entire time and no
child was ever handed it.

**2. Its definition of done is satisfiable.** The previous template said a bundle was done "ONLY
when `surfaces:check` verifies your surfaces". After the gate rebuild made a human tick the only
granting axis, no child could ever satisfy that — `surfaces:check` cannot return success without a
signature the child is structurally blocked from writing. Every queued bundle would have burned its
full wall clock and returned `blocked`, and an honest child could not report success no matter what
it built. The generated prompt asks for three things a machine can actually check:

| condition | checked by |
|---|---|
| the bundle's enumerated violations are cleared | `node tools/workorder.mjs --check` |
| the diff never left the bundle's owned files, and no gate state moved | `node tools/check-diff-ownership.mjs --id <id>` |
| each touched work order carries a new Timeline entry | the work order file's diff |

Meeting all three makes a bundle **`ready-for-review`**. There is deliberately no `done` status a
child can return for visual work: completion is granted only by a human tick in
`.claude/manifests/signoff.json`. The prompt says so explicitly and forbids the child from claiming
a surface "looks good" or is "redesigned" — it has no instrument that establishes that, and ten
previous sessions made exactly that claim and were wrong every time.

Tier and effort still come from the queue entry, not the prompt.

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
