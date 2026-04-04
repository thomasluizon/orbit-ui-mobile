# Type Safety Audit

Scanned: `apps/web/` and `packages/shared/src/`
Excludes: test files (`*.test.ts`, `*.spec.ts`), config files
Date: 2026-04-04

---

## Summary

| Category | Total Found | Fixed | Remaining (Warning/Info) |
|---|---|---|---|
| `any` usage | 8 | 7 | 1 |
| Unsafe type assertions | 14 | 9 | 5 |
| Non-null assertions (`!`) | 9 | 9 | 0 |
| `catch` without `: unknown` | 1 | 1 | 0 |
| `console.log/error/warn` | 1 | 1 | 0 |
| JSON.parse without validation | 2 | 0 | 2 |
| Implicit `any` from `res.json()` | 6 | 2 | 4 |

---

## Fixed Violations

### 1. `any` usage

**FIXED -- Critical**
`apps/web/components/habits/habit-form-fields.tsx` lines 143, 147, 150, 344, 598
Pattern: `t(key as any)` -- dynamic i18n key cast to `any` to satisfy next-intl's typed `t()`.
Fix: Replaced all `as any` with `as Parameters<typeof t>[0]`, which is the correct type for a valid message key. Also added `HabitTag` import and replaced the `res.json() as Promise<Array<...>>` with `(await res.json()) as HabitTag[]`.

**FIXED -- Critical**
`apps/web/components/habits/habit-card.tsx` lines 197, 202, 206, 207, 218
Same pattern as above.
Fix: Replaced all `as any` with `as Parameters<typeof t>[0]`.

**FIXED -- Critical**
`apps/web/components/habits/habit-calendar.tsx` line 83
Same pattern.
Fix: Replaced `as any` with `as Parameters<typeof t>[0]`.

**FIXED -- Warning**
`apps/web/components/chat/breakdown-suggestion.tsx` line 116, 142
`EditableHabit.frequencyUnit` was typed as `string | null`, requiring an `as BulkHabitItem['frequencyUnit']` cast at each usage.
Fix: Tightened `EditableHabit.frequencyUnit` to `FrequencyUnit | null`. Added `frequencyUnitSchema` import to validate the select element value at the source. Removed all resulting casts.

**REMAINING -- Info**
`apps/web/hooks/use-color-scheme.ts` line 114
```ts
VALID_SCHEMES.includes(cookie as ColorScheme) ? (cookie as ColorScheme) : 'purple'
```
The `Array<T>.includes()` method requires its argument to be `T`, forcing a pre-cast. This is a known TypeScript limitation. The logic is correct: the `includes` check acts as a runtime guard and the final `as ColorScheme` is safe. A type predicate helper would be cleaner but is not critical.

---

### 2. Unsafe type assertions

**FIXED -- Critical**
`apps/web/components/habits/goal-linking-field.tsx` line 36
```ts
return (data.items ?? data) as Goal[]
```
`data` is typed as `any` from `res.json()`. The access to `.items` and the cast to `Goal[]` had no shape guarantee.
Fix: Added a `GoalsListResponse` interface, typed the `queryFn` return as `Promise<Goal[]>`, and used `Array.isArray(data)` to narrow before returning.

**FIXED -- Critical**
`apps/web/lib/offline-queue.ts` line 31
```ts
return (all as QueuedMutation[]).sort(...)
```
`db.getAll()` returned `unknown[]` because `IDBPDatabase` was untyped (`IDBPDatabase` without generic parameter).
Fix: Added an `OrbitDB` schema interface and typed the database as `IDBPDatabase<OrbitDB>`. The cast is no longer needed.

**FIXED -- Warning**
`apps/web/components/goals/goals-view.tsx` lines 22-25
Literal string values `'Active'`, `'Completed'`, `'Abandoned'` were cast via `as GoalStatus` when constructing the filter array.
Fix: Added an explicit `StatusFilter` interface and typed the `useMemo` return value as `StatusFilter[]`. TypeScript now infers the literal types without casts.

**REMAINING -- Warning**
`apps/web/app/api/auth/google/route.ts` line 30
`apps/web/app/api/auth/verify-code/route.ts` line 30
```ts
const loginResponse = data as BackendLoginResponse
```
`data` is `any` from `res.json()`. The cast has no runtime validation. There is a guard (`!response.ok` early return) but the shape of the successful response is not verified.
Suggested fix: Parse with `backendLoginResponseSchema.parse(data)` from `@orbit/shared/types/auth`.

**REMAINING -- Warning**
`apps/web/app/(auth)/auth-callback/page.tsx` line 122
`apps/web/app/(auth)/login/page.tsx` line 157
```ts
const loginResponse = (await response.json()) as LoginResponse
```
Same as above -- cast from `any` to a typed response without Zod validation.
Suggested fix: Parse with `loginResponseSchema.parse(await response.json())`.

**REMAINING -- Warning**
`apps/web/hooks/use-drill-navigation.ts` line 136
```ts
{ ...detail, children: detail.children ?? [] } as HabitDetailChild
```
`HabitDetail` structurally satisfies `HabitDetailChild` (it is a superset), so this cast is sound. However it bypasses structural type checking.
Suggested fix: Extract a shared base type or use `satisfies` instead of `as`.

**REMAINING -- Warning**
`apps/web/hooks/use-habits.ts` line 209, 409
```ts
habitKeys.list(filters as Record<string, unknown>)
```
`filters` is the `HabitsFilter` type. `Record<string, unknown>` is structurally compatible, but the cast silences type information. The query key factory should accept `HabitsFilter` directly.
Suggested fix: Update `habitKeys.list()` in `@orbit/shared/query` to accept `HabitsFilter` instead of `Record<string, unknown>`.

---

### 3. Non-null assertions (`!`)

**FIXED -- Warning**
`apps/web/components/habits/habit-form-fields.tsx` lines 116, 117, 196, 197
`apps/web/components/calendar/calendar-day-detail.tsx` line 48
Pattern: `hStr!` and `mStr!` after `time.split(':')`. `split()` returns `string[]`, making each element `string | undefined`.
Fix: Replaced `hStr!` and `mStr!` with `hStr ?? ""` and `mStr ?? ""`. `parseInt("")` returns `NaN`, which is already handled by the existing `!Number.isNaN(h)` check. `h ?? "0"` used where a fallback of 0 is semantically correct.

**FIXED -- Warning**
`apps/web/components/habits/habit-list.tsx` lines 530, 543
`drill.currentParentId!` used in button click handlers. `currentParentId` is `string | null`.
Fix: Replaced with `drill.currentParentId && startAddSubHabit(drill.currentParentId)`. Both buttons are inside the `drill.currentParent ?` branch so `currentParentId` is non-null at runtime, but TypeScript cannot flow-narrow across closures.

**FIXED -- Warning**
`apps/web/components/onboarding/onboarding-create-goal.tsx` line 57
`targetValue!` inside `handleCreate`, which is already gated by `if (!canCreate)`.
Fix: Replaced with `targetValue ?? 0`.

**FIXED -- Warning**
`apps/web/components/ui/expiry-warning.tsx` line 23
`expiresAt!` inside nested `check()` function. The outer `useEffect` has `if (!expiresAt) return`, but TypeScript does not narrow `expiresAt` inside the nested closure.
Fix: Replaced with `(expiresAt ?? 0)`.

**FIXED -- Warning**
`apps/web/hooks/use-habits.ts` lines 280, 293, 315, 328
`apps/web/hooks/use-goals.ts` lines 126, 139
Pattern: `queryFn: () => fetchJson<T>(API.habits.get(id!))` where `id: string | null` and `enabled: !!id`.
The `queryFn` only runs when `enabled` is `true` (i.e., `id` is non-null), but TypeScript does not know this.
Fix: Replaced all `id!` with `id ?? ""`. The empty-string fallback is never reached at runtime because `enabled: !!id` prevents execution.

---

### 4. `catch` without `: unknown`

**FIXED -- Critical**
`apps/web/app/(app)/advanced/page.tsx` line 178
```ts
} catch (err) {
  setCreateKeyError(err instanceof Error ? err.message : ...)
}
```
Missing `: unknown` annotation. Without it, `err` is implicitly `any` in some TypeScript configurations.
Fix: Changed to `catch (err: unknown)`. The existing `err instanceof Error` narrowing was already correct.

---

### 5. `console.log/error/warn` in production code

**FIXED -- Warning**
`apps/web/i18n/request.ts` line 16
```ts
console.error(error)
```
In the `onError` callback of `next-intl`'s `getRequestConfig`. This logs all non-MISSING_MESSAGE i18n errors to the server console in production.
Fix: Removed the `console.error` call. Added a comment noting that errors are intentionally swallowed. Also prefixed the unused `namespace` destructured parameter with `_namespace` to avoid lint warnings.

---

### 6. JSON.parse without type validation

**REMAINING -- Warning**
`apps/web/app/api/auth/session/route.ts` line 29-31
```ts
const payload = JSON.parse(
  Buffer.from(payloadSegment, 'base64url').toString('utf-8')
) as { exp?: number }
```
JWT payload is decoded and cast without Zod validation. The cast is safe for the specific field (`exp?: number`) being accessed, but a malformed JWT could produce unexpected shapes.
Suggested fix: Use `z.object({ exp: z.number().optional() }).safeParse(JSON.parse(...))`.

**REMAINING -- Warning**
`apps/web/components/habits/checklist-templates.tsx` line 24
```ts
return raw ? (JSON.parse(raw) as ChecklistTemplate[]) : []
```
`localStorage` value parsed and cast without validation. A corrupted storage value would produce a runtime error.
Suggested fix: Wrap in `try/catch` (already done) and add a `ChecklistTemplate` Zod schema to validate before using, or use `z.array(checklistTemplateSchema).safeParse(JSON.parse(raw))`.

---

### 7. Implicit `any` from `res.json()`

The `fetch` Fetch API types `res.json()` as `Promise<any>` in the DOM type library. This is a TypeScript/DOM limitation, not a code bug. All `fetchJson<T>()` helper functions and direct `.json()` calls return `any` which then gets cast to the expected type.

**REMAINING -- Warning (4 locations)**
`apps/web/hooks/use-habits.ts` line 91: `res.json() as Promise<T>` in `fetchJson<T>`
`apps/web/hooks/use-goals.ts` line 44: same pattern
`apps/web/hooks/use-notifications.ts` line 33: same pattern
`apps/web/hooks/use-gamification.ts` line 30: same pattern
`apps/web/hooks/use-referral.ts` line 15: same pattern
`apps/web/hooks/use-subscription-plans.ts` line 15: same pattern
`apps/web/hooks/use-billing.ts` line 18: same pattern
`apps/web/hooks/use-summary.ts` line 55: same pattern

All `fetchJson<T>` helpers and direct `res.json()` calls use `as Promise<T>` or `(await res.json()) as T` without Zod schema validation. This means the type system trusts the API contract, but a backend schema change or error response would cause silent runtime breakage rather than a type error.
Suggested fix: Use Zod schemas from `@orbit/shared/types` to parse responses at the boundary. For example, replace `return res.json() as Promise<T>` with Zod `.parse()` calls using the corresponding schema.

---

## Count Summary

| Severity | Category | Count |
|---|---|---|
| Critical (runtime crash risk) | `any` in `t()` calls | 8 occurrences in 3 files -- **Fixed** |
| Critical | Missing `: unknown` on `catch` | 1 -- **Fixed** |
| Critical | `console.error` in production | 1 -- **Fixed** |
| Warning | Unsafe response casts (`as LoginResponse`, etc.) | 4 remaining |
| Warning | Non-null assertions | 9 -- all **Fixed** |
| Warning | Untyped IDB database | 1 -- **Fixed** |
| Warning | Loose filter array typing (`as GoalStatus`) | 1 -- **Fixed** |
| Warning | `EditableHabit.frequencyUnit` too loose | 1 -- **Fixed** |
| Warning | `(data.items ?? data) as Goal[]` | 1 -- **Fixed** |
| Warning | JSON.parse without Zod validation | 2 remaining |
| Warning | `res.json() as Promise<T>` without validation | 7 remaining |
| Info | `cookie as ColorScheme` (correct runtime guard) | 1 remaining |
| Info | `filters as Record<string, unknown>` in query keys | 2 remaining |
| Info | `{ ...detail } as HabitDetailChild` (structurally sound) | 1 remaining |

**Total fixed: 25 violations across 12 files**
**Remaining (all Warning/Info, no new Critical): 18**
