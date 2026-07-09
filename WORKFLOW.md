# Workflow — Picking a Path

Pick the lightest path that fits. Two questions, in order: **(1) slice or campaign?** then **(2) which slice tier?** Most work is a slice — `/execute` is still the default. Campaigns are the shape for big, looped work.

## Step 1 — Slice or campaign?

| | **Slice** | **Campaign** |
|---|---|---|
| **What** | A bounded change you can land in one focused pass — a bug, a feature, even a multi-story feature. You can name the finish line up front. | Big, **looped**, multi-session work: run → assess → fix → re-run until a bar is met. You *can't* name the finish line — it's "until the audit is clean" / "until coverage hits 100%." |
| **Examples** | fix a timezone bug; add streak-freeze; a 3-story feature | #243 (final gate: loop `/prod-readiness` + Sonar-to-zero); a repo-wide audit-and-remediate; a large migration |
| **How** | `/execute` + the slice ladder below | the **Campaign pattern** below — workflows to assess, `/implement` to fix, across **fresh sessions**. Never one `/execute`. |

**Litmus test:** if the finish line is a *converging metric* ("0 findings", "100% coverage") rather than a *known diff*, it's a campaign.

## Step 2 (slices) — the path ladder

### Tiny bug (1 file, you know the fix)

Just edit + `/validate`. No PRD, plan, or issue.

### Real bug or small feature (one vertical slice, clear scope)

`/execute <issue#>` chains `/prime` (context load) → `grill-me` → `/plan` → [confirm plan] → `/implement`, with a hard blocking gate at every boundary. Or drive the steps yourself:

1. `/prime` — load context (add `<issue#>` if you opened one)
2. `/plan "short description"` — get a plan file
3. `/implement .claude/plans/<name>.plan.md` — code + tests + PR(s)
4. `/pr-review <PR#>` (optional) — second pass before merging

### Medium / large feature (multiple stories, spans repos)

`/feature "<idea>"` chains grill → `/create-prd` (or `/prd-interactive --cold`) → [confirm PRD] → `/create-stories`, gated. Then per issue: `/prime <#>` → `/plan <#>` → `/implement <plan>` → `/pr-review`.

### Multi-issue path (parallelize 2+ issues)

`/prime <A> <B> <C>` → `/plan <A> <B> <C>` → `/implement <A> <B> <C>` — the harness makes paired worktrees (mobile + orbit-api) under `.claude/worktrees/<branch>` and runs the loop per issue, **3 concurrent max**; excess queues. Two issues touching the same files → conflicts surface at PR time.

## Campaign pattern (looped, multi-session)

For work that converges over many sessions. Three moves, repeated:

1. **Assess with a workflow — don't hand-audit.** `/audit-security|tests|performance|code-quality` and `/prod-readiness` are now **dynamic workflows**: they fan out cheap Haiku finders per surface, run an adversarial skeptic pass, loop until dry, and hand back one tier-tagged report. You just invoke the skill — the fan-out *and* the model routing happen inside it (Opus stays your driver; Haiku does the volume; you don't manage tiers). This is the "workflows / ultracode" part, and it is already built.
2. **Fix a batch with `/implement`** (parity + tests). The workflow *assesses*; it never edits. Remediation is normal slice work — one coherent batch per session.
3. **PR → `/clear` → fresh session → re-run the assessment.** Repeat until the report is clean / the bar holds.

**Why fresh sessions, not one long run:** an assess→fix→re-assess loop is context-heavy; a single session degrades as it fills — the exact anti-pattern this harness fights. Externalize state to the issue + plan/report files; `/clear` between iterations keeps each session sharp. `/execute` is single-pass — it structurally cannot loop to convergence.

**Worked example — #243 (final pre-launch gate):**

1. Sonar surface config — **one `/execute` per repo** (config-only, no app code; the single slice-shaped phase).
2. Loop `/prod-readiness` → fix a batch via `/implement` → PR → `/clear` → re-run, until no unresolved Critical/High/Medium across the four audits + ops.
3. Sonar burn-down **last**, against frozen code — same loop shape (smells / duplication / coverage → 0 at source).
4. Make both Sonar checks required once green.

Model note: Opus stays the driver throughout (judgment); the cheap leaves are Haiku, wired inside the workflows. There is no Fable/flagship-driver step — model routing lives in the workflow leaves, not in how you invoke the skill.

## Plan → implement across fresh sessions (any cross-repo or risky slice)

Even a single slice, if it is cross-repo or high-risk, is safer split across two sessions than run as one `/execute`:

1. **Session A:** `/prime <issue>` → `/plan <issue>` → the plan file persists in `.claude/plans/`.
2. `/clear`.
3. **Session B:** fresh `/prime <issue>` → `/implement .claude/plans/<name>.plan.md`.

The plan file is the durable handoff; Session B implements against clean context. `/execute` (plan→implement in one shot) stays right for bounded slices — reach for the split when the plan is large or the blast radius is high.

## Session hygiene (applies everywhere)

- **Small sessions.** `/clear` between tasks and between campaign iterations.
- **Externalize state** to issues + plan/report files, not the conversation.
- **Delegate heavy reading** to `Explore` subagents and the audit workflows — don't read the repo into your main context.

## Two recurring details

- Stories carry a `repo:frontend` / `repo:backend` / `repo:both` label; `/implement` reads it and opens branches + PRs in the right repo(s), cross-linked.
- Anything touching a web hook/component needs its mobile counterpart unless the story says otherwise — `/implement`'s parity phase enforces this via the `parity-checker` subagent.

## Rule of thumb

Single PR's worth of work → skip the PRD, go `/prime` → `/plan`. PRDs and stories pay off at **3+** connected pieces. A converging-metric finish line → it's a **campaign**: loop workflows across fresh sessions, don't force it into one `/execute`.
