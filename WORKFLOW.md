# Workflow — Picking a Path

> **At a glance** - the path-picking guide: which command to reach for (`/execute`, `/drive`, `/night-run`, or the campaign loop) on two axes - slice vs campaign, and attended vs unattended.

## The four paths

| Path | You are | Sessions | Finish line | Ends at |
|---|---|---|---|---|
| **`/execute <#…>`** | at the keyboard | one | a known diff, one pass | merge-ready PR |
| **`/drive <#…>`** | at the keyboard | many, resumable via a living spec | known diffs, several PRs | PR per bundle, issue closed |
| **`/night-run <#…>`** | asleep | one fresh `claude -p` per task | a known diff, unattended | draft PRs to review at breakfast |
| **campaign** (no command) | at the keyboard | many, looped | a *converging metric* | the bar holds |

Pick the lightest path that fits. Three questions, in order: **(1) slice or campaign?** · **(2) attended or unattended?** · **(3) which slice tier?** Most work is an attended slice — `/execute` is still the default. Campaigns are the shape for big, looped work; `/night-run` is the shape for work you want waiting for you in the morning.

## Step 1 — Slice or campaign?

| | **Slice** | **Campaign** |
|---|---|---|
| **What** | A bounded change you can land in one focused pass — a bug, a feature, even a multi-story feature. You can name the finish line up front. | Big, **looped**, multi-session work: run → assess → fix → re-run until a bar is met. You *can't* name the finish line — it's "until the audit is clean" / "until coverage hits 100%." |
| **Examples** | fix a timezone bug; add streak-freeze; a 3-story feature | #243 (final gate: loop `/prod-readiness` + Sonar-to-zero); a repo-wide audit-and-remediate; a large migration |
| **How** | `/execute` + the slice ladder below | the **Campaign pattern** below — workflows to assess, `/implement` to fix, across **fresh sessions**. Never one `/execute`. |

**Litmus test:** if the finish line is a *converging metric* ("0 findings", "100% coverage") rather than a *known diff*, it's a campaign.

## Step 2 — Attended or unattended?

A second axis, orthogonal to the first: **are you at the keyboard?**

| | **Attended** | **Unattended** |
|---|---|---|
| **You are** | driving, answering the gates | asleep, or away from the machine |
| **Gates** | a hard blocking gate at every stage boundary | ONE gate before launch, then autonomy inside a budget cap |
| **How** | the slice ladder below (`/execute`, `/drive`) or the campaign loop | **`/night-run`** — a detached Node driver, one fresh `claude -p` per task |
| **Ends at** | merge-ready PRs you shepherded | **draft** PRs; nothing merges, `main` is never touched |

Going unattended does not change *what* counts as a slice — it removes the human from the loop, so the work must be work that needs no human. A campaign, or anything gated on an open design question, CANNOT go unattended: `/night-run` screens both out of its queue by design, because a child with nobody to ask just guesses.

## Step 3 (slices) — the path ladder

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

### Epic / multi-session slice-set (one big issue, or several) — `/drive`

An **epic** — a multi-bundle issue (a phased tech epic, a feature that lands over several PRs) — is still a slice-set (you *can* name the finish line: a set of known diffs), but it is too big for one `/execute` pass: one giant plan, one giant implement, a context window that rots. It is also NOT a campaign — the finish line is known diffs, not a converging metric.

`/drive <issue#> [issue# …]` is the tool. It breaks the epic into **bundles**, does a bounded chunk per session with the same three gates as `/execute` (spec approval → grill → plan approval), and writes progress to a **living spec** at `.claude/specs/issue-<N>.spec.md` (gitignored, like plans). Heavy plan/implement work runs in **worktree subagents** (multiple issues in parallel, 3 concurrent max, like `/execute`'s multi mode); the interactive gates stay in the main session. Two levers compose: subagents keep the main session thin (so you drive several bundles per session), and the spec makes any `/clear` free — re-run the **same** `/drive <N>` and it reconciles against `gh` and continues, until the issue is closed. It is the attended twin of `/night-run` (fresh context per unit, state in a file) with the gates kept.

Reach for `/drive` when a single `/execute` would swallow an epic; reach for `/execute` when the whole thing lands in one focused session.

### Unattended slice-set (you are asleep) — `/night-run`

`/night-run [issue#… | --label <l> | --backlog <file>]` drains a queue of **well-formed slices** overnight. Each task gets its own fresh `claude -p` session — a live Claude session driving children taints them (`CLAUDECODE` inheritance) and rots its own context — runs on its own branch, and stops at a **draft PR**. Nothing merges. `main` is never touched. The child runs without `--bare`, so it inherits the project hooks and `git-guardrails` blocks a push to `main`, a force-push, or `--no-verify` from inside each task for free.

It is the **unattended twin of `/drive`**: same principle (fresh context per unit of work, state externalized to a file, never one long rotting session), trading `/drive`'s interactive gates for a budget cap plus a morning review queue. `/drive` keeps you at every plan; `/night-run` keeps you at the merge.

Every task passes a **fit gate** first. Excluded and reported as `not a night-run task`: a campaign or multi-phase issue, anything gated on an open question, anything sequenced behind other unmerged work, anything with whole-repo blast radius. Groom it into slices, or run it attended.

`/night-run status` reports the run and its draft PRs; `/night-run stop` halts gracefully before the next task.

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

Model note: Opus stays the driver throughout (judgment); the cheap leaves are Haiku, wired inside the workflows. See **Model & effort routing** below for the full table and the criteria — routing lives in agent definitions and workflow leaves, never in how you invoke the skill.

## Plan → implement across fresh sessions (any cross-repo or risky slice)

Even a single slice, if it is cross-repo or high-risk, is safer split across two sessions than run as one `/execute`:

1. **Session A:** `/prime <issue>` → `/plan <issue>` → the plan file persists in `.claude/plans/`.
2. `/clear`.
3. **Session B:** fresh `/prime <issue>` → `/implement .claude/plans/<name>.plan.md`.

The plan file is the durable handoff; Session B implements against clean context. `/execute` (plan→implement in one shot) stays right for bounded slices — reach for the split when the plan is large or the blast radius is high. When the work is a whole **epic** (many bundles, not one slice), `/drive` automates this split loop across every bundle — the living spec is the durable handoff and the same `/drive <N>` resumes it.

## Session hygiene (applies everywhere)

- **Small sessions.** `/clear` between tasks and between campaign iterations.
- **Externalize state** to issues + plan/report files, not the conversation.
- **Delegate heavy reading** to `Explore` subagents and the audit workflows — don't read the repo into your main context.

## Model & effort routing (applies everywhere)

You drive on Opus 4.8 @ `xhigh` by default. **Model** routing is per-subagent and lives in agent config, never in how you invoke a skill. **Effort** has one extra, documented lever: a skill's own `effort:` frontmatter overrides the session effort while that skill runs, then reverts on the next turn ([Claude Code SKILL.md frontmatter reference](https://code.claude.com/docs/en/skills)). That is still config — declared in the skill file — not an argument passed at a call site.

**The rule, in one line: a subagent runs a different model ONLY if a named agent definition declares one.** Model resolves as `CLAUDE_CODE_SUBAGENT_MODEL` (unset here) → a per-invocation `model` param → the agent's `model:` frontmatter → the main conversation's model. Effort resolves from frontmatter, never a call-site argument, but from **two** frontmatter homes: **the Agent tool exposes no per-invocation effort parameter**, so a *subagent's* effort comes only from its `.claude/agents/*.md` frontmatter; a *driver-session skill's* effort comes from its `SKILL.md` frontmatter and overrides the session level for that turn. Both are a `.md` frontmatter block, which is why the routing still lives in config and never at a call site.

So an anonymous subagent (no `subagent_type`) inherits your session wholesale: Opus 4.8 @ `xhigh`. That is correct for hard work and waste for grunt work.

| Role | Agent | Model | Effort |
|---|---|---|---|
| Driver | main session | Opus 4.8 | `xhigh` |
| Search / mechanical fan-out | `Explore`, `parity-checker`, `i18n-syncer`, `audit-readonly` | Haiku 4.5 | **none possible** |
| Structured review | `security-reviewer`, `design-reviewer`, `contract-aligner` | Sonnet 5 | `medium` |
| Web research fan-out | `web-researcher` | Sonnet 5 | `medium` |
| Context load | `primer` | Sonnet 5 | `medium` |
| Driver skill — heavy | `/plan`, `/implement` | Opus 4.8 | `xhigh` (SKILL.md frontmatter) |
| Driver skill — cheap | `/validate`, `/rollup` | Opus 4.8 | `low` (SKILL.md frontmatter) |
| Driver skill — medium | `/handoff` | Opus 4.8 | `medium` (SKILL.md frontmatter) |

**Haiku 4.5 supports no effort levels at all.** An `effort:` line on a `model: haiku` agent is inert — it is not a cheap setting, it is a lie. Do not add one back. Haiku is also 200k context (the others are 1M), so it cannot hold a repo-wide read.

**The criteria, when something goes wrong** (Anthropic's own diagnostic): wrong because it **didn't know enough** → bigger model. Wrong because it **didn't try hard enough** — skipped a file, skipped the tests, didn't check its work → **more effort**. Capability and diligence are different dials, and their guidance is that tuning effort is usually the better lever than switching models.

**Why plan and implement stay on Opus.** Planning is architecture — the textbook case for the larger model. Implementing here is cross-repo, cross-platform, parity- and contract-bound; it is *not* "routine work you can describe precisely" (the cue for a smaller model), and a slightly-worse implement doesn't save money, it spends review rounds.

**Fable 5 is a manual escalation, never a config.** It is the tier above Opus (there is no Opus 5) and its lead grows with task length — but it is 2x Opus ($10/$50 vs $5/$25), carries 30-day retention with no zero-data-retention option, and was suspended for ~3 weeks in June 2026 under an export-control directive. Never wire it into a skill or `night-run`'s config; a default that can be withdrawn is not a default. Reach for it by hand when Opus 4.8 has actually failed a specific hard problem. Note the trap: Fable's pitch ("multi-day autonomous agents") sounds like `/night-run`, but night-run's fit gate admits only bounded slices — the shape where Fable's edge is thinnest.

## Two recurring details

- Stories carry a `repo:frontend` / `repo:backend` / `repo:both` label; `/implement` reads it and opens branches + PRs in the right repo(s), cross-linked.
- Anything touching a web hook/component needs its mobile counterpart unless the story says otherwise — `/implement`'s parity phase enforces this via the `parity-checker` subagent.

## Rule of thumb

Single PR's worth of work → skip the PRD, go `/prime` → `/plan`. PRDs and stories pay off at **3+** connected pieces. A known-diff **epic** that spans several PRs / sessions → `/drive` (resumable, spec-driven, subagent-fanned). Bounded slices you want finished by morning → `/night-run` (draft PRs, budget-capped, one gate before launch). A converging-metric finish line → it's a **campaign**: loop workflows across fresh sessions, don't force it into one `/execute`.
