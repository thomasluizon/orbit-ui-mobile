---
description: Validation requirements and DRY patterns -- reuse hooks, never duplicate logic
---

# Validation

- **Every new feature must include validation for all invalid/edge-case scenarios**, both on the frontend (inline errors + submit blocking) and backend.
- Never assume "the backend will catch it" -- validate on both sides.
- Examples: date ranges, time ranges, numeric bounds, mutually exclusive options, required fields.

# DRY Patterns

- **Tag selection:** Use `useTagSelection()` hook for all tag CRUD + selection state.
- **Habit form logic:** Use `useHabitForm()` hook with react-hook-form + Zod for shared form logic.
- **Habit form template:** Use `<HabitFormFields>` component. Never duplicate form fields between Create/Edit modals.
- **Error extraction:** Use `getErrorMessage()` and `extractBackendError()` from `@orbit/shared/utils`. Never duplicate error narrowing.
- **Auth headers:** Use `getAuthHeaders()` from `lib/auth-api.ts` in all Server Actions. Never duplicate cookie reading.
- **Query keys:** Use factories from `@orbit/shared/query`. Never hardcode key arrays.
- **Validation schemas:** Use Zod schemas from `@orbit/shared/validation`. Never duplicate form validation between Create/Edit.
