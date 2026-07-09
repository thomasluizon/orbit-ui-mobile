---
name: create-stories
description: Break a PRD into GitHub issues across orbit-ui-mobile + orbit-api
argument-hint: <path-to-prd> [--milestone "MVP"] [--no-create]
---

# Create Stories from PRD (GitHub Issues)

Break a Product Requirements Document into independently shippable stories. Mirror them to `.claude/stories/` and create GitHub issues in `thomasluizon/orbit-ui-mobile` (the single backlog hub).

**Input**: $ARGUMENTS

---

## Conventions

### Single Backlog

All Orbit issues live in `thomasluizon/orbit-ui-mobile`. Backend-only work is still tracked there. The `repo:*` label tells `/implement` which repo(s) to touch.

### Required Labels

Every issue gets exactly one repo label and one type label.

| Label | Meaning |
|-------|---------|
| `repo:frontend` | Touches only `apps/web`, `apps/mobile`, or `packages/shared` |
| `repo:backend` | Touches only `orbit-api` |
| `repo:both` | Coordinated change across front- and back-end |
| `type:feature` | New functionality |
| `type:enhancement` | Improvement to existing functionality |
| `type:bug` | Bug fix |
| `type:tech` | Infrastructure, refactor, tooling |
| `type:spike` | Research / investigation |

Optional labels: `area:auth`, `area:habits`, `area:notifications`, `priority:high|medium|low`, `parity-required` (any frontend story that must update both web + mobile).

---

## Phase 1: LOAD

Read the PRD from `$ARGUMENTS`. If no path, look for:
1. `.claude/PRDs/*.prd.md`
2. `PRD.md` at project root
3. Ask the user which PRD to use

Extract:
- User stories from the PRD
- Implementation phases
- Repo Touch Matrix
- API contract / data model sections

Parse optional flags:
- `--milestone <name>` — assign all issues to this milestone (created if missing)
- `--no-create` — write `.claude/stories/` only, skip `gh issue create`

---

## Phase 2: ANALYZE

For each PRD requirement, create a story with:

1. **User story** in format: `As a [user type], I want to [action], so that [benefit]`
2. **Acceptance criteria** (3-5 per story) in `Given/When/Then` form
3. **Complexity**: Small (1 file, clear) / Medium (multi-file, design choices) / Large (cross-cutting)
4. **Repo scope**: `frontend` / `backend` / `both`
5. **Dependencies** between stories

**Story sizing**: If a story would take more than 1-2 days, split it. A backend endpoint + its frontend consumer can be one `repo:both` story if small, or split into a `repo:backend` story that blocks a `repo:frontend` story.

---

## Phase 3: STRUCTURE

For each story, write this markdown block (used both for the local file and the GitHub issue body):

```markdown
## {Story Title}

**Type**: feature | enhancement | bug | tech | spike
**Repos**: frontend | backend | both
**Priority**: high | medium | low
**Complexity**: small | medium | large
**Phase**: (from PRD)
**Parity required**: yes | no (mark yes if frontend story must update both web and mobile)

### User Story

As a {user type}, I want to {action}, so that {benefit}.

### Acceptance Criteria

- [ ] Given {context}, when {action}, then {result}
- [ ] Given {context}, when {action}, then {result}
- [ ] Given {context}, when {action}, then {result}

### Technical Notes

- Files likely to change: {paths}
- Patterns to follow: {reference CLAUDE.md sections, e.g. "Add a new API endpoint"}
- Validation: lint, type-check, unit tests (both repos are unit-tests-only)
- For `repo:both`: backend changes first, then shared types, then frontend
- For `parity-required: yes`: update both `apps/web` and `apps/mobile`

### Dependencies

- Blocked by: #{issue} (or "none")
- Blocks: #{issue} (or "none")
```

### Ordering

Order stories by:
1. PRD phase
2. Dependencies (blockers first)
3. Priority within phase

---

## Phase 4: VALIDATE

Before writing or creating issues:
- [ ] Every PRD requirement maps to at least one story
- [ ] Every story has a `Repos` value
- [ ] No story is too large (split if > 1-2 days)
- [ ] Acceptance criteria are testable and specific
- [ ] Dependencies form a valid DAG
- [ ] Stories cover the full slice when needed: domain → application → API → shared types → web → mobile → tests

---

## Phase 5: WRITE LOCAL STORIES FILE

```bash
mkdir -p .claude/stories
```

Save to `.claude/stories/{prd-name}.md` with:
- A summary table of all stories (number, title, repos, complexity, depends-on)
- Each story's full markdown block from Phase 3

---

## Phase 6: CREATE GITHUB ISSUES

**Skip this phase if `--no-create` was passed.**

### 6.1 Confirm with the user

Show the summary table and ask:

> About to create {N} issues in `thomasluizon/orbit-ui-mobile`. Confirm?

Wait for confirmation.

### 6.2 Ensure required labels exist

```bash
gh label list --repo thomasluizon/orbit-ui-mobile
```

For any missing label among `repo:frontend`, `repo:backend`, `repo:both`, `type:feature`, `type:enhancement`, `type:bug`, `type:tech`, `type:spike`, `parity-required`, `priority:high`, `priority:medium`, `priority:low`, create it:

```bash
gh label create "repo:both" --repo thomasluizon/orbit-ui-mobile --color "5319e7" --description "Touches both frontend and backend"
```

Suggested colors: `repo:*` = purple, `type:feature` = green, `type:bug` = red, `type:enhancement` = blue, `type:tech` = grey, `type:spike` = yellow, `parity-required` = orange, `priority:high` = red, `priority:medium` = yellow, `priority:low` = grey.

### 6.3 Ensure milestone exists (if `--milestone` passed)

```bash
gh api repos/thomasluizon/orbit-ui-mobile/milestones --jq ".[] | .title"
```

Create if missing:

```bash
gh api repos/thomasluizon/orbit-ui-mobile/milestones -f title="{name}" -f state="open"
```

### 6.4 Create issues in dependency order

For each story (blockers first), write the body to a temp file and run:

```bash
gh issue create \
  --repo thomasluizon/orbit-ui-mobile \
  --title "{Story Title}" \
  --body-file {tmp-path} \
  --label "repo:both,type:feature,priority:high" \
  --milestone "{milestone-name-if-any}"
```

Capture the returned issue URL/number.

### 6.5 Wire dependencies

GitHub doesn't have native blocker links, so add a "Depends on" / "Blocks" section to each issue body using the resolved issue numbers, then update:

```bash
gh issue edit {N} --repo thomasluizon/orbit-ui-mobile --body-file {tmp-path}
```

Alternatively, comment the dependency mapping on each issue:

```bash
gh issue comment {N} --repo thomasluizon/orbit-ui-mobile --body "Blocked by #{B}. Blocks #{C}."
```

---

## Phase 7: REPORT

```markdown
## Stories Created

**PRD**: `.claude/PRDs/{name}`
**Local file**: `.claude/stories/{name}.md`
**Repo**: `thomasluizon/orbit-ui-mobile`
**Milestone**: {name or "none"}

| # | Title | Repos | Type | Priority | Complexity |
|---|-------|-------|------|----------|------------|
| #N | ... | frontend/backend/both | ... | ... | ... |

**Total**: {N} issues
**Backlog URL**: https://github.com/thomasluizon/orbit-ui-mobile/issues

### Next Steps
1. Triage and re-order in the GitHub project board
2. Pick an issue and run: `/prime <issue-number>` then `/plan <issue-number>`
```

---

## Tips

- Stories must be independently mergeable. A `repo:both` story should land both PRs together (squash-merged in lockstep).
- Acceptance criteria should be verifiable without re-asking the author.
- For backend-only work, still include "no frontend changes required" in technical notes — explicit zero-scope prevents accidental work.
- For frontend work with `parity-required: yes`, the acceptance criteria must mention both `apps/web` and `apps/mobile`.
- Reference the PRD section number for each story so reviewers can trace back.
