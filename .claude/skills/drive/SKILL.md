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

**A/B override (`config.modelOverride`).** Set `"modelOverride": "sonnet"` (or `"opus"`) in the runtime `config.json` (`.claude/drive/config.json` - the engine reads only that file; `config.example.json` deliberately ships WITHOUT the key, because an example that carries it permanently forces every opus-tier bundle to sonnet for anyone who copies it) to force **every** bundle to that model, ignoring the per-bundle `tier` Phase A assigned - the switch for a controlled "all-Sonnet vs Opus baseline" week. Each run records the model that actually ran per bundle (`runs/**/task-<id>.json` → `model`); `tools/drive-ab-report.mjs` tallies done/blocked/failed + verifier DISAGREE per model so the quality delta is measured, not guessed. **Revert by deleting the key** (restores tier routing). The verifier stays on its own `verifyModel` (independent, unaffected).

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

   If the tool reports that globs were **not** granted as ownership (`apps/web/**`), fix the PLAN: name the real files. A glob is not a boundary, and an agent handed one has no way to know when it has left its lane. The tool also REFUSES (exit 2) a plan whose id or files collide with an existing work order's exclusive ownership - narrow the plan, or route the visual work through the owning surface's own order. A visual epic skips this step because `node tools/workorder.mjs` already derives the manifest work orders; their live count is the first lines of `.claude/workorders/INDEX.md`, never hardcoded here, because it moves whenever a surface id folds into its primary owner or residual debt clears.

   **Commit the work order before the queue is built, not after.** `check-diff-ownership` reads Boundaries from `git show <base>:` by design, so an order that is only on disk grants NOTHING: run against a realistic driver base, condition (b) exits 2 with `no work order "<id>" at base <sha>`. The regeneration in step 9 also dirties `INDEX.md`, so it is two files, not one:

   ```bash
   git add .claude/workorders/<id>.md .claude/workorders/INDEX.md .claude/plans/<name>.plan.md
   git commit -m "chore(drive): work order for <id>"
   ```

   **Plans are COMMITTED alongside the work orders they source** (`.claude/plans/*.plan.md` is un-ignored for exactly this; the rest of `.claude/plans/` stays local). The committed order's `generatedFrom` frontmatter points at the plan, so a checkout without the plan file has a bundle whose contract - its Tier, its acceptance criteria, its whole Backlog B - cannot be read: drive-queue falls back to opus with a warning, and the child's Goal points at a file that does not exist. Commit the plan in the same commit as its work order.
7. **Write the spec** (below), all bundles `todo`, `next-action: "/drive <N>"`.
8. **GATE — approve the bundle plan.** Show the bundle table (id · scope · tier · PR-count) + sequencing. Wait for `approve` / `edit <note>` / `abort`. Default-deny: no or ambiguous response → restate and wait. NOTHING runs without an explicit approve.
9. **Generate the driver artifacts** (the Phase B handoff) into `.claude/drive/` (gitignored runtime dir): `config.json` (from `config.example.json` in this folder — set timeouts, `repos`, `addDirs`), then **generate the queue and the prompts; do not write them by hand**:

   ```bash
   node tools/workorder.mjs                      # regenerate the manifest work orders (plan orders from step 6 are preserved)
   node tools/drive-queue.mjs --only-debt --dry-run   # see the bundle plan
   node tools/drive-queue.mjs --only-debt        # write queue.json + prompts/task-<id>.md
   ```

   `drive-queue.mjs` packs manifest work orders into bundles within one platform and kind, caps each bundle on files, debt and count, tier-routes it, and writes a prompt that hands the child its work orders instead of a description of them. A plan work order (step 6) is never packed: it becomes its OWN bundle (`plan-<name>`, solo - a plan is already a sized slice), its tier read from the plan's Tier field (a plan without one falls back to opus with a printed warning), and `ui: false` so the `--sleep` verifier does not grade non-visual work against DESIGN.md; manifest bundles carry `ui: true`. `--only-debt` keeps plan orders regardless of debt, because their backlog is the plan's acceptance criteria, not the lint baseline. **It DROPS every other debt-free order** - roughly 39% of the manifest orders, the ones whose own body reads "Backlog A is a FLOOR you have already met; Backlog B is the work" - and the run prints the excluded count so you never have to infer it. A full `--sleep` drain of this queue can therefore come back all-green while those surfaces were never handed to any agent. Drop `--only-debt` (or run a second pass without it) when the judgement backlog is what you are draining. So a non-visual epic takes the SAME path: `workorder --from-plan` per plan (step 6), then the three commands above - there is no hand-written queue. If you ever hand-write `queue.json` anyway (a one-off outside any plan), every entry REQUIRES a prompt (a `prompts/task-<id>.md` file or a non-empty `"prompt"` field): the engine's preflight hard-fails (exit 1) on a promptless entry, because a queue written without prompts once passed `--dry-run` and then skipped 100% of its bundles at runtime.

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
| the bundle's enumerated violations are cleared | `node tools/workorder.mjs --check --id <id>`, once per work order in the bundle (the global `--check` stays out of the child's conditions: it cannot pass while OTHER bundles still carry debt) |
| the diff stayed inside the bundle's owned files plus the structurally permitted classes (the suppressions ledgers, an owned file's test companion, the i18n pair), and no gate state moved | `node tools/check-diff-ownership.mjs --id <id> ... --base <sha>` (every id in the bundle, one run). The `--base` is PINNED: the generated prompt carries a `{{DRIVE_BASE}}` placeholder the driver substitutes at spawn with the sha the bundle branched from - unpinned, the gate resolves a base that predates the work orders and exits 2 for honest work, and `--base HEAD` after committing measures an empty diff. The engine hard-fails a pinned prompt it cannot fill, and its preflight rejects a workOrders bundle whose prompt lacks the placeholder. |
| each touched work order carries a new Timeline entry | the work order file's diff |

The prompt's parity rule follows the bundle kind. A plan bundle's parity is scoped to the files
the plan itself owns: a plan whose "Files to Change" spans both platforms does full parity
in-bundle; one that names only one platform shipped with a parity gap, and the child STOPs on the
mirror work, records the gap in the Timeline as a planning defect, and never edits unowned mirror
files - the ownership gate reads any such edit as an escape. A manifest (visual-conformance)
bundle does NOT edit the other platform's mirror files - the mirror surface has its own work order
and possibly its own agent right now - so when a fix genuinely requires an unowned mirror edit the
child STOPs and records it in the Timeline. i18n pair edits are permitted for both kinds.

The prompt's final pre-commit step is a full `node tools/workorder.mjs` regeneration, committed
with the work: clearing debt moves the order's `mechanicalDebt` frontmatter, CI's ledger-freshness
gate asserts the committed orders byte-equal a fresh regeneration, and the ownership gate
sanctions a work-order rewrite only when it IS byte-identical regeneration output with every
recorded Timeline entry intact. The ledger is derived state; the child never hand-edits it.

Meeting all three makes a bundle **`ready-for-review`**. There is deliberately no `done` status a
child can return for visual work: completion is granted only by a human tick in
`.claude/manifests/signoff.json`. The prompt says so explicitly and forbids the child from claiming
a surface "looks good" or is "redesigned" - it has no instrument that establishes that, and ten
previous sessions made exactly that claim and were wrong every time. For a plan bundle the human
grant is the merge: the prompt ends at READY FOR REVIEW and leaves whether the acceptance criteria
are genuinely met to the human reviewer.

Tier and effort still come from the queue entry, not the prompt.

---

## Phase B — the driver

The engine is **`.claude/skills/drive/run.mjs`**; its runtime dir is **`.claude/drive/`** (config / queue / prompts / runs — gitignored). It spawns one fresh `claude -p` per bundle (clean context each time), routes each to its tier model + effort, resets every repo to its base between bundles, and stops each bundle at a PR ready for review.

**Preflight (dry run):** `node .claude/skills/drive/run.mjs --dry-run` - verifies `claude` is runnable, `gh` is authenticated (if `push`), every repo is a clean tree on its base branch, every queue entry has a prompt (a promptless entry is a preflight ERROR that names the entry, not a runtime skip), and every bundle carrying work orders pins its ownership base (its prompt contains the `{{DRIVE_BASE}}` placeholder the driver fills at spawn - a missing pin is a preflight ERROR), then lists the bundles it would run. A failed preflight exits 1. Fix anything it flags (usually a dirty tree) before launching.

**GATE - present the plan and STOP before launching:** the ordered bundle list (id · label · tier), the **per-bundle timeout** and the consecutive-failure circuit breaker, the permission posture (`bypassPermissions`; `git-guardrails` + branch-per-bundle + the timeout are the real guardrails), the push/PR note (PRs open ready for review, so CI + review bots run on them), and - for `--sleep` - the verifier (independent Sonnet; `drive-queue.mjs` sets `"ui"` from the bundle's kind - manifest bundles true, plan bundles false - so only visual bundles are reviewed against `DESIGN.md`). Wait for "go".

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

Read the spec; reconcile every non-`todo` bundle against `gh` (PR merged → `done`; PR open → keep; branch, no PR → `in-progress`; nothing → back to `todo`); regenerate the queue for the remaining bundles; relaunch the driver. Bundle ids are content-derived (platform-kind plus a stable hash of the bundle's sorted work-order ids), so a regeneration re-keys a bundle only when its membership actually changed: run logs, spec rows and operator notes written before the resume keep naming the same work, and a changed id is itself a signal that the bundle's composition moved. Stale prompts for ids the new queue no longer contains are swept by the write. `/clear` is never required (Phase B accrued no context) - this path exists for when you closed the terminal or the machine.

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
