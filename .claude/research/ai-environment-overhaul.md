# AI Environment Overhaul: Plan, Runbook & Evidence

> **At a glance** - the locked plan and runbook for the 2026-07-07 AI environment overhaul.
> - Core principle: an instruction is a probabilistic bias that decays; reliability comes from architecture (where a rule lives), not phrasing.
> - Minimize what is always loaded, push every machine-checkable rule to a deterministic gate, load everything else just in time.
> - Two layers: a ~50-line global behavioral CLAUDE.md, and the Orbit-specific stack loaded on top (scoped CLAUDE.md + `.claude/rules/` + the enforcement stack).
> - Phased: wiring, budget cut, prose-to-gates, memory rebuild, then design plus the gated graduating `/lesson` loop.
> - Read the whole doc for the per-phase runbook and the cited evidence.

Source: `/deep-research` (6 parallel research agents, all live-doc verified), 2026-07-07.
Status: decisions locked; executing locally, phase by phase, no commits.

## Core principle

An instruction is a probabilistic bias that only acts while it is loaded and attended to. It is advisory, it decays as context fills (about 5.6% lower compliance per function generated, independent of file formatting), and compaction can silently evict it. Reliability comes from architecture (where a rule lives), not from phrasing. So the environment minimizes what is always loaded, pushes every machine-checkable rule to a deterministic gate, and loads everything else just in time.

## Locked decisions

- Multi-repo: `@import` siblings from the mobile root CLAUDE.md + `permissions.additionalDirectories` for edit access + absolute-path `opencode.json` instructions. Guidance stays in each repo.
- Global CLAUDE.md: full clean-slate rewrite to about 50 lines of universal behavioral guardrails only.
- Self-learning: build the gated, graduating `/lesson` loop (staging file, human approval, graduation to hook/lint). Never an auto-writer.
- Frontend: full stack. Token-adherence lint rule, a design-review subagent on frontend diffs, and a screenshot-critique verify gate for web.
- Carried from the earlier pass: git-guardrails stays mobile-only; handoff authored native; statusline wraps vibe-ads to add context percent; memory prune conservative; add-ons in (Expo-pin npm guard, orbit-api `global.json`, orbit-api git-guardrails hedge).

## Target architecture (two layers)

Layer 1, global generic (`~/.claude/`): a roughly 50-line behavioral CLAUDE.md (anti-hallucination "read before you claim", simplicity, surgical changes, verify-don't-guess, best-implementation-always); a small skill pipeline kept lean enough that `/doctor` drops no descriptions; the generic runbook; the context-percent statusline.

Layer 2, Orbit-specific (loads on top, only for Orbit): the mobile root CLAUDE.md as a roughly 30-line pointer plus the two sibling `@`-imports; scoped CLAUDE.md per workspace rewritten to 50-80 focused lines; stack invariants moved into `paths:`-scoped `.claude/rules/*.md`; the enforcement stack (ESLint + Roslyn + hooks) plus a new `no-hardcoded-color` lint rule and em-dash/brand-color hooks extended to the landing page; the design layer (inverted `<frontend_aesthetics>`, `impeccable` critique skill, design-review subagent, screenshot gate); a rebuilt memory index; the `/lesson` loop.

## Phased plan

- Phase 1, Wiring: sibling `@`-imports in the mobile root; `permissions.additionalDirectories`; opencode absolute-path instructions.
- Phase 2, Budget cut: clean-slate rewrite of the global CLAUDE.md and the orbit root; each scoped CLAUDE.md down to 50-80 lines; move stack invariants to `paths:`-scoped rules.
- Phase 3, Prose to gates: add the `no-hardcoded-color` lint rule; extend `forbid-em-dashes` and `forbid-hardcoded-brand-color` to the landing page; graduate every remaining checkable prose rule to a hook/lint/CI.
- Phase 4, Memory rebuild: delete the OBSOLETE/RESOLVED/ABORTED entries, merge overlapping `feedback_*`/`project_*`, graduate the checkable ones; keep MEMORY.md a pointer index inside the 200-line / 25 KB load window.
- Phase 5, Design + self-learning + ops: inverted `<frontend_aesthetics>` pinned to the anchor; design-review subagent; screenshot-critique gate; the `/lesson` loop; author `handoff` and `/runbook`; wrap the statusline; add the Expo-pin npm guard, the orbit-api `global.json`, and the orbit-api git-guardrails hedge.

Each phase ends with a verification checkpoint (build / lint / `/doctor`), delivered as diffs to review and commit.

## Runbook: one issue to shipped PR

```
0. /clear · gh issue view <N> · restate "done" in one paragraph
1. EXPLORE  (plan mode, Shift+Tab) -> subagent reads the area read-only, reports files + the seam
2. PLAN     -> reviewable plan (Ctrl+G to edit). GATE: do not code until approved.
              (skip 1-2 only if the diff is describable in one sentence)
              feature, not issue? decompose into vertical-slice tracer-bullet sub-issues first
3. IMPLEMENT-> couple work to a check: failing test first -> green -> lint + typecheck -> show output
              corrected more than twice on one point? STOP, /clear, rewrite the prompt
4. REVIEW   -> /pr-review (fresh-context subagent; correctness gaps only, not style)
              frontend diff? also the design-review subagent + screenshot critique
5. SHIP     -> commit + PR, Closes #<N>, CI green
6. /clear   -> next issue   (resume across sittings: claude --continue / --from-pr <PR>)
```

## Evidence appendix (load-bearing, cited)

- Instruction budget about 150-200 total, roughly 50 already spent by Claude Code's own system prompt; Anthropic target under 200 lines per CLAUDE.md; context files add over 20% inference cost without raising success. Sources: Anthropic memory + best-practices docs; arXiv:2602.11988; humanlayer.dev; paddo.dev.
- File structure does not measurably matter; compliance decays about 5.6% per generated function within a session. Source: arXiv:2605.10039.
- Em dashes are RLHF-amplified and survive system-prompt bans; moving rules from text to hooks took violations to zero across 1,300 sessions. Sources: mcgill.ca/oss; dev.to/mikeadolan.
- Multi-repo: `@import` loads siblings in full every session and survives `/compact`; `permissions.additionalDirectories` grants file access only; `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` with `--add-dir` additionally loads sibling rules/skills/agents. Sources: code.claude.com/docs/en/memory and /permissions (fetched 2026-07-07).
- Self-learning: gains for Reflexion/MemGPT are within-task under a reliable evaluator and do not transfer to cross-session rule-learning; no measured win exists for auto-append to CLAUDE.md; memory poisoning is OWASP ASI06. Build the gated, graduating loop only. Sources: arXiv:2303.11366; Anthropic memory docs; brentwpeterson field report; arXiv:2601.05504.
- Workflow is one nested skeleton (Explore, Plan, Code, Commit) wrapped by spec-to-issues-to-QA for features; skip the plan only for a one-sentence diff; `/clear` between tasks and after two failed corrections. The "40% context" rule is folklore (a closed-as-not-planned issue). Sources: Anthropic best-practices; aihero.dev 7-phases and tracer-bullets; harper.blog.
- Frontend: Anthropic ships a `<frontend_aesthetics>` prompt whose instruction is to avoid Inter and generic defaults; invert its targets to pin the Orbit anchor. Close the loop with screenshot-then-critique (now first-class in Anthropic's verification table). Move token adherence into ESLint/Stylelint. Use a design-review subagent on frontend diffs. Sources: Anthropic cookbook frontend-aesthetics; Anthropic best-practices; OneRedOak design-review; eslint-plugin-design-tokens / Stylelint.

Caveats: "AutoDream" auto-consolidation is unverified on official docs; the 40/60% context numbers are heuristics, not spec; Astro-specific agent-rule content is medium confidence.
