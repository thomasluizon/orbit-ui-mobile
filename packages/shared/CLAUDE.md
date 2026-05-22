# packages/shared — single source of truth

Cross-platform code consumed by both `apps/web` and `apps/mobile`. Types, utils, i18n locales, theme data, API endpoint paths, TanStack query key factories, validation schemas, test factories.

## Conventions

- **Pure TypeScript.** No React, no Next.js, no React Native imports. If you need a DOM API, this isn't the right place.
- **Named exports only.**
- **Zero `any`** — root `CLAUDE.md` Code Standards rule 3.
- **All public surfaces typed.** This is the contract — narrow at the boundary, trust within.

## Layout

```
src/
  types/                    - Zod schemas + inferred TS types per domain (habit.ts, profile.ts, ...)
    index.ts                - barrel; consumers import from "@orbit/shared/types"
  api/
    endpoints.ts            - all API paths as a const tree (e.g. API.habits.get(id))
    index.ts
  query/
    keys.ts                 - TanStack query key factories
    index.ts
  i18n/
    en.json                 - English locale (canonical)
    pt-BR.json              - Portuguese (Brazil) locale
    index.ts                - shared i18n config (next-intl + i18next compatible)
  theme/
    color-schemes.ts        - 6 OKLCH color schemes
    tokens-v2.ts            - createTokensV2(scheme, mode) — v8 OKLCH semantic tokens
    index.ts
  utils/
    *.ts                    - cross-platform utilities (formatAPIDate, etc.)
    index.ts
  stores/                   - shared Zustand store SHAPES (consumer apps implement persistence)
  validation/               - Zod refinement schemas for forms (shared between web + mobile rhf consumers)
  chat/                     - shared chat constants (CHAT_SPEECH_LANG_KEY, CHAT_VISUALIZER_BAR_OFFSETS)
  __tests__/factories.ts    - test data factories used by both apps
```

## Types (Zod-first)

Every domain has a Zod schema in `types/<domain>.ts`:

```ts
import { z } from "zod"

export const HabitSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  ...
})

export type Habit = z.infer<typeof HabitSchema>
```

- Schemas are the contract with `orbit-api`. If the API returns a field, the schema declares it. If the API doesn't return it, the schema doesn't either.
- Use `.parse` at trust boundaries (incoming API responses, form submissions). Inside the app, trust the type.
- Export the type via `z.infer` — don't write a separate TS type that duplicates the schema.

## API endpoints

`api/endpoints.ts` is the SINGLE source of truth for API paths:

```ts
export const API = {
  habits: {
    list: "/api/habits",
    get: (id: string) => `/api/habits/${id}`,
    create: "/api/habits",
    ...
  },
  ...
}
```

- Both apps import `import { API } from "@orbit/shared/api"`.
- Never hardcode an API path inline. If the path doesn't exist here, add it here first.
- Adding an endpoint means: const here → matching `orbit-api` controller route → Zod schema in `types/` → web Server Action AND mobile apiClient call → query key in `query/keys.ts` if it's a read.

## Query keys

`query/keys.ts` exports factory functions per resource:

```ts
export const habitKeys = {
  all: ["habits"] as const,
  list: (filters: HabitFilters) => [...habitKeys.all, "list", filters] as const,
  detail: (id: string) => [...habitKeys.all, "detail", id] as const,
}
```

- Both web hooks and mobile hooks consume these — never invent ad-hoc keys.
- Hierarchical structure enables `queryClient.invalidateQueries({ queryKey: habitKeys.all })`.

## i18n parity

- `en.json` and `pt-BR.json` MUST stay in sync. Every key in one MUST exist in the other.
- The `i18n-syncer` subagent flags drift. CI also fails if keys are missing.
- Both apps consume the same JSON: web via next-intl, mobile via react-i18next.

## Theme

`theme/color-schemes.ts` defines 6 OKLCH schemes (purple, blue, green, rose, orange, cyan). `theme/tokens-v2.ts` exports `createTokensV2(scheme, mode)` which returns the resolved v8 token bag (bg, fg-1..4, primary, hairline, status-*).

- Web reads them via `app/globals.css` `@theme` block + Tailwind tokens.
- Mobile reads them via `createColors()` in `apps/mobile/lib/theme.ts`.

## Patterns to mirror

| Want to add… | Look at… |
|---|---|
| New domain type | `types/habit.ts` (Zod + inferred TS) |
| New API endpoint constant | `api/endpoints.ts` (existing tree shape) |
| New query key set | `query/keys.ts` |
| New i18n key | `i18n/en.json` AND `i18n/pt-BR.json` (both, same diff) |
| New utility | `utils/format-api-date.ts` |
| New test factory | `__tests__/factories.ts` |

## Testing

- Vitest. Run `npm test` from package root.
- Factories live in `__tests__/factories.ts` and are imported by both apps' tests — keep them realistic and minimal.
