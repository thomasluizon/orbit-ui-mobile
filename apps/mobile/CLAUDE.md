# apps/mobile — Expo SDK 55 + Expo Router

Mobile client (Android only — no iOS app exists). Direct calls to `orbit-api` (no BFF). Auth via SecureStore. SQLite offline queue.

## Conventions

- **Named exports only.** `kebab-case` filenames, `PascalCase` components.
- **Zero `any`** — root `CLAUDE.md` Code Standards rule 3.
- **No `console.log`** in production code — rule 4.
- **No narration comments** — lint-enforced (`local/no-comments`, error); root rule 5. Only `/** */` JSDoc on exports + URL-linked WHY notes; tooling directives OK.
- **All user-facing strings through i18n** (react-i18next). Read locale via `i18n.language`, not `useDeviceLocale`. Never hardcode display text.
- **All mutations through `apiClient`** (`lib/api-client.ts`). Never call `fetch` directly.
- **Imports:** types from `@orbit/shared/types`, query keys from `@orbit/shared/query`, endpoints from `@orbit/shared/api`.

## Key files

| What | Where |
|---|---|
| App shell + nav | `app/_layout.tsx` + `components/navigation/bottom-tab-bar.tsx` |
| Design tokens (v8 via createTokensV2) | `lib/theme.ts` (consumes `@orbit/shared/theme`) |
| Theme provider | `lib/theme-provider.tsx` |
| API client | `lib/api-client.ts` |
| Offline queue (SQLite) | `lib/queued-api-mutation.ts` |
| Auth storage | SecureStore — see `lib/auth.ts` |
| TanStack Query hooks | `hooks/use-*.ts` |
| Zustand stores | `stores/*-store.ts` |
| Primitives (mirror of `apps/web/components/`) | `components/*` |

## Platform reality

- **Android only.** No iOS app ships. Don't write iOS-specific branches in new code; if you see one in pre-existing code, leave it unless explicitly tasked with iOS removal.
- **Bottom-sheet modals use RN `Modal` + `Animated`, NOT `@gorhom/bottom-sheet`.** gorhom's `present()` + portal silently no-op on the New Architecture (Fabric/Bridgeless) in release builds (rAF-gated mount never flushes). The shared wrapper is `components/bottom-sheet-modal.tsx`; sheet content uses core `ScrollView`/`TextInput`. Don't reintroduce gorhom.
- **Android elevation + `overflow: 'hidden'`** is a documented React Native bug: elevated children inside `overflow: 'hidden'` parents disappear on Android. Use `elevation: 0` on the child, or shadow the parent.

## State management

- **Server state:** TanStack Query. One hook per resource in `hooks/use-*.ts`. Query keys from `@orbit/shared/query/keys.ts`.
- **Client state:** Zustand stores in `stores/*-store.ts`.
- **Offline queue:** mutations queued in SQLite via `queued-api-mutation.ts` when offline; flushed on reconnect. Use for any mutation that should survive flaky connectivity.

## API access

```ts
import { apiClient } from "@/lib/api-client"
import { API } from "@orbit/shared/api"

const habit = await apiClient<Habit>(API.habits.get(id))
```

- `apiClient` reads the JWT from SecureStore and attaches `Authorization: Bearer ...`.
- For mutations that should be retried offline, use `performQueuedApiMutation` from `lib/queued-api-mutation.ts`.

## Styling

- **NativeWind** for class-based styles, OR `StyleSheet.create` for performance-critical surfaces.
- **Tokens via `useTheme()` from `lib/theme-provider.tsx`** — returns v8 OKLCH values resolved for the current scheme + theme mode.
- **`createColors(scheme, mode)`** in `lib/theme.ts` is the source of truth; consumes `@orbit/shared/theme/color-schemes.ts`.

## React 19 / React Compiler rules

React 19 forbids several patterns that worked before. The compiler will fail the build if you violate them:

- **`react-hooks/refs`** — never read `.current` during render. Use `useMemo` to create stable instances (e.g., `Animated.Value`).
- **`react-hooks/set-state-in-effect`** — don't `setState` synchronously inside `useEffect` cleanup or main body. Defer with `void Promise.resolve().then(() => setState(...))` or use the "Adjusting state when a prop changes" pattern: compare prev snapshot during render, setState only on transitions.
- **`react-hooks/preserve-manual-memoization`** — drop unnecessary `useCallback` / `useMemo`; the compiler auto-memoizes.
- **`react-hooks/static-components`** — components must be stable at module level.

## Patterns to mirror

| Want to add… | Look at… |
|---|---|
| New screen | `app/(tabs)/today.tsx` |
| New API call hook | `hooks/use-habits.ts` |
| New Zustand store | `stores/ui-store.ts` |
| New primitive | `components/ui/section-label.tsx` |
| Offline-safe mutation | `hooks/use-update-habit.ts` (search for `performQueuedApiMutation`) |
| Theme-aware component | `components/ui/theme-toggle.tsx` |

## Testing

- Vitest. Config: `vitest.config.ts`.
- React Native's testing-library wraps RN primitives; query by accessibility role or test ID, never by visual class.
- Don't mock the API client at the fetch level — mock at the hook level via `vi.mock('@/hooks/use-...')`.
