# Harness Upgrade — Execution Checklist

**Companion to `research.md` (repo root)**, which holds the full rationale + sources. This file is the *actionable* plan. Date: 2026-07-09.

## How to use this file

- **One stage per fresh session.** Open this file, do a single stage, check its boxes, commit, then `/clear` (or open a new session) before the next stage. Do **not** run multiple stages in one bloated session — that is the exact anti-pattern this whole effort exists to fix.
- **Keep each session under ~100k tokens.** Delegate heavy reading to subagents; externalize state to files; `/clear` between tasks.
- This file *is* the durable state. A fresh session resumes by reading it.

## Guiding principles (apply in every stage)

1. **Autonomy within a phase, human gate between phases.** Never a headless self-improving loop (company deck + Anthropic anti-pattern). Maximum autonomy *inside* a gated step.
2. **Gates over prose — encode each rule at its authority tier:** hook = deterministic enforcement · rule (`.claude/rules/`) = proactive/path-scoped guidance, re-injected on compaction · skill = a procedure · CLAUDE.md = a fact · `--append-system-prompt` / output style = disposition. Text you state once decays; a gate does not.
3. **Small sessions.** Every text mechanism loses salience as context fills; short sessions keep the whole harness sharp.
4. **Verify, don't assume** — operationalized by the proactivity guard (Stage 1).

## Done already (this session)

- [x] Deleted 8 redundant/broken global skills: `do`, `frontend-design`, `design-taste-frontend`, `ui-ux-pro-max`, `to-prd`, `to-issues`, `tdd`, `improve-codebase-architecture`. Global Claude skills now: `clean`, `grill-me`, `impeccable`, `ship`.
- [x] Fixed `clean` to target `.claude/worktrees/`.
- [x] Wrote `research.md` (repo root).
- [x] Fixed issue #243: sequencing (prod-readiness loop → burn-down last) + corrected stale `phase:7` prose (label `phase:4` is correct per the 2026-07-03 update).

## Decisions locked (do NOT re-litigate)

- **No Codex.** Removing it entirely; nothing Codex-related in the harness.
- **opencode returns later.** Keep the `.opencode` compat layer.
- **`opusplan` is OUT** — it only routes on Claude's built-in *plan mode*, which this workflow never uses (everything goes through `/feature` + `/execute` skills). Route models at the **subagent/workflow** level instead; keep Opus as the driver.
- **No standing multi-agent consensus.** The existing adversarial-skeptic refute-pass already beats voting. Cross-model diversity is **on-demand only**, via opencode + GLM 5.2 (below).
- **Keep `/execute` and `/feature`.** They are the fast path for slices. The split-session model is for campaigns/big work, not a replacement.

---

## Stage 0 — Global cleanup (one session)

- [x] **Remove Codex entirely:** deleted `~/.codex/`. Confirmed no functional Orbit reference (only a stale `.gitignore` line, since removed, + this plan/`research.md`; `agentic-dev-workflow`/`portfolio` are non-Orbit repos, out of scope).
- [x] Deleted `~/.claude/CLAUDE.md.pre-overhaul.bak`.
- [x] Cleaned the `gta6-shorts-factory` grants (Read/rm/mv) — they lived in the PROJECT `orbit-ui-mobile/.claude/settings.local.json` (no global `~/.claude/settings.local.json` exists); kept `WebSearch` + the MCP-server list.
- [x] Moved Slack `xoxc`/`xoxd` tokens out of `~/.claude.json` into `${SLACK_MCP_XOXC_TOKEN}`/`${SLACK_MCP_XOXD_TOKEN}` refs; real values set as persistent User env vars. NOTE: verify the ref still holds after next full Claude Code restart (running process rewrites `.claude.json`); env vars are already set so re-applying is trivial if it reverts. **Confirmed 2026-07-09 (Stage 2 session, post-restart): `.claude.json:880-881` still shows the `${...}` refs, not plaintext — carryover held, no re-apply needed.**

## Stage 1 — The proactivity guard (one session) — HIGHEST LEVERAGE

The generic, one-mechanism fix for "why do you violate instructions" — targets the *disposition*, not per-behavior. See `research.md` §"the guard".

- [x] **Layer 1 — re-injection hook.** Built `~/.claude/hooks/proactivity-reminder.mjs`, wired as a global `UserPromptSubmit` command hook. Emits the line below as `hookSpecificOutput.additionalContext` (verified valid JSON). Injects this line every turn (lands at highest salience, right before generation):
  > *Before you assume a fact or ask the user to do something: can you verify it or do it right now with a tool you already have (gh, files, MCP, a CLI)? If the request names a concrete thing you haven't inspected — an issue, file, PR, resource — inspect it first. If the situation matches a skill's trigger (you were corrected → /lesson; a diff needs review → /pr-review; a prod incident → /investigate), invoke the skill instead of improvising. Default to the cheap, correct action over the guess, the question, or the hand-rolled version.*
- [x] **Layer 2 — generic class-gate.** Built `~/.claude/hooks/proactivity-guard.mjs`, wired as a global `Stop` command hook. Implementation choice: a **command hook that calls a cheap model itself** (`claude -p --model claude-haiku-4-5-20251001`, reuses OAuth, ~5s once per turn-end) rather than the declarative `prompt`/`agent` handler — because the live docs do NOT document the `prompt`-hook block-output contract or let you pin the model, whereas the command path is fully documented (`{"decision":"block","reason":...}`), model-pinnable, skill-list-injectable, and testable in isolation. Reads the finished turn from the transcript + the live skill digest and asks:
  > *Did this turn take a shortcut when a cheaper, more-correct action was available — (a) assert about a named artifact it never inspected, (b) ask the user to do something it had the tools to do itself, (c) surface in-scope work as an optional "want me to…?" instead of doing it, or (d) improvise instead of invoking a skill whose trigger clearly matched? If yes, block with the reason.*
  Blocks via top-level `{"decision":"block","reason":...}` (NOT `exit 2` — verified: exit 2 does not block `Stop`). **Feeds the gate the live skill list** (name + description, scanned from `<cwd>/.claude/skills` + `~/.claude/skills` each run) so clause (d) can match. Pre-filter skips trivial turns (<200 chars); fires only on CLEAR matches. Guards: fail-OPEN on any error, loop-safe via `stop_hook_active` + a per-message marker, recursion-safe via `ORBIT_PROACTIVITY_GUARD`. (Clause (c) folds in the 2026-07-08 lesson; (d) fixes skill under-invocation — the same class.)
- [x] **Tested the gate in isolation** (this fresh session): synthetic shortcut turn (asserts about issue #423 with no inspection) → BLOCKED with an actionable reason (`gh issue view 423`); clean turn (Read used) → ALLOWED; recursion guard + loop guard → instant allow; per-message dedup → second run on the same message allows. Note: hooks load at session START, so the true end-to-end live block fires from the NEXT session onward.
- [x] Ran `/lesson`. Merged today's proactivity failure with the **2026-07-08** staged entry as one class; graduated both to THIS guard (durable home). **Cleared the staged entry from `.claude/pending-lessons.md`** and recorded the `project_proactivity_guard` memory pointer.
- [ ] Optional reinforcement (deterministic per-pattern hooks, e.g. auto-fetch `#\d+`): DEFERRED by design — the class-gate already covers it, and blind auto-fetch on every `#\d+` adds latency + wrong-repo noise. Explicitly NOT the strategy; revisit only if the gate proves insufficient.

## Stage 2 — P0 silent-degradation fixes (one session)

- [x] Restored the elided `/plan` body template (Patterns → Files to Change → Tasks → Validation Commands → E2E → Acceptance Criteria) and `/implement` report template — recovered from the pre-migration command files (`git show 33293c18:.claude/commands/{plan,implement}.md`), adapted to current conventions (`.claude/plans|reports/`, unit-tests-only, bare `dotnet test`) so the restore did NOT re-introduce the `.agents/` + `tests/Orbit.IntegrationTests` references that Stage 6 removes. Both "unchanged from the earlier/prior version" placeholders are gone.
- [x] Wired `csharp-lsp` FOR REAL (not the delete branch — user directed "build it, best implementation"). The old `.claude/scripts/csharp-lsp.mjs` was a non-functional stub (piped raw LSP stdio→stdout, never bridged LSP↔MCP; no LSP server was even installed). Replaced with **CWM.RoslynNavigator** (MIT · codewithmukesh, 527★ · `dotnet tool install -g CWM.RoslynNavigator`, needs .NET 10 SDK) — a Roslyn MCP server pointed at orbit-api's `Orbit.slnx` via `--solution`. Updated live `.mcp.json` + committed `mcp.json.example` + `opencode.json` (absolute `.exe` path — the Windows MCP launcher spawns without a shell, so no PATHEXT); enabled in `settings.local.json`; deleted the stub; corrected both CLAUDE.md claims (root said "set env vars", orbit-api said "OmniSharp/Roslyn" — both now accurate). Also reconciled `sentry` INTO the example (was live-only). **Verified end-to-end**: full MCP `initialize` + `tools/list` handshake against a live orbit-api load → "Solution loaded: 9 projects", "1412 documents", 15 semantic tools exposed (`find_symbol`/`find_references`/`find_implementations`/`get_type_hierarchy`/`get_diagnostics`/`find_dead_code`/`detect_antipatterns`/…). Known non-fatal warning: MSBuild version-constraint on `Orbit.Api.csproj` (tool bundles Roslyn Workspaces 5.0.0 vs orbit-api's pinned `Microsoft.CodeAnalysis` 5.6.0 — the ORBIT0001 quirk); degraded gracefully, all 9 projects loaded. The true in-session connect fires from the NEXT session (MCP servers load at session start).
- [x] Added project-level `Explore` agent (`.claude/agents/Explore.md` · `model: haiku` · `effort: low` · read-only tools `Glob/Grep/Read/Bash/WebFetch/WebSearch`) — overrides the built-in's Opus inheritance to kill the per-fan-out quota sink.

## Stage 3 — Model/effort routing (one session)

- [ ] Add `effort:` to existing subagents: `parity-checker`/`i18n-syncer` → `low`; `contract-aligner`/`security-reviewer`/`design-reviewer` → `medium`.
- [ ] Convert `/audit-*` + `/prod-readiness` fan-outs to **dynamic workflows** (Haiku fan-out + Opus synthesis) — the biggest single quota win.
- [ ] (No opusplan — see locked decisions.) Keep Opus as the session driver; use `ultrathink` per hard turn instead of standing `xhigh` on non-coding chat.

## Stage 4 — Proactive standards + second opinion + investigate (one session, may split)

- [ ] `~/.claude/rules/` — unscoped rule(s) for proactive tooling defaults (the rule-tier sibling of the Stage-1 guard). This is the mechanism for "always use tool X" without repeating it.
- [ ] **`/investigate` skill:** Sentry issue → Render deploy/logs → Postgres rows → localize to code (needs `csharp-lsp` from Stage 2) → root cause + minimal fix, gated. A runbook skill (Anthropic keeps these). Consider running it on Fable.
- [ ] **`/second-opinion` skill (deferred until opencode is back):** `opencode run --model <glm-provider>/glm-5.2 --format json "<claim + diff>"`. Wire it **inside `/pr-review`** so it auto-fires on each Critical finding that survives the skeptic; if GLM disagrees, mark `CONTESTED` and surface both verdicts (do not force a merge). Confirm the exact GLM provider slug from opencode's catalog at build time.

## Stage 5 — Workflow docs (one session)

- [ ] `WORKFLOW.md`: add the **slice-vs-campaign router** (campaign = looped / multi-session / externally-tracked, e.g. #243 → workflows + fresh sessions; slice = `/execute`) and the **plan→implement fresh-session split** rule for cross-repo/risky work (persist plan file → `/clear` → fresh `/prime` + `/implement <issue>`).
- [ ] Document when to use `/execute` vs the manual split; both stay.

## Stage 6 — Drift hygiene (one session)

- [ ] SDK 56 → 57 in `prime/SKILL.md`, `audit-performance/SKILL.md`, `MEMORY.md`.
- [ ] Remove deleted-integration-test references in `prime`/`plan`.
- [ ] Fix `security-reviewer` frontmatter (says "explicit-invocation only" but `/pr-review` auto-fires it).
- [ ] De-duplicate or lockstep-gate the `contract-aligner`/`security-reviewer` copies that exist in both repos with drifting bodies.

## Stage 7 — Generalize & port to other PCs (do LAST, after the Orbit harness is proven)

**Goal:** extract a machine-agnostic CORE you can drop onto any PC (incl. the work machine), then layer machine-specific rules on top — e.g. that PC's specific SDLC git-flow process.

- [ ] **Factor the harness into two layers:**
  - **CORE (portable):** the proactivity guard (Stage 1), the steering-tier discipline, the generic skills (`grill-me`, `handoff`, `ship`, `clean`, `impeccable`), the `rules/` scaffolding, `WORKFLOW.md` conventions, session-hygiene defaults. No Orbit specifics.
  - **OVERLAY (per-machine/per-project):** the specific hooks (`git-guardrails`, `forbid-*`), MCP servers, CLAUDE.md facts, and the company SDLC rules.
- [ ] **Package the CORE as a distributable:** either a git "harness template" repo cloned into `~/.claude` + a project `.claude`, or an Anthropic **plugin** (bundles skills + hooks + MCP + rules; the sanctioned way to share harness components across machines).

### How to encode a company SDLC git-flow (the key design — decompose by tier, do NOT bake it all into `/execute`)

| Part of the SDLC flow | Where it goes | Why |
|---|---|---|
| **Enforceable invariants** — branch name must match `feature/JIRA-####`, no commit to protected branches, ticket ref required, squash-only, no `--no-verify` | **HOOK** (`PreToolUse` on Bash git, `exit 2`) | Deterministic, portable, works no matter how you invoke. This is exactly what Orbit's `git-guardrails` hook already is — clone + adapt it. |
| **The procedure** — create branch → open PR → link Jira → request reviewers → merge strategy | **SKILL** (a company `/ship` or `/flow` skill, or an `/execute` variant) | Procedures are skills. Keeps the steps repeatable and invocable, decoupled from enforcement. |
| **Conventions / facts** — "we use Jira", ticket format, main protected, required reviewers | **CLAUDE.md** (project facts) or a **rule** if you want re-injection on compaction / path scoping | Facts that shape behavior but need no enforcement. |
| **Proactive tool defaults** — use the AWS CLI, use the Confluence MCP for docs | **Unscoped `~/.claude/rules/`** | Loads every session automatically; the "never tell it again" tier. |

**Rule of thumb:** *enforcement → hook* (portable + deterministic), *procedure → skill*, *facts/conventions → CLAUDE.md or rule*, *proactive defaults → rule*. Baking the whole flow into `/execute` couples enforcement to one entry point and breaks the moment you work outside it.

- [ ] Provide a one-command bootstrap (install CORE + prompt for the machine OVERLAY) so a new PC is set up in minutes.
