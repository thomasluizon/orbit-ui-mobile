---
name: feature
description: Idea → PRD → stories, gated. Chains /create-prd (or /prd-interactive on a cold start) and /create-stories, with a hard confirmation gate before stories and the existing /create-stories gate before issues. Use when the user wants to turn a rough idea into well-formed GitHub issues end to end.
---

# Feature: idea → PRD → stories (gated)

Drive a rough idea through the full backlog pipeline so it becomes well-formed GitHub issues without the dev hand-running each step. This is a **thin orchestrator**: it does NOT reimplement PRD writing or story slicing. It chains the already-shipped flows by their invocation names — `grill-me`, `/create-prd` (or `/prd-interactive`), `/create-stories` — and inserts one hard confirmation gate of its own at the PRD→stories boundary. The second gate (before issues are created) is `/create-stories`'s OWN existing gate; reuse it, never duplicate it.

The pipeline ends at the report. It *suggests* the per-issue `/prime`→`/plan`→`/implement` loop but never runs it.

**Usage**: `/feature "<idea>" [--cold] [--milestone "MVP"] [--no-create]`

- `--cold` — force the full `/prd-interactive` question flow instead of `/create-prd` synthesis. Also the route when `<idea>` is empty.
- `--milestone "<name>"` — pass-through to `/create-stories` (assigns every issue to the milestone).
- `--no-create` — pass-through to `/create-stories`; writes the local stories file only and skips `gh issue create`. The dry/abort path for the issue side.

---

## Stage 0 — Input & flag parse

The args hold the idea string plus optional flags. Strip the flags; the remainder is the idea.

Routing decision (mirror the `/prime` mode-detection style — branch on a condition, then do NOT run the other path):

| Condition | Route |
|---|---|
| `--cold` present, OR idea string is empty | **Cold path** — skip Stage 1, hand straight to `/prd-interactive` (Stage 2 cold). |
| Idea string is non-empty and no `--cold` | **Warm path** — run Stage 1 grill, then `/create-prd` (Stage 2 warm). |

Hold `--milestone` and `--no-create` to forward to `/create-stories` in Stage 3.

---

## Stage 1 — Grill (clarifying questions) [warm path only]

Invoke the `grill-me` skill (`C:/Users/thoma/.claude/skills/grill-me/SKILL.md`) — it owns all grilling mechanics (batching, recommended answers, and researching the codebase instead of asking); do not restate or override them. Grill the load-bearing PRODUCT branches, and do not write any artifact during this stage. (The resolved decisions are captured durably by Stage 2's `/create-prd`, which synthesizes them into the PRD file — so no separate paper trail is needed here.)

Stop when these are pinned: **scope** (what's in / what's out), **platforms** (web / mobile / both), **API & data surface** (endpoints, shapes, migrations, or "none"), and **out-of-scope**. This warms the conversation so the PRD step has real material to synthesize from — it is not busywork.

**No double-grill on the cold path.** When routing cold, this stage is subsumed by `/prd-interactive`'s own Phase 1–4 questions. Skip Stage 1 entirely and hand straight to it.

---

## Stage 2 — PRD

Derive a kebab-case name from the idea (e.g. "pin a habit to the top of Today" → `pin-habit-today`).

- **Warm path (default)** — run **`/create-prd <kebab-name>.prd.md`**. Its argument IS the output filename; it synthesizes from the now-warm conversation and writes `.claude/PRDs/<kebab-name>.prd.md`, then emits its Phase 5 OUTPUT digest (Product / Problem / Solution / story count / repos).
- **Cold path (`--cold` or empty idea)** — run **`/prd-interactive "<idea>"`**. It asks its own Phase 1–4 question set, then writes `.claude/PRDs/<kebab-case-name>.prd.md` and emits its Phase 6 SUMMARY. It derives its own filename, so **read the path back from the SUMMARY** before Stage 3 rather than assuming it.

Do not reimplement PRD content. The chained flow owns the template and the file write; `/feature` only routes and passes the filename.

---

## GATE 1 — Confirm PRD (HARD)

After the PRD file exists, surface its path and a short digest reusing what the chained flow already emitted (problem line, solution line, story count, repos touched, open-questions count). Then **STOP and wait** for an explicit reply:

> PRD written to `.claude/PRDs/<name>.prd.md`. Proceed to break it into stories? Reply:
> `yes` to continue · `edit <notes>` to revise the PRD · `abort` to stop here.

Branches:

- **`yes`** → proceed to Stage 3.
- **`edit <notes>`** → loop back into the SAME PRD flow with the notes to revise the file in place (same path, no new file), then re-hit GATE 1.
- **`abort`** → stop. Report the PRD path so the dev can resume manually later. Create no stories, no issues.

Nothing downstream runs until `yes`. This gate is what prevents stories/issues from being generated off an unconfirmed PRD.

---

## Stage 3 — Stories

Run **`/create-stories .claude/PRDs/<name>.prd.md`**, forwarding `--milestone "<name>"` and/or `--no-create` if they were passed. It writes `.claude/stories/<name>.md` (its Phase 5) and then proceeds to its own Phase 6.

Do not reimplement story slicing, the labels, or the issue-body template — they live in `/create-stories`.

---

## GATE 2 — Confirm before issues are created (HARD, reused)

Do **not** add a second bespoke prompt. `/create-stories` Phase 6.1 already halts with:

> About to create {N} issues in `thomasluizon/orbit-ui-mobile`. Confirm?

Let that gate fire and let the dev answer it. `/feature` must NOT auto-answer it, pre-confirm it, or suppress it.

- If `--no-create` was passed, `/create-stories` skips Phase 6 entirely (local stories file only) — report that no issues were created and how to create them later.
- The abort path here is the dev declining the Phase 6.1 prompt; `/create-stories` then stops and `/feature` reports the local stories file path.

---

## Report

Final compact summary:

- **PRD**: `.claude/PRDs/<name>.prd.md`
- **Stories file**: `.claude/stories/<name>.md`
- **Issues**: the created issue numbers/URLs (from `/create-stories` Phase 7), or "no issues created (`--no-create` / declined)".
- **Next step** (suggest, do not run): pick an issue → `/prime <n>` → `/plan <n>` → `/implement`.

---

## Guardrails — do NOT

- Reimplement PRD writing or story slicing — chain `/create-prd` / `/prd-interactive` / `/create-stories` by name; they own the templates, labels, and issue bodies.
- Skip or weaken either gate. GATE 1 (PRD→stories) is owned here; GATE 2 (issue creation) is reused from `/create-stories` Phase 6.1 — never re-spell it or auto-answer it.
- Create issues off an unconfirmed PRD, or run anything past GATE 1 before an explicit `yes`.
- Write any file except through the chained flows.
- Double-grill: on the cold path, Stage 1 is skipped — `/prd-interactive` does the questioning.
- Run the per-issue `/plan`/`/implement` loop — the skill ends at the report and only suggests it.
- Translate the brand words "Orbit" / "Astra" — they stay literal everywhere.
