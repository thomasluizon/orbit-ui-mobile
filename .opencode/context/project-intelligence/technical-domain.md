<!-- Context: project-intelligence/technical | Priority: critical | Version: 1.0 | Updated: 2026-04-24 -->

# Orbit Technical Domain

> Orbit is a Turborepo monorepo for a personal habit tracker. It contains Next.js web, Expo mobile, and a shared TypeScript package. The .NET API lives outside this repo.

## Primary Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Monorepo | Turborepo, npm workspaces | Workspaces: `apps/web`, `apps/mobile`, `packages/shared` |
| Web | Next.js 15 App Router, React 19, TypeScript | Server Components by default |
| Mobile | Expo SDK 53, React Native, Expo Router | Direct API calls using SecureStore auth |
| Shared | `@orbit/shared` | Types, Zod schemas, i18n, theme, API endpoints, query keys, validation |
| State | Zustand, TanStack Query v5 | Zustand for client-only UI state, Query for server data |
| Forms | react-hook-form, Zod | Validation schemas should live in shared when cross-platform |
| API | Separate .NET 10 REST API | Not in this repo; web reaches it through BFF, mobile directly |

## Architecture

```text
apps/web       Next.js BFF, Server Actions, protected routes
apps/mobile    Expo Router app, SecureStore auth, SQLite offline queue
packages/shared Pure TypeScript shared contracts and utilities
```

## Web Data Flow

- Reads go through Next.js route handlers, including `app/api/[...path]/route.ts`.
- Mutations go through Server Actions in `apps/web/app/actions/`.
- Web auth uses an `auth_token` httpOnly cookie.
- BFF proxies only allowlisted paths.

## Mobile Data Flow

- Mobile calls the .NET API directly.
- JWT is stored in SecureStore.
- Offline queue uses SQLite.
- Feature behavior must match web unless platform adapters require different implementation.

## Cross-Platform Rule

Every feature, hook, component, page, validation rule, i18n key, error handling path, and data-flow behavior must be implemented for both web and mobile.

## Coding Standards

- Zero `any`; use `unknown` with narrowing.
- Named exports only.
- Files use `kebab-case`; components use `PascalCase`.
- User-facing strings must use i18n.
- No production `console.log`, `console.warn`, or `console.error`.
- Import types from `@orbit/shared/types`.
- Import query keys from `@orbit/shared/query`.
- Dates in `YYYY-MM-DD` are local dates, not UTC.
- Frontend never computes schedule due dates; backend owns schedule logic.

## Key Files

| Concern | Path |
|---------|------|
| Web CSS tokens | `apps/web/app/globals.css` |
| Web auth middleware | `apps/web/middleware.ts` |
| Web BFF proxy | `apps/web/app/api/[...path]/route.ts` |
| Server Actions | `apps/web/app/actions/*.ts` |
| Web hooks | `apps/web/hooks/use-*.ts` |
| Mobile hooks | `apps/mobile/hooks/` |
| Shared types | `packages/shared/src/types/*.ts` |
| Shared endpoints | `packages/shared/src/api/endpoints.ts` |
| Query keys | `packages/shared/src/query/keys.ts` |
| Locales | `packages/shared/src/i18n/en.json`, `packages/shared/src/i18n/pt-BR.json` |

## Verification

```bash
npx vitest run
npm run test:e2e
npx turbo run type-check
npm run build
```

Run targeted checks when practical and state clearly when full validation was not run.
