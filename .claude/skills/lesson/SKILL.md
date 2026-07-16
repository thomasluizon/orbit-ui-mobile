---
name: lesson
description: Capture a mistake or correction as a reviewed, graduating lesson so it never repeats. Use when I correct you, when you catch yourself repeating a mistake, or when I say "remember this / don't do that again".
argument-hint: [the lesson / what went wrong]
---

# Lesson: capture a correction without bloating context

**Input**: $ARGUMENTS (the mistake or correction; if empty, infer it from the last correction in this session)

## Why this exists

An auto-writer that appends "lessons" straight into loaded memory degrades over time (instruction-budget dilution, contradictory rules, no measured win anywhere). The reliable pattern is a GATED, GRADUATING loop: capture to a staging file, I approve, and anything machine-checkable graduates OUT of prose into a hook/lint rule.

This is measured, not a hunch: adherence falls monotonically with instruction count (100%@10 → 68.9%@500), and **prohibitions decay worse than requirements** (73%→20%) — so a "never do X" memory is the weakest possible form of a rule. Anthropic's own docs: *"If Claude keeps doing something despite a rule against it, the file is probably too long and the rule is getting lost... delete it or convert it to a hook."* Full rationale + citations: the `Encode checkable rules as guardrails not memory rules` ADR in the brain vault (`2 Areas/20-29 Orbit Engineering/Decisions/`).

## Trigger

Only capture on a genuine signal: I explicitly corrected you, OR the same mistake has recurred (3+ times). Do NOT capture on every turn.

## Steps

1. **Name the lesson** in one line: what went wrong and the correct behavior, plus the trigger context (which files/task it applies to).
2. **Classify it:**
   - **Machine-checkable** (a banned API/token/literal, a required command, a format) → it should become a HOOK or LINT rule, not a memory note. Draft the rule.
   - **Judgment** (an approach, a preference, a gotcha) → it becomes a concise, path-scoped rule or a memory pointer-fact.
3. **Append a candidate to the staging file** `.claude/pending-lessons.md` (create if missing) — NEVER write directly into CLAUDE.md, MEMORY.md, or a loaded rule. Format:
   ```
   ## <date> — <one-line lesson>
   - Trigger: <files/task where it applies>
   - Type: checkable | judgment
   - Proposed home: <hook name / lint rule / path-scoped rule / memory pointer>
   - Draft: <the rule text, or the hook/lint sketch>
   ```
4. **Tell me it is staged** and ask whether to promote it now. Do not promote unattended.

## On promotion (only after I approve)

- **Checkable** → implement the hook (`.claude/hooks/*.mjs`, wired in `settings.json`) or the ESLint/Roslyn rule, verify it with a piped-JSON test, and delete the staging entry. The lesson now lives as a gate, costing zero instruction budget.
- **Judgment** → add a concise entry to the right scoped `.claude/rules/<topic>.md` (with `paths:` if file-specific) or a MEMORY.md pointer-fact, then delete the staging entry.

## Housekeeping

Periodically (or when I ask), review `.claude/pending-lessons.md` and the memory index: merge duplicates, delete stale/contradicted entries, and graduate any checkable rule still living as prose.
