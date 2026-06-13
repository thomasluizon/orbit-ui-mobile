# apps/web — Next.js 16 + App Router

Web client. Server Components by default. Auth via httpOnly cookies + BFF proxy. State via Zustand + TanStack Query.

## Conventions

- **Named exports only.** `kebab-case` filenames, `PascalCase` components.
- **Server Components by default.** `"use client"` only when you need hooks, events, browser APIs, or context. If you can render on the server, do.
- **Zero `any`** — root `CLAUDE.md` Code Standards rule 3.
- **No `console.log`** in production code — rule 4.
- **No narration comments** (lint-enforced `local/no-comments`) — rule 5. Only `/** */` JSDoc on exports, WHY notes linking an upstream URL, and tooling directives.
- **All user-facing strings through i18n** (next-intl). Never hardcode display text.
- **All mutations through Server Actions** in `app/actions/*.ts`. Never call the API from a client component. Sanctioned exceptions: (1) cookie-setting auth/session flows (`app/api/auth/*` — send-code, verify-code, google, logout, session) are BFF route handlers because they own the httpOnly auth cookie lifecycle; (2) the SSE chat send in `hooks/use-chat-composer.ts` fetches the BFF chat-stream route directly because a Server Action cannot return a streaming `ReadableStream`. Everything else stays a Server Action.
- **Imports:** types from `@orbit/shared/types`, query keys from `@orbit/shared/query`, endpoints from `@orbit/shared/api`.

## Key files

| What | Where |
|---|---|
| App shell + nav | `app/(app)/layout.tsx` + `components/navigation/web-nav.tsx` |
| Design tokens (navy+violet system, 6 schemes × dark/light) | `app/globals.css` (Tailwind v4 CSS-first) |
| Auth middleware | `proxy.ts` |
| BFF catch-all proxy | `app/api/[...path]/route.ts` |
| Server Actions (mutations) | `app/actions/*.ts` |
| TanStack Query hooks | `hooks/use-*.ts` |
| Zustand stores | `stores/*-store.ts` |
| Primitives (AppBar, SectionLabel, HabitRow, StatusDot, ParentRing, Chip, SettingsRow, ConfirmDialog, RingMotif) | `components/ui/*` + `components/habits/habit-row.tsx` + `components/gamification/ring-motif.tsx` |

## State management

- **Server state:** TanStack Query. One hook per resource in `hooks/use-*.ts`. Query keys from `@orbit/shared/query/keys.ts` — never invent inline keys.
- **Client state:** Zustand stores in `stores/*-store.ts`. Persist with `skipHydration: true` and rehydrate manually in `lib/providers.tsx` to avoid SSR mismatches.
- **Form state:** react-hook-form + Zod resolver. Schemas live in `packages/shared/src/validation/*.ts` so the mobile app uses the same rules.

## Server Actions pattern

```ts
"use server"
import { serverAuthFetch } from "@/lib/server-fetch"
import { API } from "@orbit/shared/api"

export async function createHabit(input: CreateHabitInput) {
  return serverAuthFetch(API.habits.create, {
    method: "POST",
    body: JSON.stringify(input),
  })
}
```

- Always go through `serverAuthFetch` so the httpOnly cookie is forwarded.
- Cache refresh is client-side: mutation hooks invalidate TanStack queries (`queryClient.invalidateQueries` with keys from `@orbit/shared/query`). Server Actions do not call `revalidateTag` / `revalidatePath`.
- Errors propagate as thrown — the client side catches via `useMutation`'s `onError`.

## BFF proxy

`app/api/[...path]/route.ts` is a catch-all that forwards client requests to `orbit-api` with the cookie's bearer token. The mobile app calls `orbit-api` directly; the web app NEVER does — it goes through this proxy. This is the only place that touches the upstream API URL.

## Styling

- **Tailwind v4 CSS-first.** Theme tokens in `@theme` block in `app/globals.css`. New tokens go there, not inline.
- **Semantic tokens only** — `var(--bg)`, `var(--bg-elev)`, `var(--fg-1)`, `var(--primary)`, `var(--primary-rgb)` tints, etc. per `DESIGN.md`. Never raw slate values, never hardcoded violet rgba.
- **shadcn-style primitives** are wrapped in `components/ui/*`. Never use them in default state — customize radii, colors, shadows to the token system.

## Patterns to mirror

| Want to add… | Look at… |
|---|---|
| New page | `app/(app)/page.tsx` |
| New Server Action | `app/actions/habits.ts` |
| New TanStack hook | `hooks/use-habits.ts` |
| New Zustand store | `stores/ui-store.ts` |
| New primitive | `components/ui/section-label.tsx` |
| New form | search for `useForm` + `zodResolver` |

## Testing

- Vitest + RTL. Config: `vitest.config.ts`.
- Tests assert on behavior + data attributes (`data-severity`, `data-action-status`), NOT class names or implementation details.
- Mock `next/navigation` when testing components that use `useRouter`.
