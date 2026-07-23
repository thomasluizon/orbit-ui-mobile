# Workflow — Picking a Path

> **At a glance** - the path-picking guide: `/drive` is the **one** execution skill (attended by default; `--sleep` runs it unattended overnight). The campaign loop is the shape for converging-metric work. Two axes: slice/epic vs campaign, and attended vs `--sleep`.

## The paths

| Path | You are | Sessions | Finish line | Ends at |
|---|---|---|---|---|
| **`/drive <#…>`** (attended) | at the keyboard | fresh `claude -p` per bundle, resumable via a living spec | known diffs — one slice or a whole epic | ready-for-review PR per bundle, issue closed |
| **`/drive <#…> --sleep`** | asleep | fresh `claude -p` per bundle, unattended | known-diff slices, no open questions | ready-for-review PRs + an independent verifier verdict, reviewed at breakfast |
| **campaign** (no command) | at the keyboard | many, looped | a *converging metric* | the bar holds |

Pick the lightest path that fits. Two questions: **(1) slice/epic or campaign?** · **(2) attended or `--sleep`?** Most work is an attended `/drive` — a single bounded slice is just a **one-bundle drive** (what `/execute` used to be); an epic is a **many-bundle drive**. Campaigns are the shape for big, looped, converging work.

## Step 1 — Slice or campaign?

| | **Slice** | **Campaign** |
|---|---|---|
| **What** | A bounded change you can land in one focused pass — a bug, a feature, even a multi-story feature. You can name the finish line up front. | Big, **looped**, multi-session work: run → assess → fix → re-run until a bar is met. You *can't* name the finish line — it's "until the audit is clean" / "until coverage hits 100%." |
| **Examples** | fix a timezone bug; add streak-freeze; a 3-story feature | #243 (final gate: loop `/prod-readiness` + Sonar-to-zero); a repo-wide audit-and-remediate; a large migration |
| **How** | `/drive` + the slice ladder below | the **Campaign pattern** below — workflows to assess, `/implement` to fix, across **fresh sessions**. Never one `/drive`. |

**Litmus test:** if the finish line is a *converging metric* ("0 findings", "100% coverage") rather than a *known diff*, it's a campaign.

## Step 2 — Attended or unattended?

A second axis, orthogonal to the first: **are you at the keyboard?**

| | **Attended** | **Unattended** |
|---|---|---|
| **You are** | driving, answering the gates | asleep, or away from the machine |
| **Gates** | a hard blocking gate at every stage boundary | ONE gate before launch, then autonomy inside a budget cap |
| **How** | `/drive` (attended) or the campaign loop | **`/drive --sleep`** — the same detached Node driver, one fresh `claude -p` per bundle, gates off |
| **Ends at** | draft PRs you gated at each bundle | **draft** PRs + an independent verifier verdict; nothing merges, `main` is never touched |

Going unattended does not change *what* counts as a slice — it removes the human from the loop, so the work must be work that needs no human. A campaign, or anything gated on an open design question, CANNOT go unattended: `/drive --sleep` screens both out of its queue by design (the fit gate), because a child with nobody to ask just guesses.

## Step 3 (slices) — the path ladder

### Tiny bug (1 file, you know the fix)

Just edit + `/validate`. No PRD, plan, or issue.

### Real bug or small feature (one vertical slice, clear scope)

`/drive <issue#>` — a bounded slice is a **one-bundle drive**: it primes, grills if there are open questions, plans, you approve, then the driver implements it to a draft PR (tier-routed — Sonnet for an isolated slice, Opus otherwise). Or drive the steps yourself:

1. `/prime` — load context (add `<issue#>` if you opened one)
2. `/plan "short description"` — get a plan file
3. `/implement .claude/plans/<name>.plan.md` — code + tests + PR(s)
4. `/pr-review <PR#>` (optional) — second pass before merging

### Medium / large feature (multiple stories, spans repos)

`/feature "<idea>"` chains grill → `/create-prd` (or `/prd-interactive --cold`) → [confirm PRD] → `/create-stories`, gated. Then per issue: `/prime <#>` → `/plan <#>` → `/implement <plan>` → `/pr-review`.

### Multi-issue path (parallelize 2+ issues)

`/prime <A> <B> <C>` → `/plan <A> <B> <C>` → `/implement <A> <B> <C>` — the harness makes paired worktrees (mobile + orbit-api) under `.claude/worktrees/<branch>` and runs the loop per issue, **3 concurrent max**; excess queues. Two issues touching the same files → conflicts surface at PR time.

### Epic / multi-session slice-set (one big issue, or several)

An **epic** — a multi-bundle issue (a phased tech epic, a feature that lands over several PRs) — is a slice-set (you *can* name the finish line: a set of known diffs), not a campaign (the finish line is known diffs, not a converging metric). `/drive` handles it as a **many-bundle drive** — the same command, decomposed into more bundles.

**Phase A** (live, once): `/drive <#>` primes, classifies the epic, grills the open questions, decomposes it into ordered **bundles**, writes a **living spec** at `.claude/specs/issue-<N>.spec.md` (committed, so a fresh session inherits it), and you approve the bundle plan. **Phase B** (the driver): each bundle runs in a **fresh `claude -p`** — zero context accumulation, so you never `/clear`; state passes through the spec + plan files + draft PRs, not conversation. Each bundle is tier-routed to its model and opens a draft PR. Attended, you gate each bundle in the driver's terminal; the same `/drive <N>` resumes from the spec (reconciled against `gh`) if you close the terminal. See the `/drive` skill for the full two-phase model and the AUTO/RECOMMEND/MANUAL table.

A **UI bundle** gets a **vision-verify** step in the attended review: bring up the dev stack, screenshot the changed surface (light + dark) via the `claude-in-chrome` MCP (the default browser driver; chrome-devtools MCP stays reserved for `/profile`), and check the pixels against `DESIGN.md` (with `design-reviewer` on the static token/parity pass). `--sleep` cannot do this — a headless child has no renderer, so it falls back to a static `DESIGN.md` diff review.

### Unattended slice-set (you are asleep) — `/drive --sleep`

`/drive <issue#… | free-text> --sleep` drains a queue of **well-formed slices** overnight. Each bundle gets its own fresh `claude -p` — a live Claude session driving children taints them (`CLAUDECODE` inheritance) and rots its own context — runs on its own branch, and stops at a **draft PR**. Nothing merges; `main` is never touched (the child runs without `--bare`, inheriting `git-guardrails`, which blocks a push to `main`, a force-push, or `--no-verify` for free).

It is `/drive` with the gates off — the **same engine**, same fresh-context-per-bundle principle, trading the attended terminal gates for a budget cap plus a morning review queue. Because nobody is in the loop, each PR is graded by an **independent verifier** — a fresh, cheaper (`sonnet`), read-only `claude -p` with no view of the maker's reasoning — that checks the diff against the acceptance criteria and posts an `AGREE`/`DISAGREE`/`UNSURE` verdict onto the draft PR (a maker cannot reliably grade its own work; a separate grader sees only the artifact). It flags, never blocks. Fail/blocked/`DISAGREE` outcomes are distilled into a run-dir `LESSONS.md` to promote via `/lesson`. Pixel-level vision-verify is **not** wired here (a headless box has no renderer); UI bundles get a static `DESIGN.md` diff review, and the real render check lives in attended `/drive`'s UI gate.

Every bundle passes a **fit gate** first. Excluded (report why → run it attended): a campaign or multi-phase issue, anything gated on an open question, anything sequenced behind other unmerged work, anything with whole-repo blast radius. Groom it into slices, or run it attended.

`/drive status <#…>` reports the run and its draft PRs; `/drive stop <#>` halts gracefully before the next bundle.

## Campaign pattern (looped, multi-session)

For work that converges over many sessions. Three moves, repeated:

1. **Assess with a workflow — don't hand-audit.** `/audit-security|tests|performance|code-quality` and `/prod-readiness` are now **dynamic workflows**: they fan out cheap Haiku finders per surface, run an adversarial skeptic pass, loop until dry, and hand back one tier-tagged report. You just invoke the skill — the fan-out *and* the model routing happen inside it (Opus stays your driver; Haiku does the volume; you don't manage tiers). This is the "workflows / ultracode" part, and it is already built.
2. **Fix a batch with `/implement`** (parity + tests). The workflow *assesses*; it never edits. Remediation is normal slice work — one coherent batch per session.
3. **PR → `/clear` → fresh session → re-run the assessment.** Repeat until the report is clean / the bar holds.

**Why fresh sessions, not one long run:** an assess→fix→re-assess loop is context-heavy; a single session degrades as it fills — the exact anti-pattern this harness fights. Externalize state to the issue + plan/report files; `/clear` between iterations keeps each session sharp. A single `/drive` pass is single-pass — it structurally cannot loop to convergence.

**Worked example — #243 (final pre-launch gate):**

1. Sonar surface config — **one `/drive` per repo** (config-only, no app code; the single slice-shaped phase).
2. Loop `/prod-readiness` → fix a batch via `/implement` → PR → `/clear` → re-run, until no unresolved Critical/High/Medium across the four audits + ops.
3. Sonar burn-down **last**, against frozen code — same loop shape (smells / duplication / coverage → 0 at source).
4. Make both Sonar checks required once green.

Model note: Opus stays the driver throughout (judgment); the cheap leaves are Haiku, wired inside the workflows. See **Model & effort routing** below for the full table and the criteria — routing lives in agent definitions and workflow leaves, never in how you invoke the skill.

## Plan → implement across fresh sessions (any cross-repo or risky slice)

Even a single slice, if it is cross-repo or high-risk, is safer split across two sessions than run as one pass:

1. **Session A:** `/prime <issue>` → `/plan <issue>` → the plan file persists in `.claude/plans/`.
2. `/clear`.
3. **Session B:** fresh `/prime <issue>` → `/implement .claude/plans/<name>.plan.md`.

The plan file is the durable handoff; Session B implements against clean context. A one-bundle `/drive` (plan→implement in one pass) stays right for bounded slices — reach for the split when the plan is large or the blast radius is high. When the work is a whole **epic** (many bundles, not one slice), `/drive` automates this split loop across every bundle — the living spec is the durable handoff and the same `/drive <N>` resumes it.

## Session hygiene (applies everywhere)

- **Small sessions.** `/clear` between tasks and between campaign iterations.
- **Externalize state** to issues + plan/report files, not the conversation.
- **Delegate heavy reading** to `Explore` subagents and the audit workflows — don't read the repo into your main context.

## Model & effort routing (applies everywhere)

You drive on Opus 4.8 @ `high` by default (`effortLevel: high` in `~/.claude/settings.json`, per the [[Cheapen Claude Code effort and fan-out]] ADR — escalate a hard session with `/effort xhigh`; hard skills carry `effort: xhigh` in their own SKILL.md frontmatter). **Model** routing is per-subagent and lives in agent config, never in how you invoke a skill. **Effort** has one extra, documented lever: a skill's own `effort:` frontmatter overrides the session effort while that skill runs, then reverts on the next turn ([Claude Code SKILL.md frontmatter reference](https://code.claude.com/docs/en/skills)). That is still config — declared in the skill file — not an argument passed at a call site.

**The rule, in one line: a subagent runs a different model ONLY if a named agent definition declares one.** Model resolves as `CLAUDE_CODE_SUBAGENT_MODEL` (unset here) → a per-invocation `model` param → the agent's `model:` frontmatter → the main conversation's model. Effort resolves from frontmatter, never a call-site argument, but from **two** frontmatter homes: **the Agent tool exposes no per-invocation effort parameter**, so a *subagent's* effort comes only from its `.claude/agents/*.md` frontmatter; a *driver-session skill's* effort comes from its `SKILL.md` frontmatter and overrides the session level for that turn. Both are a `.md` frontmatter block, which is why the routing still lives in config and never at a call site.

So an anonymous subagent (no `subagent_type`) inherits your session wholesale: Opus 4.8 @ `xhigh`. That is correct for hard work and waste for grunt work.

Delegate-first principle: keep the main session lean. Heavy or mechanical work (search, priming, review, planning, implementation) runs in a model-pinned subagent so its transcript never bloats the driver context; only the gates, grilling, vision-verify, and final judgment stay in the main session. Model routing is the quota lever — pin cheap models on the cheap work.

| Role | Agent | Model | Effort |
|---|---|---|---|
| Driver | main session | Opus 4.8 | `high` |
| Search / mechanical fan-out | `Explore`, `parity-checker`, `i18n-syncer`, `audit-readonly` | Haiku 4.5 | **none possible** |
| Structured review | `security-reviewer`, `design-reviewer`, `contract-aligner` | Sonnet 5 | `medium` |
| Web research fan-out | `web-researcher` | Sonnet 5 | `medium` |
| Context load | `primer` | Sonnet 5 | `medium` |
| Implement — hard path (default) | `implement-opus` | Opus 4.8 | `xhigh` |
| Implement — isolated slice | `implement-sonnet` | Sonnet 5 | `high` |
| Driver skill — heavy | `/plan`, `/implement` (single-issue inline) | Opus 4.8 | `xhigh` (SKILL.md frontmatter) |
| Driver skill — cheap | `/validate`, `/rollup` | Opus 4.8 | `low` (SKILL.md frontmatter) |
| Driver skill — medium | `/handoff` | Opus 4.8 | `medium` (SKILL.md frontmatter) |

**Haiku 4.5 supports no effort levels at all.** An `effort:` line on a `model: haiku` agent is inert — it is not a cheap setting, it is a lie. Do not add one back. Haiku is also 200k context (the others are 1M), so it cannot hold a repo-wide read.

**The criteria, when something goes wrong** (Anthropic's own diagnostic): wrong because it **didn't know enough** → bigger model. Wrong because it **didn't try hard enough** — skipped a file, skipped the tests, didn't check its work → **more effort**. Capability and diligence are different dials, and their guidance is that tuning effort is usually the better lever than switching models.

**Why plan stays on Opus, and implement is now tiered.** Planning is architecture — the textbook case for the larger model, always Opus, never routed down. Implement used to be Opus-only for the same reason (cross-repo, parity- and contract-bound work is *not* "routine work you can describe precisely," and a slightly-worse implement spends review rounds). That reasoning still governs the **hard path** — but Sonnet 5 is now 1M-context on Max and strong enough to carry a *proven-isolated* slice, so `/plan` assigns a `Tier` and the delegated flows (`/drive`, multi-issue `/implement`) route accordingly: **`implement-opus` (Opus @ `xhigh`) is the default**; **`implement-sonnet` (Sonnet 5 @ `high`)** takes only single-repo, parity-`no`, no-contract, no-migration/auth/design slices. Model is the dominant quota lever, so this is the main token reclaim in the harness. The cheap tier carries a safety valve (it stops and returns `blocked` if the slice turns out to cross a boundary the plan missed), so the false-economy risk is bounded. **All modes delegate** — single-issue and path-based `/implement` now route the same way, spawning the tier agent in the repo root and keeping only the E2E/vision + merge gate in the main session; the driver no longer runs implement inline.

**Fable 5 is a manual escalation, never a config.** It is the tier above Opus (there is no Opus 5) and its lead grows with task length — but it is 2x Opus ($10/$50 vs $5/$25), carries 30-day retention with no zero-data-retention option, and was suspended for ~3 weeks in June 2026 under an export-control directive. Never wire it into a skill or the `/drive` engine's config; a default that can be withdrawn is not a default. Reach for it by hand when Opus 4.8 has actually failed a specific hard problem. Note the trap: Fable's pitch ("multi-day autonomous agents") sounds like `/drive --sleep`, but its fit gate admits only bounded slices — the shape where Fable's edge is thinnest.

## On-demand skills (you invoke these; no path leads to them)

These are not steps on the ladder above — nothing routes to them, you reach for them when the
situation matches. They were absent from this guide entirely, which made them look orphaned in
an audit even though several are the canonical tool for their job. Skills cost no always-loaded
context (only a name and a one-line description load), so the cost of listing them is nil and
the cost of forgetting them is doing the job by hand.

| skill | reach for it when |
|---|---|
| `/investigate` | a production error, Sentry alert, or "why is X broken in prod". The full incident runbook over Sentry + Render + Postgres + csharp-lsp. |
| `/llm-council` | a decision needs genuinely opposed lenses and one committed verdict. Not for web research. |
| `/deep-research` | an open "what is the best way to…?" that needs current external evidence. |
| `/second-opinion` | one load-bearing claim or Critical finding needs an independent cross-model check. |
| `/dev-server` | you need the full local stack up (Docker Postgres, then orbit-api, then web) in dependency order. |
| `/android-generate` | you need an Android APK from `apps/mobile`. |
| `/profile` | a web surface is slow, or a Lighthouse budget went red and you need a trace-analyze-fix loop. |
| `/thermo-nuclear-code-quality-review` | ONLY when explicitly asked for a nuclear structural pass. It rewrites code. |
| `/mirror-harness`, `/provider-update` | after changing an agent, skill, hook, or MCP server, to resync the public pack / other providers. |

## Two recurring details

- Stories carry a `repo:frontend` / `repo:backend` / `repo:both` label; `/implement` reads it and opens branches + PRs in the right repo(s), cross-linked.
- Anything touching a web hook/component needs its mobile counterpart unless the story says otherwise — `/implement`'s parity phase enforces this via the `parity-checker` subagent.

## Rule of thumb

Single PR's worth of work → skip the PRD, go `/prime` → `/plan`. PRDs and stories pay off at **3+** connected pieces. A bounded slice or a known-diff **epic** that spans several PRs / sessions → `/drive` (resumable, spec-driven, fresh-context per bundle). Slices you want finished by morning → `/drive --sleep` (draft PRs, budget-capped, independent verifier, one gate before launch). A converging-metric finish line → it's a **campaign**: loop workflows across fresh sessions, don't force it into one pass.
