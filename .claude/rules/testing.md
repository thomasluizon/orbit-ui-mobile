---
globs: ["**/*.test.*", "**/*.spec.*", "apps/web/e2e/**"]
description: Testing conventions -- Vitest unit tests and Playwright E2E tests
---

# Testing Conventions

## Unit Tests (Vitest + React Testing Library)

- Run: `npx vitest run`
- TanStack Query hooks tested with `renderHook` + `QueryClientProvider`
- Zustand stores tested directly
- Shared utils/types tested in `packages/shared/src/__tests__/`
- **Every new feature must include unit tests** for hooks, stores, and utilities

## E2E Tests (Playwright)

- Run: `npm run test:e2e`
- Tests in `apps/web/e2e/tests/`
- Use `authenticatePage()` + `dismissOverlays()` from `e2e/helpers/auth.ts`
- Use `createAPIHelper()` from `e2e/helpers/api.ts` for setup/teardown via API
- Tests must be self-cleaning: delete all created data in `afterAll`
- **Every new feature must include E2E tests** covering the happy path
