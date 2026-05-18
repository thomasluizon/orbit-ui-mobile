# .agents/ — AI-Assisted Workflow Artifacts

This directory holds the PRDs, stories, plans, and reports that drive Orbit's PIV (Plan → Implement → Validate) loop.

## Layout

| Folder | Purpose |
|--------|---------|
| `PRDs/` | Product Requirements Documents from `/create-prd` or `/prd-interactive` |
| `stories/` | Per-PRD story breakdowns from `/create-stories` (mirror of GitHub issues) |
| `plans/` | Per-issue implementation plans from `/plan` |
| `plans/completed/` | Plans archived after `/implement` finishes |
| `reports/` | Implementation reports from `/implement` |
| `reviews/` | Review outputs from `/review` and `/security-review` |

## Dual-Repo Convention

Orbit ships from two repositories that move together:

- **`thomasluizon/orbit-ui-mobile`** — Next.js web + Expo mobile + shared package
- **`thomasluizon/orbit-api`** — .NET 10 API

This repo (`orbit-ui-mobile`) is the **hub**:

- All PRDs, stories, plans, and reports live here under `.agents/`.
- All GitHub issues live here — backend-only work is still tracked in this repo's issue list.
- The Claude session launched from this repo is authorized (via `AGENTS.md`) to edit both repos.

Every story declares which repos it touches via labels:

| Label | Meaning |
|-------|---------|
| `repo:frontend` | Only `apps/web`, `apps/mobile`, or `packages/shared` |
| `repo:backend` | Only `orbit-api` |
| `repo:both` | Coordinated change across the front- and back-end |

`/implement` reads this label and creates the right branch(es) and PR(s).

## The Loop

```
/create-prd "idea"           → .agents/PRDs/{name}.prd.md
/create-stories <prd>        → .agents/stories/{name}.md  +  gh issues
/prime <issue#>              → loads context for one issue
/plan <issue#>               → .agents/plans/{name}.plan.md
/implement <plan>            → code + tests + PR(s) + issue close
/validate                    → lint + type-check + tests on both repos
/review <pr>                 → .agents/reviews/{name}-review.md
/security-review [path]      → security findings on changed files
```
