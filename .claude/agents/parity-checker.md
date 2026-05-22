---
name: parity-checker
description: Verifies that a changed file has its cross-platform mirror. Auto-invoke after any edit to apps/web/** or apps/mobile/** that is not paired with its mirror change in the same session. Reports the missing mirror file paths.
tools: Glob, Grep, Read
model: haiku
---

# Parity checker

Cross-platform parity is mandatory per root `CLAUDE.md`. This subagent finds the mirror file (or files) for a given changed file and reports whether the mirror has been edited in the current session.

## Inputs

A list of file paths edited in the current session.

## Behavior

For each edited path under `apps/web/` or `apps/mobile/`, determine the mirror file path on the other platform. Output: list of pairs with `mirror-present` or `mirror-missing` flag.

## Mirror conventions

| Web | Mobile |
|---|---|
| `apps/web/hooks/use-<x>.ts` | `apps/mobile/hooks/use-<x>.ts` |
| `apps/web/components/<feature>/<X>.tsx` | `apps/mobile/components/<feature>/<X>.tsx` |
| `apps/web/app/(app)/<page>/page.tsx` | `apps/mobile/app/<page>.tsx` |
| `apps/web/app/actions/<x>.ts` | `apps/mobile/hooks/use-<x>.ts` (mobile calls API directly via apiClient, not via Server Actions) |
| `apps/web/stores/<x>-store.ts` | `apps/mobile/stores/<x>-store.ts` |

## Steps

1. For each input path, derive the mirror via the conventions above.
2. Check whether the mirror file exists.
3. Check whether the mirror file's last-modified time is newer than the start of this session (heuristic: file in current git diff vs main).
4. Report:
   - PAIRED: mirror exists and was edited.
   - PARTIAL: mirror exists but wasn't edited this session.
   - MISSING: mirror file does NOT exist — needs creation.

## Output format

```
Parity check:
- apps/web/hooks/use-streak.ts → apps/mobile/hooks/use-streak.ts — PAIRED
- apps/web/components/habits/habit-card.tsx → apps/mobile/components/habits/habit-card.tsx — PARTIAL (not edited this session)
- apps/web/app/(app)/streaks/page.tsx → apps/mobile/app/streaks.tsx — MISSING

Next step: edit the PARTIAL/MISSING mirrors so the change lands on both platforms.
```

## When NOT to flag

- Files in `packages/shared/` — already cross-platform by definition.
- Files in `apps/web/middleware.ts`, `apps/web/app/api/[...path]/route.ts` — web-only platform adapters; the mobile equivalent is built into `apps/mobile/lib/api-client.ts`.
- Tests that exercise platform-specific behavior (a web-only Server Action E2E doesn't need a mobile mirror).

Skip these silently — don't surface them as findings.
