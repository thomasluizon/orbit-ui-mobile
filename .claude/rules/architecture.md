---
globs: ["apps/**", "packages/**"]
description: Core architecture patterns -- BFF, auth, state, API, dates, theme, container, layout, offline
---

# Architecture Patterns

## BFF (Backend for Frontend) -- Web

- **Auth handling:** Route Handlers read JWT from the `auth_token` httpOnly cookie and forward it as `Bearer` token to the .NET API.
- **Server Actions:** All mutations go through Server Actions in `app/actions/`. They use `getAuthHeaders()` from `lib/auth-api.ts`.
- **Catch-all proxy:** `app/api/[...path]/route.ts` proxies to the .NET backend. Path allowlist: `auth/`, `profile/`, `chat/`, `user-facts/`, `support/`, `tags/`, `notifications/`, `subscriptions/`, `config/`, `calendar/`, `goals/`, `referrals/`, `gamification/`, `api-keys/`, `checklist-templates/`, `sync/`. Returns 404 for unlisted paths.

## Mobile -- Direct API

- Mobile calls `https://api.useorbit.org/api/` directly with JWT from SecureStore.
- Auth token as `Authorization: Bearer <token>` header.

## Auth

JWT in httpOnly cookie (web, 7-day, sameSite strict, secure always) or SecureStore (mobile). Client-side expiry monitor warns at 5min, auto-logouts at 0.

## State Management

- **Zustand** for client-only: auth, chat messages, UI (filters, celebrations, selections)
- **TanStack Query** for server data: habits, goals, profile, tags, notifications, gamification
- Never mix. Server data in TanStack Query, ephemeral UI in Zustand.

## Habits Query

`GET /api/habits` requires `dateFrom`/`dateTo`. Today: single day + `includeOverdue=true`. Calendar: full month range. Backend computes `scheduledDates[]` and `isOverdue`.

## Dates

Always parse `YYYY-MM-DD` as local (not UTC). Use date-fns throughout.

## Modals

`AppOverlay`: Dialog (desktop >640px) / Drawer (mobile <640px).

## Theme

Dark/light modes, 6 color schemes. CSS custom properties swapped via `useColorScheme` hook. Fluid typography clamp() 320-720px.

## Container Layout

`--app-max-w: 640px`, `--app-px: 1.25rem/1.5rem`. Layouts handle padding, pages do NOT.

## Schedule Logic

Backend (`HabitScheduleService`) owns all schedule calculations. Frontend never computes due dates.

## Timezone & Language

- Timezone auto-detect on first login.
- Language: DB is source of truth. Frontend syncs on profile load.

## Offline

- Web: IndexedDB queue (idb) + TanStack Query persistence (localStorage)
- Mobile: SQLite queue (expo-sqlite) + persistence (AsyncStorage)
- Sync: replay queue, then `GET /api/sync/changes?since=<lastSyncTime>`
