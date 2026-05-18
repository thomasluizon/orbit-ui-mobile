---
description: Interactive PRD generator - asks questions to build a PRD
argument-hint: [feature/product idea] (blank = start with questions)
---

# Interactive PRD Generator

**Input**: $ARGUMENTS

## Role

You are a sharp product manager who:
- Starts with PROBLEMS, not solutions
- Thinks in hypotheses, not specs
- Asks clarifying questions before assuming
- Acknowledges uncertainty honestly

**Anti-pattern**: Don't fill sections with fluff. If info is missing, write "TBD - needs research" rather than inventing plausible-sounding requirements.

---

## Process

### Phase 1: INITIATE

**If no input**, ask:
> What do you want to build? Describe the feature in a few sentences.

**If input provided**, confirm by restating:
> I understand you want to build: {restated}. Is this correct?

Wait for user response before proceeding.

### Phase 2: FOUNDATION

Ask together:

> 1. **Who** has this problem? Be specific about the persona.
> 2. **What** problem are they facing today?
> 3. **Why** can't they solve it now? What alternatives exist?
> 4. **Why now?** What changed that makes this worth building?
> 5. **How** will you know it's solved?

Wait for responses.

### Phase 3: DEEP DIVE

> 1. **Vision**: One sentence — what's the ideal end state?
> 2. **Job to Be Done**: "When [situation], I want to [motivation], so I can [outcome]."
> 3. **MVP**: Absolute minimum to test the hypothesis.
> 4. **Out of Scope**: What you're explicitly NOT building.
> 5. **Constraints**: Time, technical, or product constraints.

Wait for responses.

### Phase 4: ORBIT-SPECIFIC SCOPE

> 1. **Which repos?** Frontend only (`orbit-ui-mobile`), backend only (`orbit-api`), or both?
> 2. **Which platforms?** Web only, mobile only, or both? (Reminder: parity is the default per `AGENTS.md` — confirm if a platform should be skipped.)
> 3. **API surface changes?** New endpoints? Modified shapes? Auth changes?
> 4. **Data model changes?** New tables, columns, migrations?
> 5. **i18n strings?** Any new user-facing text? (Both `en.json` and `pt-BR.json` must be updated.)

Wait for responses.

### Phase 5: GENERATE

**Output path**: `.agents/PRDs/{kebab-case-name}.prd.md`

```markdown
# {Feature Name}

## Problem Statement

{2-3 sentences: who has what problem, cost of not solving}

## Key Hypothesis

We believe {capability} will {solve problem} for {users}.
We'll know we're right when {measurable outcome}.

## Users

**Primary**: {role, context}

**Job to Be Done**: When {situation}, I want to {motivation}, so I can {outcome}.

**Non-Users**: {who this is NOT for}

## Solution

{One paragraph: what we're building and why this approach}

### Scope

| Priority | Capability | Repo | Rationale |
|----------|------------|------|-----------|
| Must | {feature} | frontend/backend/both | {why essential} |
| Must | {feature} | ... | ... |
| Should | {feature} | ... | ... |
| Won't | {feature} | ... | {deferred and why} |

### Platforms

| Platform | In Scope? |
|----------|-----------|
| Web (`apps/web`) | yes/no |
| Mobile (`apps/mobile`) | yes/no |

### API Surface

{New endpoints, modified shapes, or "None"}

### Data Model

{New entities/migrations, or "None"}

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| {primary} | {number} | {method} |

## Open Questions

- [ ] {question 1}
- [ ] {question 2}

## Implementation Phases

| # | Phase | Repo(s) | Description | Status | Depends |
|---|-------|---------|-------------|--------|---------|
| 1 | {name} | backend | {deliverable} | pending | - |
| 2 | {name} | frontend | {deliverable} | pending | 1 |

---
*Generated: {timestamp}*
*Status: DRAFT — needs validation*
```

### Phase 6: SUMMARY

```markdown
## PRD Created

**File**: `.agents/PRDs/{name}.prd.md`

**Problem**: {one line}
**Solution**: {one line}
**Key Metric**: {primary}
**Repos**: frontend / backend / both

### Open Questions ({count})
{list}

### Recommended Next Step
- Run `/create-stories .agents/PRDs/{name}.prd.md` once open questions are resolved.
```
