---
description: Create a comprehensive Product Requirements Document from conversation context
argument-hint: [output-filename]
---

# Create PRD: Generate Product Requirements Document

## Overview

Generate a comprehensive Product Requirements Document (PRD) for Orbit based on the current conversation context. Use the structure below.

**Output file name**: $ARGUMENTS (default: `PRD.md`)
**Output directory**: `.agents/PRDs/`

## Orbit-Specific Notes

Orbit ships from two repositories that move together. Every PRD section that touches behavior must declare scope across:

- **Frontend** (`apps/web`, `apps/mobile`, `packages/shared`) in `thomasluizon/orbit-ui-mobile`
- **Backend** (`.NET 10` API) in `thomasluizon/orbit-api`

Cross-platform parity (`apps/web` ↔ `apps/mobile`) is mandatory per `AGENTS.md`. Call out any web-or-mobile-only intent explicitly.

---

## PRD Structure

### Required Sections

**1. Executive Summary**
- Product/feature overview (2-3 paragraphs)
- Core value proposition
- MVP goal statement

**2. Mission**
- Mission statement
- Core principles (3-5)

**3. Target Users**
- Primary personas
- Technical comfort level
- Key needs and pain points

**4. Scope**
- **In Scope** (checkboxes), grouped: Frontend, Backend, Shared
- **Out of Scope** (checkboxes) with rationale
- **Repo Touch Matrix**:

  | Capability | Frontend | Backend | Shared |
  |------------|----------|---------|--------|
  | ... | yes/no | yes/no | yes/no |

**5. User Stories**
- 5-8 stories in format: "As a [user], I want to [action], so that [benefit]"
- Concrete examples for each
- Tag each story with `frontend`, `backend`, or `both`

**6. Architecture & Patterns**
- High-level approach
- Frontend: which apps, Server Action vs hook, Zustand slice, query keys
- Backend: CQRS commands/queries, validators, controller, migrations needed
- Shared: new Zod types, endpoint constants, query keys

**7. API Contract** (if backend changes)
- Endpoint path (must be added to `packages/shared/src/api/endpoints.ts`)
- Request/response shape (Zod schema in `packages/shared/src/types/`)
- Auth requirements
- Example payloads

**8. UI/UX** (if frontend changes)
- Web flow (Next.js App Router routes)
- Mobile flow (Expo Router routes)
- i18n keys to add (en.json + pt-BR.json)
- Theme/color-scheme considerations

**9. Data Model**
- New domain entities (factory methods on backend)
- DB migration sketch
- TanStack Query keys to add to `packages/shared/src/query/keys.ts`

**10. Security & Configuration**
- Auth approach (JWT bearer, httpOnly cookie via BFF)
- Env vars needed (Render dashboard)
- Validation requirements (FluentValidation backend + Zod shared)

**11. Success Criteria**
- MVP success definition
- Functional requirements (checkboxes)
- Quality indicators (test coverage, perf budgets)

**12. Implementation Phases**
- 3-4 phases. Each: Goal, Deliverables (checkboxes), Validation criteria
- Phases should typically run backend-first, then frontend, OR a thin vertical slice across both

**13. Risks & Mitigations**
- 3-5 risks with mitigations

**14. Open Questions**
- Anything that needs answering before `/create-stories`

---

## Process

### Phase 1: EXTRACT

Review conversation history. Identify explicit requirements, implicit needs, constraints, and success criteria.

**If critical information is missing**, ask clarifying questions before generating. Wait for user response.

### Phase 2: SYNTHESIZE

Organize into sections. Fill reasonable assumptions where details are missing. Maintain consistency.

### Phase 3: GENERATE

Write the PRD. Use markdown. Concrete examples over abstractions. Include code snippets for technical sections.

### Phase 4: VALIDATE

- All required sections present
- Every story is tagged `frontend` / `backend` / `both`
- Repo Touch Matrix is filled
- Implementation phases are actionable

### Phase 5: OUTPUT

```markdown
## PRD Created

**File**: `.agents/PRDs/{name}`

**Product**: {name}
**Problem**: {one line}
**Solution**: {one line}

### Summary
- {N} user stories
- {N} in-scope capabilities
- {N} phases
- Repos touched: frontend / backend / both

### Assumptions Made
{list or "None"}

### Recommended Next Steps
1. Review with stakeholders
2. Resolve open questions
3. Run `/create-stories .agents/PRDs/{name}` to break into issues
```

---

## Style

- Professional, action-oriented
- Markdown extensively (headings, lists, tables, code blocks, checkboxes)
- Specific over abstract
- Comprehensive but scannable
- Always call out cross-platform parity expectations
