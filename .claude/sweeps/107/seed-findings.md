# Seed findings (pre-battery) — round 1 triage queue

## SEED-1 — orphaned non-migration in EF migrations folder (HIGH, orbit-api)

`src/Orbit.Infrastructure/Migrations/20260410235000_AddPerformanceIndexes.cs` has NO `[Migration("...")]` attribute and no Designer file. EF does not discover it: it appears in neither `dotnet ef migrations list` nor the attribute inventory. Its `CREATE INDEX IF NOT EXISTS` statements were presumably applied to production manually, outside the EF chain.

Consequence: any fresh database built via `dotnet ef database update` silently misses the performance indexes.

Suggested fix (triage in Phase C): promote it to a real migration — add `[Migration]` + `[DbContext]` attributes and a Designer snapshot (or regenerate as a new properly-scaffolded migration with equivalent ops and delete the orphan). `IF NOT EXISTS` semantics make application idempotent on databases that already have the indexes; EF will backfill the history row. Verify chain integrity after.

Source: Phase-A migration-consolidation agent (verified pre-existing — equally true before the move).

## SEED-2 — web Server Actions hardcode API paths (MED, ui-mobile)

`apps/web/app/actions/*.ts` hardcode strings like `'/api/habits'` instead of importing the `API` constant tree. Violates packages/shared/CLAUDE.md: "Never hardcode an API path inline." Fix: replace literals with `API.*` references across all Server Actions.

## SEED-3 — apps/web/CLAUDE.md documents revalidateTag convention with zero real usages (LOW, ui-mobile)

"Use `revalidateTag` / `revalidatePath` after mutations" + sample code, but no usage exists in apps/web; real invalidation is TanStack-side. Triage: align the doc with practice (remove the revalidate convention from the sample) OR adopt it — pick during Phase C (doc fix is the low-risk root-cause alignment).

# Deferral register (round 1 input)

- DEF-1: Lighthouse / runtime perf measurements — user-owned, explicitly out of agent scope.
- DEF-2: File-level length of the 4 orchestration roots (mobile habit-list 1929, web habit-list 1289, today page 690, goal-detail-drawer 526, create-habit-modal 516) — pre-justified in issue #107 status note (rule 6 over rule 7 at file level). Per-FUNCTION >100-line violations inside them are still findings.
- DEF-3: Version-pin matrix (react-native-worklets 0.7.2, expo 55 overrides, hermes-compiler/memoize-one/promise/regenerator-runtime pins, react-native root junction via fix-hoisting.js) — deliberate upstream-bug workarounds, documented in repo memory/PRs. Pin choices are not findings.
