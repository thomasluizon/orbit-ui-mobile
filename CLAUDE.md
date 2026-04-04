# Orbit

Personal habit tracker. Turborepo monorepo with Next.js 15 (web) + Expo/React Native (mobile) + shared packages. Consumes .NET 10 REST API via BFF.

## Stack

- **Monorepo:** Turborepo with npm workspaces
- **Web:** Next.js 15 (App Router), React 19, TypeScript
- **Mobile:** Expo SDK 53, React Native 0.79, Expo Router
- **UI (Web):** shadcn/ui, Tailwind CSS v4, Manrope font
- **UI (Mobile):** NativeWind (Tailwind for RN), @gorhom/bottom-sheet
- **State:** Zustand (client state), TanStack Query v5 (server data)
- **i18n (Web):** next-intl with en + pt-BR locales
- **i18n (Mobile):** i18next + react-i18next
- **Forms:** react-hook-form + Zod (shared validation schemas)
- **Utilities:** date-fns, Zod, lucide-react / lucide-react-native
- **Shared:** @orbit/shared -- types (Zod schemas), utils, i18n, theme, API endpoints, query keys, validation

## Dev Commands

```bash
npm run dev              # Start all apps (turbo)
npm run dev --filter=web # Start web only
npm run dev --filter=mobile # Start mobile only
npm run build            # Build all packages
npx turbo run type-check # Type-check all packages
npx vitest run           # Run unit tests
npm run test:e2e         # Run Playwright E2E tests
```

API defaults to `http://localhost:5000` (override via `API_BASE`).
Production: `https://app.useorbit.org` (Vercel), API: `https://api.useorbit.org` (Render).

## Architecture

### Directory Layout

```
apps/
  web/                   # Next.js 15 (App Router)
    app/
      (auth)/            # Public routes (login, auth-callback)
      (app)/             # Protected routes (all authenticated pages)
      api/               # Route Handlers (auth, proxy, webhook)
      actions/           # Server Actions (habits, goals, tags, profile, etc.)
    components/          # Feature-organized: habits/, chat/, calendar/, navigation/, onboarding/
    hooks/               # React hooks (use-habits, use-goals, use-profile, etc.)
    stores/              # Zustand stores (auth-store, ui-store, chat-store)
    lib/                 # Auth helpers, query client, offline queue
  mobile/                # Expo (React Native)
    app/                 # Expo Router (file-based routing)
    components/          # React Native components (parallel to web)
    hooks/               # Platform-specific hooks
    stores/              # Same interface as web, different storage
    lib/                 # SecureStore auth, SQLite offline queue
packages/
  shared/                # Pure TypeScript, no framework deps
    src/
      types/             # Zod schemas + inferred types per domain
      utils/             # dates, timezones, email, errors
      i18n/              # en.json, pt-BR.json locale files
      theme/             # 6 color scheme definitions
      api/               # Endpoint paths, error utils
      query/             # TanStack Query key factories
      validation/        # Form validation schemas (Zod)
```

### BFF (Backend for Frontend) -- Web

All API calls from the web app go through Next.js Route Handlers or Server Actions, never directly to the .NET backend.

- **Auth handling:** Route Handlers read the JWT from the `auth_token` httpOnly cookie and forward it as a `Bearer` token to the .NET API.
- **Server Actions:** All mutations (create/update/delete habits, goals, tags, profile, etc.) are Server Actions in `app/actions/`. They read the cookie via `getAuthHeaders()` from `lib/auth-api.ts`.
- **Catch-all proxy:** `app/api/[...path]/route.ts` proxies GET requests to the .NET backend. Uses a path allowlist -- returns 404 for unlisted paths.
- **Mobile:** Direct API calls to `https://api.useorbit.org/api/` with JWT from SecureStore.

### State Management

- **Zustand** for client-only state: auth, chat messages, UI state (filters, celebrations, selections)
- **TanStack Query** for all server data: habits, goals, profile, tags, notifications, gamification
- Never mix: if data comes from the server, it goes in TanStack Query. If it's ephemeral UI state, it goes in Zustand.

### Key Patterns

- **Auth:** JWT stored in httpOnly cookie (web) or SecureStore (mobile). 7-day expiry, sameSite strict, secure always. Client-side expiry monitor warns at 5min, auto-logouts at 0.
- **Data fetching:** TanStack Query hooks call Server Actions (mutations) or fetch via Route Handlers (reads). Optimistic updates via `onMutate`/`onError`/`onSettled`.
- **Habits query:** `GET /api/habits` requires `dateFrom` and `dateTo`. Today view sends single day + `includeOverdue=true`. Calendar sends full month range. Backend computes `scheduledDates[]` and `isOverdue`.
- **Dates:** Always parse `YYYY-MM-DD` as local (not UTC). Use date-fns throughout.
- **Modals:** `AppOverlay` component adapts between Dialog (desktop >640px) and Drawer/Sheet (mobile).
- **Theme:** Dark and light modes with 6 customizable color schemes. CSS custom properties swapped at runtime. Fluid typography with clamp().
- **Container:** CSS variables `--app-max-w: 640px` and `--app-px`. Layouts handle padding, pages do NOT.
- **Schedule logic:** Backend owns all schedule calculations. Frontend never computes due dates.
- **Offline:** IndexedDB queue (web) / SQLite queue (mobile). TanStack Query persistence. Delta sync on reconnect.

## Coding Conventions

- Functional components only. React Server Components by default. `"use client"` only when needed.
- Prefer named exports over default exports.
- File naming: `kebab-case.ts` / `kebab-case.tsx`. Components: `PascalCase` in code.
- Hooks: `use-<name>.ts`. Stores: `<name>-store.ts`.
- shadcn/ui for all UI primitives. Tailwind utility classes in JSX.
- Zod schemas for all form validation (react-hook-form + @hookform/resolvers/zod).

### TypeScript Strictness

- **Zero `any`.** Use proper types, `unknown` with narrowing.
- **Error handling:** Always `catch (err: unknown)`. Use `getErrorMessage()` and `extractBackendError()`.
- **Non-null assertions:** Prefer `?? []` over `!`.
- **No `console.log/error/warn`** in production code.
- **JSON files:** No trailing commas.

### DRY Patterns

- Import types from `@orbit/shared/types`. Never inline unions that exist in shared.
- Use query key factories from `@orbit/shared/query`. Never hardcode key arrays.
- Use `getErrorMessage()` from `@orbit/shared/utils`. Never duplicate error narrowing.
- Use `<HabitFormFields>` component. Never duplicate form fields between Create/Edit.

### Security

- Open redirect prevention: `returnUrl` must start with `/` and not `//`.
- BFF path allowlist in catch-all proxy.
- Source maps disabled in production.
- Auth cookie: `sameSite: 'strict'`, `secure: true` always.

### i18n

- All user-facing strings through i18n. Never hardcode display text.
- Enum values to API stay in English (`'Day'`, `'Monday'`).
- **pt-BR:** Always use proper diacritical marks (accents, tildes, cedillas).

### Validation

- Every feature must include frontend validation (inline errors + submit blocking).
- Never assume "the backend will catch it" -- validate on both sides.

## Working Principles

- Plan first for non-trivial tasks. Re-plan immediately if approach fails.
- Always use the best approach. No workarounds or hacks.
- Never mark done without proving it works. Run tests.
- Fix bugs autonomously. No hand-holding needed.
- Use subagents to keep context window clean.

## Git Workflow

- Branch protection on `main`. No direct pushes.
- Branching: `feature/xxx`, `fix/xxx`, `chore/xxx`
- Squash merge only. Head branches auto-delete.
- Never reuse a branch after squash merge.

## Testing

- **Unit:** Vitest + React Testing Library. Run: `npx vitest run`
- **E2E:** Playwright. Run: `npm run test:e2e`
- Every new feature must include unit tests AND E2E tests.
