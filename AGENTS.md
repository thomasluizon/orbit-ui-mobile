# Orbit

Personal habit tracker. Turborepo monorepo: Next.js 15 (web) + Expo/React Native (mobile) + @orbit/shared.

## For Agents Working on This Codebase

### Quick Orientation

- **Monorepo** managed by Turborepo. Three workspaces: `apps/web`, `apps/mobile`, `packages/shared`.
- **Shared package** (`@orbit/shared`) contains all types (Zod schemas), utils, i18n locales, theme data, API endpoint constants, TanStack Query key factories, and form validation schemas. Both apps import from it.
- **Web app** uses Next.js 15 App Router with Server Components by default. Client components marked with `"use client"`. State: Zustand (client) + TanStack Query (server). Auth via httpOnly cookies + BFF proxy.
- **Mobile app** uses Expo SDK 53 + Expo Router. Auth via SecureStore. Direct API calls (no BFF). SQLite offline queue.
- **API** is a separate .NET 10 codebase at `orbit-api/`. Not in this repo.

### Key Files

| What | Where |
|------|-------|
| Design system (CSS tokens) | `apps/web/app/globals.css` |
| Auth middleware | `apps/web/middleware.ts` |
| BFF catch-all proxy | `apps/web/app/api/[...path]/route.ts` |
| Server Actions (mutations) | `apps/web/app/actions/*.ts` |
| TanStack Query hooks | `apps/web/hooks/use-*.ts` |
| Zustand stores | `apps/web/stores/*-store.ts` |
| All Zod types | `packages/shared/src/types/*.ts` |
| API endpoint paths | `packages/shared/src/api/endpoints.ts` |
| Query key factories | `packages/shared/src/query/keys.ts` |
| Color scheme data | `packages/shared/src/theme/color-schemes.ts` |
| i18n locales | `packages/shared/src/i18n/en.json`, `pt-BR.json` |

### Conventions

- Zero `any`. Use `unknown` with narrowing.
- No `console.log` in production code.
- Named exports only. `kebab-case` filenames, `PascalCase` components.
- Server Components by default. `"use client"` only for hooks/events/browser APIs.
- Import types from `@orbit/shared/types`. Import query keys from `@orbit/shared/query`.
- All user-facing strings through i18n. Never hardcode display text.
- All mutations through Server Actions (web) or apiClient (mobile).
- Auth cookie: httpOnly, sameSite strict, secure always.

### Testing

- Unit: Vitest + React Testing Library. Config: `apps/web/vitest.config.ts`
- E2E: Playwright. Config: `apps/web/playwright.config.ts`
- Test factories: `packages/shared/src/__tests__/factories.ts`
- Run: `npx vitest run` (unit), `npm run test:e2e` (E2E)

### Common Tasks

**Add a new page:** Create `apps/web/app/(app)/my-page/page.tsx`. Add route to mobile at `apps/mobile/app/my-page.tsx` + register in `_layout.tsx`.

**Add a new API endpoint:** Add path to `packages/shared/src/api/endpoints.ts`. Create Server Action in `apps/web/app/actions/`. Add query key to `packages/shared/src/query/keys.ts` if it's a query.

**Add a new type:** Create Zod schema in `packages/shared/src/types/`. Export from `index.ts`. Both apps get it automatically.

**Add a new component:** Create in `apps/web/components/<feature>/`. For mobile, create parallel in `apps/mobile/components/`.
