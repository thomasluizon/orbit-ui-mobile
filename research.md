# Agentic Harness Research and Design

> **At a glance** - 2026-07-09 deep-research on the best local agentic harness for a solo dev on the Orbit stack.
> - Verdict: the harness is already top-few-percent; do not rebuild - fix config drift and route models by task.
> - Through-line: maximum autonomy WITHIN a phase, a hard human gate BETWEEN phases (never a headless loop).
> - Adds: an `/investigate` skill and a proactive `.claude/rules/` layer; split plan and implement into separate sessions.
> - The actionable stage-by-stage checklist is the companion `.claude/research/harness-upgrade-plan.md`.
> - Read the whole doc for the setup audit, the external evidence, and the sources.

**Date:** 2026-07-09
**Scope:** The best local agentic harness / multi-agent orchestration setup for a solo developer (you) using Claude Code (plus Codex / opencode) across the Orbit stack (`orbit-ui-mobile`, `orbit-api`, `orbit-landing-page`), given that every session starts from `orbit-ui-mobile`.

**How this was produced:** Eight subagents run in parallel. Two audited the local setup (global layer, Orbit layer). Six did deep web research (Anthropic official docs, Anthropic blogs, Matt Pocock's opinions, multi-agent/cross-tool consensus, model/effort routing + cost, spec-driven development). Source material: the "Agentic Pipeline Presentation" PDF (21 pages, a company standardization deck) plus its nine cited Anthropic references, all fetched live on 2026-07-09.

**Baseline assumptions:** You run Opus 4.8 at `xhigh` effort by default, likely on a Max plan (so "cost" is quota/rate-limit burn, not per-token dollars). You want maximum autonomy and intelligence, with the pipeline doing the right thing proactively rather than being told each time.

---

## Table of contents

1. Executive summary (the verdict)
2. Part 1 - Current setup audit (what's right, what's wrong)
3. Part 2 - External research findings (Anthropic, Pocock, multi-agent, routing, spec-driven)
4. Part 3 - The target design (answers to every question you asked)
5. Part 4 - Prioritized action plan
6. Part 5 - Sources
7. Confidence and caveats

---

## 1. Executive summary (the verdict)

Your harness is already in the top few percent. The deterministic-gate layer, the single-source rubric, the adversarial-skeptic review, and the file-durable spec flow are genuinely best-practice, and they line up almost 1:1 with what Anthropic now publishes and what Matt Pocock preaches. You do not need a rebuild. You need to:

1. **Fix roughly ten pieces of config drift** (two of which are quietly degrading you right now).
2. **Turn on the model/effort routing the platform already supports**, so you stop paying Opus-xhigh rates for mechanical work.
3. **Add the two missing pieces**: an `/investigate` prod-debugging skill and a proactive-standards `.claude/rules/` layer.
4. **Split one session seam** for medium-plus work (plan then a fresh implement session).

The exotic ideas you were excited about (cross-tool consensus, two agents debating to agreement) are real but are an on-demand tool, not the backbone. Your existing refute-pass already beats naive voting.

**The through-line from every source:** maximum autonomy WITHIN a phase, hard human gate BETWEEN phases. That is exactly what your gated PIV loop already does, what Anthropic's best-practices doc describes, and what your own company deck mandates (target maturity levels 3-4, avoid the level-5 headless loop). So "most autonomous pipeline possible" does not mean unattended. It means cheaper, better-routed, better-gated autonomous execution.

---

## 2. Part 1 - Current setup audit

### 2.1 What's RIGHT (keep, do not touch)

**Global layer (`~/.claude`)**

- **The memory system is your single best asset.** 84 graduating, pointer-style lessons with a curated `MEMORY.md` index. This is the "self-improving harness" done the safe way (proposal-gated, not autonomous). Anthropic's own `Stop`-hook-proposes-CLAUDE.md-updates pattern is the same shape.
- **Lean, intentional settings.** `disableBundledSkills`, `disableArtifact`, and denying `ScheduleWakeup`/`NotebookEdit` are deliberate context trims. Nothing accidental.
- **Rich statusline.** Model + context bar + both rate-limit windows (5h + weekly) is exactly the operational signal a heavy user needs.

**Orbit layer (the impressive part)**

- **Machine-checkable rules are actually gated, not written as prose.** 10 hooks + 3 ESLint `local/*` rules + 2 Roslyn analyzers. The no-narration-comment rule is enforced at three independent layers (`local/no-comments` for TS, the landing Astro config, and `ORBIT0001` for C#). This realizes Anthropic's official "gates over prose" guidance, and your own memory (`guardrails over memory rules`) predicted their blog.
- **Single-source rubric + `_shared/verification-protocol.md`, forked to nothing.** `pr-review/rubric.md` is walked verbatim by both `/pr-review` (over a diff) and `/audit-code-quality` (repo-wide). One file defines the reliability bar for all six audit/review skills, so it can never drift.
- **Adversarial-skeptic verification.** Every Critical/High finding must survive an independent subagent whose only job is to refute it, defaulting to refuted when uncertain. This is STRONGER than the multi-agent "voting" you were about to build, because it kills the false-positive failure mode that makes reviews get ignored. Both Anthropic's multi-agent research and Pocock warn that same-context agents rubber-stamp each other; your refute-pass is the correct answer.
- **Model-per-task already exists at the agent level.** Haiku for mechanical parity/i18n diffing; Sonnet for security/contract reasoning. You are further along on routing than you thought.
- **The spec flow is file-durable.** `/plan` persists `.claude/plans/*.plan.md`; `/implement <issue>` resolves it by path or issue number. Cross-session resume already works. You just run it in one session by habit (fixable, see Part 3.6).
- **Default-deny gates** on `/execute` and `/feature`; worktree isolation for parallel work; a backward-compat guard that encodes real product knowledge (frozen `@orbit/shared` snapshots on shipped Android builds).

### 2.2 What's WRONG (fix)

**Actively degrading you right now**

| Problem | Evidence | Impact |
|---|---|---|
| **C# LSP is claimed-wired but OFF** | Root `CLAUDE.md` says "C# LSP wired via `.mcp.json`", but the live `.mcp.json` has zero `csharp-lsp`; only `mcp.json.example` does, and `settings.local.json` does not enable it | Every orbit-api session falls back to grep/glob. You lose symbol-level navigation, which silently weakens any API-side investigation |
| **`/plan` and `/implement` reference elided templates** | `plan/SKILL.md:175-178` and `implement/SKILL.md:196` say the body/report template "is unchanged from the earlier version" - but that version no longer exists in-file | Your two most-used skills have no concrete template to follow. An incomplete refactor |
| **Explore now inherits Opus** (v2.1.198, was Haiku) | Official `sub-agents` docs | Every `/audit-*`, `/plan`, `/pr-review` fan-out runs read-only exploration on Opus at xhigh. A large, invisible quota sink |

**Config drift and stale references**

- `.mcp.json` and `mcp.json.example` diverge both ways: live has `sentry`, the example has `csharp-lsp`. Neither is a faithful template of the other.
- Expo SDK 56 to 57 is stale in `prime/SKILL.md:138`, `audit-performance/SKILL.md:29`, and `MEMORY.md` (the repo is on 57 since commit `26970cf0`).
- `prime`/`plan` point at deleted integration tests (`tests/Orbit.IntegrationTests/...`, removed June 2026). `implement` correctly says unit-only, so the three skills disagree.
- `security-reviewer` frontmatter says "explicit-invocation only", but `pr-review` auto-fires it. Self-contradiction.
- `contract-aligner` and `security-reviewer` are duplicated across both repos with drifting bodies and no lockstep gate.

**Global hygiene**

- **Secret leak:** Slack `xoxc`/`xoxd` tokens are stored in cleartext in `.claude.json` (the leap/indinero project). Move to env-var references.
- **Non-Claude skills polluting `~/.claude/skills`** (resolved today, see 2.3): `do` (Codex-only, inert under Claude), `clean` (was pointing at the wrong worktree path), `frontend-design` (self-declared for other CLIs).
- **Four overlapping design skills** (resolved today): `impeccable` plus three generics.
- **Dead config:** `CLAUDE.md.pre-overhaul.bak`, empty `~/.claude/rules/`, Codex `default.rules` pinned to two long-dead branches, `settings.local.json` polluted with `gta6-shorts-factory` grants.
- **Behavioral drift across four CLIs:** Claude's 7-rule `CLAUDE.md` vs Codex's "senior engineer" `AGENTS.md` vs opencode's pre-overhaul 4-rule `AGENTS.md` vs Gemini (no behavioral file). "Single source of truth" is aspirational, not enforced.
- **Codex runs fully unsandboxed** (`approval_policy=never`, `sandbox_mode=danger-full-access`, elevated on Windows, trusts `C:\`). Deliberate given your maximum-autonomy posture, but worth an explicit acknowledgment rather than drift.

### 2.3 Skill inventory (and what was deleted today)

**Global skills (`~/.claude/skills`): went from 12 to 6.**

Deleted (approved by you this session): `do`, `frontend-design`, `design-taste-frontend`, `ui-ux-pro-max`, `to-prd`, `to-issues`.

Fixed: `clean` now targets `.claude/worktrees/` instead of the dead `.opencode/worktrees/` path (its `git worktree list` core was already path-agnostic; only the prose reference was wrong).

Kept:

| Skill | Why it stayed |
|---|---|
| `grill-me` | Load-bearing - `/execute` GATE 2 and `/feature` warm path both call it |
| `impeccable` | Canonical design skill, referenced by Orbit's root `CLAUDE.md` |
| `tdd` | Distinct, Pocock daily driver |
| `improve-codebase-architecture` | Distinct architecture/refactor tool |
| `ship` | Quick commit+PR in any repo (Orbit uses `/implement` instead) |
| `clean` | You use it, now fixed |

**Orbit skills (`orbit-ui-mobile/.claude/skills`): 23, nothing deleted.**

Every Orbit skill is either load-bearing in a chain or a distinct standalone tool. No redundancy, no dead skills. Cross-reference graph:

- **Core PIV chain:** `execute` conducts `prime` -> `grill-me` -> `plan` -> `implement`. `plan` and `create-prd` conditionally call `deep-research`. `pr-review` delegates to `validate`.
- **Feature chain:** `feature` chains `create-prd` (or `prd-interactive` on cold start) then `create-stories`.
- **Audit chain:** `prod-readiness` orchestrates `audit-code-quality`, `audit-security`, `audit-tests`, `audit-performance` plus an ops check. `audit-code-quality` shares `pr-review/rubric.md`. All six review/audit skills share `_shared/verification-protocol.md`.
- **Standalone tools:** `llm-council`, `handoff`, `lesson`, `thermo-nuclear-code-quality-review`, `dep-sweep`, `dev-server`, `android-generate`.

Not skills (shared reference files, do not delete): `_shared/verification-protocol.md`, `pr-review/rubric.md`, `audit-tests/rubric.md`, `audit-security/checklist.md`.

---

## 3. Part 2 - External research findings

### 3.1 The company PDF (the "Agentic Pipeline Presentation")

A 21-page deck standardizing on Claude Code. Its thesis:

- Code is no longer the primary focus; it becomes an artifact of a well-crafted agentic pipeline.
- Maturity ladder: (1) auto-complete, (2) "dialog of development" (works but wasteful), (3) spec-driven development, (4) agentic pipeline (human-in-the-loop, human-gated), (5) self-improving headless loop = an explicitly-stated Anthropic anti-pattern. **Target is 3-4; avoid 5.**
- "The harness matters as much as the model." A mid-tier model with a properly engineered harness can outperform a frontier model with no harness.
- Primary harness components: CLAUDE.md, Skills, Subagents, Hooks, Rules, MCP, Plugins.
- CLAUDE.md best practices: one file per logical layer, loaded from current dir up, start sessions from the lowest level, keep under ~200 lines, apply "would removing this cause Claude to make mistakes? If not, cut it."
- The core dev pipeline: Create Spec -> Implement -> Refine -> Verify -> PR, with a fresh session per phase, human gate at every step, spec living in the repo as the source of truth.

Its nine cited references all resolve to official Anthropic sources (docs + blog), which the research agents fetched directly.

### 3.2 Anthropic official docs (harness mechanics, version-current to Claude Code v2.1.x)

**CLAUDE.md.** Loaded every session; files concatenate root-down (closest to cwd read last). Subdir files load on demand when Claude reads a file there. The 200-line target is an adherence guide (CLAUDE.md loads in full at any length; only auto-memory `MEMORY.md` is truncated at 25KB). Delivered as a user message after the system prompt, so it is advisory, not guaranteed. `@path` imports load in full (do not reduce context), max four hops. For true stickiness use `--append-system-prompt`.

**Subagents.** Markdown + YAML frontmatter. Fields include `name, description, tools, model, effort, permissionMode, skills, background, isolation, hooks`. `model` accepts `sonnet | opus | haiku | fable | <full-id> | inherit` (default `inherit`). `effort` overrides session effort while the subagent runs. Model resolution order: `CLAUDE_CODE_SUBAGENT_MODEL` env -> per-invocation param -> frontmatter -> main conversation model. Automatic delegation is driven by the `description` field (add "use proactively"). Isolated context: subagents do not see conversation history or already-read files. Built-in `Explore` now inherits the main model (capped at Opus) as of v2.1.198, so exploration is expensive unless you define your own `Explore` with `model: haiku`.

**Skills.** A folder with `SKILL.md` plus optional reference files/scripts (progressive disclosure). The `description` field is a description of WHEN to trigger, not a summary. Auto-trigger control via `disable-model-invocation: true` (you invoke; description not in context) and `user-invocable: false` (Claude invokes only). Once invoked, the body stays in the conversation for the rest of the session (a recurring token cost). Skills compose: `context: fork` turns a skill body into a subagent task; a subagent's `skills:` field preloads full skill content.

**Hooks.** 31 lifecycle events across per-session, per-turn, per-tool, and async cadences. Handler types: `command`, `http`, `mcp_tool`, `prompt` (single-turn yes/no via a model), `agent` (spawn a verification subagent). Enforcement is deterministic: exit 2 + stderr = a blocking error fed back to Claude. "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."

**Rules (`.claude/rules/`).** A first-class shipped feature. Markdown files with optional `paths:` frontmatter (globs). Without `paths:`, a rule loads at launch with CLAUDE.md priority and is re-injected on compaction. With `paths:`, it loads only when a matching file enters context. This is the missing middle tier between always-on CLAUDE.md and a hard-block hook. Rules are still guidance, not enforcement (for guaranteed behavior use hooks/permissions). Official guidance: when CLAUDE.md approaches 200 lines, split into rules.

**Model config.** Aliases: `default, best, fable, sonnet, opus, haiku, sonnet[1m], opus[1m], opusplan`. `opusplan` is the one built-in auto-router: Opus in plan mode, auto-switches to Sonnet in execution. Effort levels: `low, medium, high (default), xhigh, max`. `ultrathink` keyword = deeper reasoning that turn only (does not change session effort). `ultracode` = a Claude Code setting that sends `xhigh` plus standing permission to launch dynamic-workflow orchestration (session-only). There is an `advisor` tool (Claude decides mid-task when to consult a second model). Fallback chains switch only on overload/errors, not by difficulty. There is NO native complexity-based auto-router.

**Workflows (dynamic).** A JS script Claude writes that orchestrates subagents at scale (up to 16 concurrent, 1000/run). Each stage can be routed to a different model/effort ("Ask Claude to use a smaller model for stages that don't need the strongest one"). Triggered by `ultracode`, the bundled `/deep-research`, or saved workflows in `.claude/workflows/`.

**Background agents.** Subagents run in the background by default (v2.1.198); Claude foregrounds when it needs the result. `claude agents` (agent view) manages many independent background sessions via a supervisor that survives terminal close. `/fork` spawns a background subagent that inherits full conversation and shares the prompt cache (cheaper than a fresh subagent). Agent teams (`SendMessage`) let a lead supervise peers with a shared task list.

### 3.3 Anthropic official blogs (steering + how they use skills)

The steering post names SEVEN mechanisms, each trading context cost against authority: **CLAUDE.md, rules, skills, subagents, hooks, output styles, and appending the system prompt.** Governing principle: "Each method trades context cost against authority - choosing the right one is most of the work."

Steering decision guidance:

| Mechanism | Best for | Authority |
|---|---|---|
| CLAUDE.md (root) | Build commands, layout, team facts | Advisory |
| Rules (`.claude/rules/`) | Specific/file-scoped constraints | Advisory but targeted |
| Skills | Procedural workflows | Procedure |
| Subagents | Isolated side tasks | Delegated |
| Hooks | Deterministic automation + hard blocks | Enforcing |
| Output styles | Changing Claude's response style | (careful: replaces built-ins) |
| System-prompt append | True system-level stickiness | Strong |

Proactive standards (the direct answer to "always use X, document in Y"): "must never happen" -> hooks + permissions, not instructions. File-specific rule -> path-scoped rule. "Always run this procedure" -> a skill with a trigger-oriented description. Project facts -> lean CLAUDE.md. This matches your own memory note "guardrails over prose", which Anthropic has now made official.

How Anthropic uses skills internally: skills are folders with progressive disclosure; the description is a trigger, not a summary; "the highest-signal content in any skill is the Gotchas section"; skills reference each other by name; the canonical compose pattern is a skill that spawns a fresh-eyes subagent to critique (their `adversarial-review` skill). They instrument skill usage with a `PreToolUse` hook to find under-triggering skills and prune.

Stated anti-patterns: overstuffed CLAUDE.md (put reusable expertise in skills); skipping LSP; premature MCP; running full test suites on single-file changes; and stale harness ("skills and hooks built to compensate for specific model limitations become overhead once those limitations no longer exist" -> review every 3-6 months or after a major model release). Note: none of the three posts explicitly prohibits unattended self-improving loops; Blog 1 endorses a bounded version (stop hooks that PROPOSE updates, human-in-the-loop).

### 3.4 Matt Pocock's opinions (as of 2026)

Notable context: your global skills dir (`grill-me`, `tdd`, `improve-codebase-architecture`, `handoff`, `ship`, and previously `to-prd`/`to-issues`) IS essentially his `mattpocock/skills` pack. You have already adopted his system.

His load-bearing beliefs, in priority order:

1. **The "smart zone" (~100K tokens) is the master constraint.** Every model degrades noticeably past ~100K tokens regardless of the advertised 200K/1M window. Design the whole workflow to keep every task inside that zone. His most-repeated, most-original claim (verbatim on Opus 4.6's 1M window: "the drop-off in quality is really noticeable. Dumber decisions, worse code, worse instruction-following").
2. **Alignment before code, always.** Make the agent grill you (`/grill-me`) until you share one mental model. Skipping this and jumping to spec-then-code is "vibe coding by another name."
3. **`/clear` over `/compact`.** Externalize plan state to files on disk so resetting context is cheap and deterministic; avoid lossy compaction "sediment." His `/handoff` skill is the explicit primitive.
4. **Sonnet implements, Opus reviews, review in a fresh context.** "If the reviewer sees the implementation in the same session, it operates in the dumb zone while the implementer operated in the smart zone."
5. **Feedback loops are the ceiling on quality.** TDD (red-green-refactor) matters MORE with AI, not less, because agents are optimizers: a failing test makes them provably solve the specified problem.
6. **Skills > frameworks > MCP.** Small, composable, portable skills that YOU trigger. Explicitly anti-Spec-Kit/BMAD/GSD ("they take away your control"). Skills beat MCP long-term on context efficiency (skills load on match; MCP definitions cost context every session).
7. **Parallelize with sandboxed subagents.** His `sandcastle` lib (git worktree + Docker per issue, Sonnet implements/Opus reviews/third agent merges), gated on issues structured as a DAG with explicit blocking edges.

His clearest divergence relevant to you: **he rejects forced multi-agent consensus.** His `/code-review` runs two subagents on separate axes (Standards, Spec) and keeps BOTH verdicts rather than voting them into one, so a pass on one axis cannot mask a fail on the other. This is a direct nuance against the "two agents reach agreement" idea.

### 3.5 Multi-agent and cross-tool consensus

**Verdict from the evidence: for a solo dev, a single strong orchestrator + native subagents + deterministic gates dominates. Reserve cross-model consensus as an on-demand tool, never a standing gate.**

- Anthropic's own multi-agent research: multi-agent systems use about 15x more tokens than chat; "most coding tasks involve fewer truly parallelizable tasks than research"; "most domains that require all agents to share the same context ... are not a good fit for multi-agent systems today." Coding is the wrong shape for standing orchestration.
- Documented failure modes: context loss across the agent boundary (each harness "starts from zero"), rubber-stamping, doubled cost, workers duplicating each other's work.
- Cross-tool wiring that works: `codex exec "<prompt>"` (final message to stdout, `--json` for JSONL, `--output-schema` for structured extraction, `-m` for model), and `opencode run --format json --model provider/model`. Callable from Bash, or via MCP (`codex mcp-server`) for scoped permissions. Sweet spot: planner/executor with parallel, self-contained tasks. Breaks on anything needing shared context.
- Consensus tooling: `pal-mcp-server` (formerly `zen-mcp-server`) has a `consensus` tool where you pass a `models` array with per-model `for`/`against` stances and Claude synthesizes as chairman. Cap at 2 models, make one a cheap adversary (Gemini Flash or local Ollama). Cost roughly $0.10-0.50 per invocation.
- Your existing `pr-review` adversarial-skeptic pass is consensus-by-refutation and is stronger than voting. The only thing it lacks is cross-MODEL diversity (skeptics are the same model family, so their blind spots correlate).

Rough model pricing (per MTok, 2026): Opus 4.8 $5/$25; Sonnet 5 $2/$10 intro (then $3/$15); Haiku 4.5 $1/$5; Fable 5 $10/$50. Haiku output is 1/5 of Opus.

### 3.6 Spec-driven development and session splitting

**Recommendation: split plan from implement across fresh sessions, but only for medium-plus/cross-repo/risky work, and keep it to ONE seam, not four.**

- Anthropic best-practices (verbatim): "Once the spec is complete, start a fresh session to execute it. The new session has clean context focused entirely on implementation." Good specs are self-contained: name the files/interfaces, state what is out of scope, end with an end-to-end verification step. Skip planning entirely when "you could describe the diff in one sentence."
- Verify in a fresh context regardless of session count: "a fresh context improves code review since Claude won't be biased toward code it just wrote." Run review as a subagent that sees only the diff + criteria.
- State passes through durable repo files (RPI uses `RESEARCH.md`/`PLAN.md`/`PLAN-CHECKLIST.md`; Anthropic uses a self-contained `SPEC.md`), not conversation.
- Do not adopt the full Spec-Kit ceremony. Both Pocock and Martin Fowler warn it is "a sledgehammer to crack a nut" for small changes. Your slash-command chain is already a lighter, better Spec-Kit.
- The "~40% dumb zone" threshold that motivates fresh sessions is a practitioner heuristic (Horthy/Burleigh), not vendor-confirmed. Anthropic only says directionally that performance degrades as context fills.

Task-size heuristic:

| Task | Session strategy |
|---|---|
| One-sentence diff, single file | One session, skip planning |
| Multi-file, one repo, moderate risk | Plan then same-session implement; `/clear` only if context bloats |
| Cross-repo (TS + .NET) or high-risk (auth/billing/migrations/contracts) | Split: plan -> persist plan file -> `/clear` -> fresh prime + implement -> verify in fresh subagent |

Your harness already supports this (plan persists to a file, implement resolves by issue number). The change is behavioral: add a `/clear` at the plan-to-implement seam for big work.

---

## 4. Part 3 - The target design (answers to every question you asked)

### 4.1 Model and effort routing (the autonomy engine)

The honest read on "Opus 4.8 @ xhigh for everything": Anthropic explicitly recommends `xhigh` for coding/agentic work on Opus 4.8, so your DRIVER is not wrong for hard coding. The waste is everywhere else: Explore/subagents inheriting Opus, whole audit fan-outs on Opus, and xhigh on trivial edits and plain chat. On Max this is quota burn, and (per Pocock) routing each subagent down also keeps it in the sharper "smart zone."

There is no native complexity auto-router. Do not build a fragile prompt-classifier hook. Use the four real mechanisms:

| Mechanism | What it does | Move |
|---|---|---|
| `opusplan` | Opus plans, auto-switches to Sonnet for execution | This IS Pocock's "Opus plans, Sonnet implements", native. Try it as your default model |
| Per-subagent `model:` + `effort:` frontmatter | Pin cost per agent | Add `model: haiku, effort: low` to a project-level `Explore`. Add `effort:` to existing agents: parity/i18n `low`, reviewers `medium` |
| Dynamic workflows / `ultracode` | A JS script routes each stage to a different model | Convert `/audit-*`, `/prod-readiness`, `thermo-nuclear` to Haiku fan-out + Opus synthesis. Biggest single quota win |
| `ultrathink` (per-turn) + `/effort` | Deeper reasoning one turn only | Stop sitting at the ceiling: default `high` for non-coding, `ultrathink` on a hard prompt, `xhigh` for a hard stretch, `max` only for frontier problems |

Fable is 2x Opus. Reserve it for the one job it fits: ambiguous, multi-sitting root-cause work (a good fit for `/investigate`).

### 4.2 Orchestration ("one main agent auto-summons specialists")

You already have this, and it is correctly scoped. Anthropic's model is that skills own their own orchestration (the `description` is a trigger; "use proactively" encourages auto-delegation), and a global always-on router is an anti-pattern (it burns context classifying every turn). Your `WORKFLOW.md` path-picker (human routes: tiny bug -> edit+validate; slice -> `/execute`; multi-story -> `/feature`) is the right top layer.

Native primitives you are not yet using: `/fork` (background subagent that inherits full context, shares prompt cache), agent teams (`SendMessage`), and background agents (`claude agents`). These give you an AFK fleet without any custom framework. Pocock's `sandcastle` pattern is what your multi-issue worktree mode already approximates, so you do not need his library.

### 4.3 Multi-agent consensus and cross-tool (Claude calling Codex/opencode)

Keep it as an on-demand tool, never a standing gate. Do not wire a standing two-agent review: your adversarial-skeptic refute-pass already is consensus-done-right and is cheaper. Pocock deliberately keeps two axis-verdicts separate rather than voting.

The only missing thing is cross-model diversity (your skeptics share a model family). If you want it, add it on-demand for Critical findings only, three cheap ways:

1. The native `advisor` tool (verify the exact invocation locally; lowest friction).
2. `codex exec "<prompt>"` from Bash (you already have Codex configured), wrapped in a thin `/second-opinion` skill (~20 lines).
3. `pal-mcp-server` `consensus` with 2 models and opposing stances, one a cheap adversary.

Cross-tool "Claude drives Codex/opencode" works for parallel self-contained execution and breaks on shared-context tasks. Not worth standing infrastructure for a solo dev.

### 4.4 Proactive standards (the AWS-CLI / Confluence-MCP answer)

Highest-value new pattern for you, and it solves "I don't want to tell it every time." Encode each standard at its correct authority tier:

| Standard type | Mechanism | Example |
|---|---|---|
| "Always prefer the AWS CLI" (procedural default) | Unscoped rule in `~/.claude/rules/tooling.md` (loads every session, re-injected on compaction) | Write it once, never repeat it |
| "Use the Confluence MCP for docs" | Unscoped rule OR the MCP server's own `instructions` field | Proactive, zero per-session prompting |
| File-scoped convention (e.g. handlers validate with Zod) | Path-scoped rule (`paths: ["src/api/**"]`) | Context-cheap; loads only when relevant |
| Must-never-happen | Hook (`PreToolUse`, exit 2) or permission | You already do this |
| True system-prompt stickiness | `--append-system-prompt` | For the few that must never be ignored |

On your company machine: create `~/.claude/rules/company-tooling.md` (unscoped) with the AWS-CLI + Confluence-MCP defaults. That is the entire fix. It loads automatically and survives compaction.

### 4.5 The `/investigate` prod-debugging skill (yes, build it)

Your instinct "maybe I don't need it with a good harness" is wrong, and here is the precise reason: a harness provides TOOLS; a skill provides a REPEATABLE PROCEDURE over those tools. Anthropic's "how we use skills" post lists `<service>-debugging` and `oncall-runner` runbook skills as a core category; they have great harnesses AND these skills.

You have all the MCP building blocks wired (`sentry`, `render`, `postgres`, `vercel`, `stripe`) but no skill orchestrates a live investigation. `prod-readiness` only reads config statically; `audit-performance` only reads code. Build `/investigate` as a runbook that chains: pull the Sentry issue -> correlate with the Render deploy + logs -> query Postgres for the affected rows -> localize to code (needs the C# LSP fixed) -> propose root cause + minimal fix, gated. Seed it from the runbooks already in your memory (Sentry/Render/logcat). Consider running it on Fable.

### 4.6 Spec-driven session split (prime/plan/implement)

Yes, split at ONE seam for medium-plus/cross-repo/risky work, per 3.6. Your `/execute` stays the single-session conductor for tiny/small tasks. For big work: `/plan` (Opus/plan-mode) -> persist plan file -> `/clear` -> `/prime` + `/implement <issue>` in clean context -> verify in a fresh subagent (`/pr-review`, already fresh). Prefer `/clear` over `/compact` since your durable state is the plan file + issue number. `/handoff` is the right primitive for longer arcs.

---

## 5. Part 4 - Prioritized action plan

**Already done this session:** deleted 6 redundant/broken global skills; fixed `clean` for Claude.

**P0 - Fix what's silently hurting you (do first)**

1. Restore the elided `/plan` body + `/implement` report templates (broken skills).
2. Wire `csharp-lsp` into the live `.mcp.json` and enable it, OR delete the CLAUDE.md claim. Do not leave it lying.
3. Add a project-level `Explore` agent with `model: haiku, effort: low` (stops Opus-xhigh exploration on every fan-out).
4. Move the Slack tokens out of `.claude.json` into env references.

**P1 - Turn on routing (cheap, high leverage)**

5. Add `effort:` to existing subagents (parity/i18n `low`; reviewers `medium`).
6. Try `opusplan` as the model default; use `ultrathink` for hard one-off turns; drop standing xhigh on non-coding chat to `high`.
7. Convert `/audit-*` + `/prod-readiness` to workflows (Haiku fan-out + Opus synthesis).

**P2 - Add the missing capabilities**

8. `~/.claude/rules/` unscoped rule for proactive tooling standards (the AWS/Confluence answer; do this on the company machine too).
9. Build `/investigate` (Sentry -> Render -> Postgres -> code runbook).
10. Optional: `/second-opinion` skill (`codex exec` or `pal` consensus) for cross-model diversity on Critical findings only.

**P3 - Hygiene and drift (batch it)**

11. Fix SDK 56->57 and integration-test refs in `prime`/`plan`/`audit-performance`/`MEMORY.md`; fix the `security-reviewer` frontmatter contradiction; reconcile `.mcp.json` and its example.
12. Delete `CLAUDE.md.pre-overhaul.bak`, empty `rules/`, dead Codex branch rules; clean the gta6 grants from `settings.local.json`.
13. Decide the four-CLI story: either sync behavioral docs from one source, or formally accept "Claude-primary, others lag" and stop pretending parity.

---

## 6. Part 5 - Sources

All fetched live 2026-07-09.

**Anthropic docs:**
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/large-codebases
- https://code.claude.com/docs/en/claude-directory
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/agent-view
- https://platform.claude.com/docs/en/build-with-claude/effort
- https://platform.claude.com/docs/en/about-claude/pricing

**Anthropic blogs:**
- https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start
- https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
- https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills
- https://www.anthropic.com/engineering/multi-agent-research-system

**Matt Pocock:**
- https://github.com/mattpocock/skills (README, code-review, writing-great-skills, tdd)
- https://github.com/mattpocock/dictionary-of-ai-coding
- https://github.com/mattpocock/sandcastle
- https://www.aihero.dev/5-agent-skills-i-use-every-day , https://www.aihero.dev/skills-to-spec
- Talk: "Workflow for AI Coding," AI Engineer Europe, ~Apr 24 2026 (https://youtu.be/-QFHIoCo-Ko)
- X: https://x.com/mattpocockuk/status/2034572011175907474 (the ~100K "dumb zone")

**Cross-tool / consensus / spec-driven:**
- https://developers.openai.com/codex/noninteractive , https://developers.openai.com/codex/cli/reference
- https://opencode.ai/docs/cli/
- https://github.com/BeehiveInnovations/pal-mcp-server (consensus tool)
- https://github.com/github/spec-kit ; https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- https://tylerburleigh.com/blog/2026/02/22/ (RPI workflow)

---

## 7. Confidence and caveats

- **High confidence** (fetched live): everything about `opusplan`, `ultracode`/`ultrathink`, effort levels, per-subagent `model`/`effort`, `.claude/rules/` `paths:`, workflows per-stage routing, hooks, and the pricing ratios. All from official `code.claude.com` / `platform.claude.com`.
- **Verify locally before relying on:** the exact `advisor` tool invocation and the `codex mcp-server` subcommand (single-source in the research).
- **Practitioner heuristic, not vendor-confirmed:** Pocock's ~100K "smart zone" number. Treat as a rule of thumb.
- **Setup findings** are file:line-evidenced from the two local audits. The C#-LSP-off and elided-template findings are the two to double-check first, because they change behavior.
- **Blog publication dates** in the research came from a summarizer and are approximate; cite the posts as "current as of 2026."
