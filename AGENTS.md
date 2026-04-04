# Orbit UI

Personal habit tracker frontend. Nuxt 4 + Vue 3, consumes .NET 10 REST API via BFF.

## Stack

- **Framework:** Nuxt 4.3.1, Vue 3.5, TypeScript
- **UI:** Nuxt UI v4 (4.4.0), Tailwind CSS v4, Manrope font
- **State:** Pinia (composition API, normalized Map-based stores)
- **i18n:** @nuxtjs/i18n with en + pt-BR locales
- **Utilities:** date-fns + @date-fns/tz, Zod validation, VueUse
- **Other:** vue-draggable-plus (reorder), vue3-calendar-heatmap
- **Mobile:** Capacitor 8 (@capacitor/core, @capacitor/android, @capacitor/push-notifications, @capacitor/browser, @capacitor/app, @capawesome/capacitor-app-update)

## Dev Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npx cap sync android # Sync web assets + plugins to Android project
npx cap open android # Open Android project in Android Studio
```

API defaults to `http://localhost:5000` (override via `NUXT_PUBLIC_API_BASE`).
Production: `https://app.useorbit.org` (Vercel), API: `https://api.useorbit.org` (Render).

## Architecture

### Directory Layout

```
app/
  pages/          # 12 routes: index, login, chat, calendar, calendar-sync, profile, settings, support, retrospective, achievements, upgrade, r/[code]
  components/     # Feature-organized: habits/, chat/, calendar/, navigation/, onboarding/
  stores/         # auth, habits, profile, user-facts, onboarding, chat (Pinia composition API)
  composables/    # useAPI, useAdMob, useApiKeys, useAppUpdate, useBilling, useCalendarData, useChatScroll, useChecklistTemplates, useColorScheme, useDateFormat, useErrorToast, useGoalLinking, useHabitForm, useHabitMetrics, useHomeConfig, useNotifications, useOrbitConfig, usePullToRefresh, usePushNotifications, useReferral, useRetrospective, useSpeechToText, useStreakFreeze, useSubscriptionPlans, useSummary, useSupabase, useTagSelection, useThemeMode, useTimeFormat
  types/          # TypeScript interfaces per domain
  middleware/     # auth (protect routes), guest (redirect logged-in users)
  plugins/        # api.ts ($fetch with 401 handling), color-scheme.client.ts (apply theme on load)
  layouts/        # default, auth, chat
  assets/css/     # Tailwind theme with dark-mode design tokens, orbit animations
  utils/          # dates.ts (parseAPIDate, formatAPIDate), timezones, errors.ts (getErrorMessage, extractBackendError)
server/
  api/            # BFF routes -- proxy to .NET backend
    habits/       # Schedule-aware paginated queries, CRUD, log, metrics
    [id]/         # Sub-routes: log, logs, metrics, parent, sub-habits, checklist
    [...path].ts  # Catch-all proxy for auth, profile, chat, userfacts, support
  utils/          # apiClient.ts (server-side API client with JWT forwarding), authCookie.ts (shared setCookie helper)
i18n/locales/     # en.json, pt-BR.json
```

### BFF (Backend for Frontend)


All API calls go through Nuxt server routes (`server/api/`), never directly to the .NET backend. The BFF forwards JWT from cookies as Bearer tokens. See `.claude/rules/architecture.md` for full patterns.

All API calls go through Nuxt server routes (`server/api/`), never directly to the .NET backend.

- **Auth handling:** The BFF reads the JWT from the `auth_token` cookie and forwards it as a `Bearer` token to the .NET API. The frontend plugin (`api.ts`) uses same-origin requests -- no explicit auth headers needed client-side.
- **Habit routes:** Specific BFF routes in `server/api/habits/` for each operation. The `GET /api/habits` route proxies the paginated, schedule-aware endpoint.
- **Other routes:** `server/api/[...path].ts` is a catch-all proxy for non-habit endpoints. Uses a path allowlist (`auth/`, `profile/`, `chat/`, `user-facts/`, `support/`, `tags/`, `notification/`, `subscription/`, `config/`, `calendar/`, `goals/`, `referral/`, `gamification/`) -- returns 404 for unlisted paths.

### Key Patterns

- **Auth:** JWT stored in cookie (7-day, sameSite strict, secure always). No refresh token. Client-side expiry monitor warns at 5min, auto-logouts at 0. Profile store forces logout on 401/404 (handles DB wipes gracefully).
- **State:** Habits store uses `Map<string, NormalizedHabit>` for O(1) lookups. All fetches are client-side only (no SSR). Store tracks pagination state (currentPage, totalPages, totalCount).
- **API:** Single `$api` instance via plugin. Composable `useAPI()` wraps `useFetch`. All endpoints under `/api/` route through BFF.
- **Habits query:** `GET /api/habits` requires `dateFrom` and `dateTo`. The habits page sends a single day + `includeOverdue=true` for today. The calendar sends a full month range. The backend computes `scheduledDates[]` and `isOverdue` per habit.
- **Date navigation:** The index page has arrow-based date navigation (prev/next day) with slide animations. Changing the date triggers a new API call with the selected date as `dateFrom`/`dateTo`.
- **Dates:** Always parse `YYYY-MM-DD` as local (not UTC). Use date-fns throughout. The browser's `new Date()` already uses the user's local timezone, so no special handling is needed on the frontend.
- **Modals:** `AppOverlay` component adapts between bottom-sheet (mobile) and centered modal (desktop).
- **Theme:** Dark-only with customizable accent color. 6 color schemes (purple, blue, green, rose, orange, cyan) stored in cookie. CSS custom properties (`--color-primary`, `--color-background`, `--color-surface`, etc.) are swapped at runtime via `useColorScheme`. Shadow colors use `var(--primary-shadow)` for dynamic tinting. Fluid typography with clamp() from 320-720px viewport.
- **Container:** All pages share CSS variables `--app-max-w: 640px` and `--app-px: 1.25rem/1.5rem` defined in main.css. Layouts apply `max-w-[var(--app-max-w)] px-[var(--app-px)] mx-auto`. Pages do NOT add their own horizontal padding -- the layout handles it. Fixed/teleported elements (bulk action bar, bottom nav) must use the same variables.
- **Schedule logic:** All frequency/day-of-week calculations happen on the backend (`HabitScheduleService`). The frontend never computes whether a habit is due on a date.
- **Onboarding:** Hybrid system: 2-slide wizard (welcome + missions intro) gated by `hasCompletedOnboarding` from profile API. After wizard, persistent mission checklist on Today page with 6 missions (create habit, complete habit, chat, calendar, customize, guide). Mission completion tracked in localStorage, dismiss state in backend (`hasDismissedMissions`). Missions auto-dismiss when all complete.
- **Feature Guide:** `FeatureGuideDrawer` component uses `AppOverlay` (not UDrawer). Accessible from profile page. Five tabbed sections (Habits, AI Chat, Calendar, Settings, Notifications) with comprehensive i18n content covering all features.
- **AI Summary:** `HabitSummaryCard` displays AI-generated daily summary at top of Today view. `useSummary` composable fetches from `GET /api/habits/summary`. Card shows skeleton while loading, auto-refreshes on habit changes.
- **AI Retrospective:** Pro-only feature accessible from Profile. `useRetrospective` composable calls `GET /api/habits/retrospective?period=week&language=en`. Unlike summary, does NOT auto-fetch -- user explicitly triggers via button. Periods: week (7d), month (30d), quarter (90d), semester (180d), year (365d). Backend caches results for 1 hour. Locked state shown for non-Pro users with upgrade CTA.
- **AI Chat:** Sends conversation history (last 10 messages) with each request for multi-turn context. AI can create, update, delete habits, log completions, suggest breakdowns, assign tags, analyze progress, explain app features, and do smart rescheduling. Chat page has animated "waiting" orb, Escape key to close, voice input with language picker, and image upload.
- **Slip Alerts:** Bad habits can have `slipAlertEnabled` toggle. Backend `SlipPatternDetectionService` analyzes last 60 days of logs to detect day-of-week and optional time-of-day patterns. `SlipAlertSchedulerService` (background, every 5 min) sends AI-generated motivational push + bell notifications before predicted slip windows. Day-only patterns trigger at 8 AM; time-aware patterns trigger 2h before peak. Weekly cap via `SentSlipAlert` entity. AI chat defaults `slipAlertEnabled: true` when creating bad habits.
- **Checklists:** Habits can have inline checklists (`ChecklistItem[]` stored as jsonb). `HabitChecklist` component has two modes: `editable` (form -- add/remove/edit items) and `interactive` (detail drawer -- toggle checkboxes with auto-save via `PUT /api/habits/{id}/checklist`). Checklist auto-resets (unchecks all) when a recurring habit is logged. Detail drawer shows reset/clear-all actions. `ChecklistTemplates` component saves/loads reusable item sets via `useChecklistTemplates` composable (localStorage). HabitCard shows progress badge (e.g., "3/8"). AI chat uses `checklistItems` instead of sub-habits for simple item lists (shopping lists, packing lists).
- **Flexible habits:** `isFlexible` flag. "Complete N times per week/month" instead of specific days. Backend tracks completions per window.
- **General habits:** No `frequencyUnit`, no schedule. Always visible when "Show general on Today" is enabled. Fetched separately via `isGeneral=true` filter.
- **Goals:** `GoalCard`, `GoalDetailDrawer`, `CreateGoalModal`, `EditGoalModal`, `GoalMetricsPanel` components. `goalsStore` (Pinia). Types in `types/goal.ts`. CRUD via BFF `/api/goals/`. Pro-gated via `IPayGateService.CanCreateGoals`. Tracking status: `on_track | at_risk | behind | no_deadline | completed`.
- **Gamification:** `AchievementCard`, `AchievementToast`, `LevelUpOverlay` components. `gamificationStore` fetches profile + achievements. Pro-only. XP/levels computed server-side. Uses `$fetch` directly (bypasses `$api` to avoid 403 redirect).
- **Referral:** `ReferralDrawer` component, `useReferral` composable. Code stored in `referral_code` cookie (7-day, secure, strict). Applied during signup. Both parties receive Stripe discount coupons. Stats via `GET /api/referral/stats`.
- **Page structure:** Profile is a clean hub linking to Retrospective, Settings, and Support. Settings page has language, color scheme, AI toggles, user facts, timezone. Support page has contact form. Both have back arrows to profile.
- **Page transitions:** Global `pageTransition` and `layoutTransition` configured in nuxt.config with subtle scale/fade animations.
- **Timezone auto-detect:** On first login, if timezone is still UTC, browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` is detected and saved automatically.
- **Language sync:** Database is source of truth. On profile load, the frontend locale and `i18n_locale` cookie are synced to match the DB language. If DB has no language (first login), browser language is detected and saved to DB. Composable refs (`useI18n`, `useCookie`, `useSwitchLocalePath`) must be captured before any `await` in `loadProfile` to preserve Nuxt context.
- **Signup flow:** Register creates account only, then redirects to login form with success message. No auto-login after signup.
- **Profile loading:** Default layout calls `loadProfile()` on mount (with `isLoaded` guard). This ensures onboarding state is available on all pages, not just profile.
- **Capacitor:** `capacitor.config.ts` with `server.url: 'https://app.useorbit.org'` -- native app loads web app from server (no bundled assets). `android/` directory is gitignored. `google-services.json` goes in `android/app/`. Push uses `@capacitor/push-notifications` (FCM) on native, Web Push (VAPID) on browser. `usePushNotifications` composable detects platform via `Capacitor.isNativePlatform()`. Google OAuth uses `@capacitor/browser` (Chrome Custom Tab) because Google blocks WebView OAuth (403 disallowed_useragent). Deep link plugin (`capacitor-deep-links.client.ts`) catches `app.useorbit.org/auth-callback` URLs after OAuth. To build APK: `npm run build && npx cap sync android`, then Build APK in Android Studio. Frontend updates deploy via Vercel -- no APK rebuild needed unless native plugins change.
- **App Update Prompt:** `useAppUpdate` composable checks for Play Store updates via `@capawesome/capacitor-app-update` on mount and app resume. Web users are unaffected (native guard). Session-scoped dismiss (resets on resume from background). `UpdatePrompt` component in default layout shows a dismissible banner matching `PushPrompt` style.
- **Android Widget:** Native home screen widget showing today's habits (completion status, due time, checklist progress). All native code lives in `android/` (gitignored). Key files: `widget/OrbitWidgetPlugin.kt` (Capacitor bridge for token sync), `widget/OrbitWidgetProvider.kt` (lifecycle), `widget/OrbitWidgetService.kt` (API fetch + RemoteViews), `widget/OrbitWidgetWorker.kt` (WorkManager 30-min sync). Auth reads JWT from WebView `CookieManager` as fallback (since frontend loads remotely, JS bridge isn't always available). Widget calls .NET API directly (`https://api.useorbit.org/api/habits`). Smart fallback: no habits today shows tomorrow with "Tomorrow" header. Widget refreshes on app background (`MainActivity.onStop`), WorkManager periodic, and FCM push. Frontend bridge: `capacitor-widget.client.ts` registers `OrbitWidget` plugin, auth store calls `saveToken`/`clearToken` on login/logout (takes effect after deploy). Tap opens app via launch intent. RemoteViews constraints: only `TextView`, `ImageView`, `LinearLayout`, `RelativeLayout`, `ListView` etc -- no plain `View` or custom views.

## Coding Conventions

- Vue 3 `<script setup lang="ts">` for all components
- Nuxt UI v4 components (UButton, UInput, UModal, UDrawer, UBadge, etc.)
- i18n: use `$t('key')` in templates, `t('key')` in setup. All user-facing strings must be translated.
- Tailwind utility classes directly in templates. Design tokens via CSS custom properties in main.css.
- CSS utility classes: `.form-label` (uppercase muted label) and `.form-input` (standard text input) defined in main.css. Use these instead of repeating the full class strings.
- Zod schemas for form validation (login/register)

### Validation

- **Every new feature must include validation for all invalid/edge-case scenarios**, both on the frontend (inline errors + submit blocking) and backend (domain entity + FluentValidation).
- Never assume "the backend will catch it" -- validate on both sides. The frontend provides instant UX feedback; the backend is the safety net.
- Examples: date ranges (end must be after start), time ranges (end time must be after start time), numeric bounds, mutually exclusive options, required fields.

### DRY Patterns

- **Tag selection:** Use `useTagSelection()` composable for all tag CRUD + selection state. Never duplicate tag logic between modals.
- **Habit form logic:** Use `useHabitForm(state)` composable for shared form computeds and functions (isOneTime, daysList, frequencyUnits, toggleDay, formatTimeInput, setOneTime, setRecurring).
- **Habit form template:** Use `<HabitFormFields>` component with slot for modal-specific content (e.g., sub-habits in create). Never duplicate form field templates between Create/Edit modals.
- **Error extraction:** Use `getErrorMessage()` and `extractBackendError()` from `utils/errors.ts`. Never duplicate error narrowing logic.
- **Auth cookie:** Use `setAuthCookie(event, token)` from `server/utils/authCookie.ts` in BFF auth routes. Never duplicate setCookie options.

### Security

- **Open redirect prevention:** All `returnUrl` params must be validated: must start with `/` and not `//`. Applied in login.vue, auth-callback.vue, and auth middleware.
- **BFF path allowlist:** The catch-all proxy only forwards requests matching allowed prefixes. Add new API routes to the allowlist in `server/api/[...path].ts`.
- **Source maps:** Disabled in production (`sourcemap: { server: false, client: false }` in nuxt.config).
- **Cookie security:** Auth cookie uses `sameSite: 'strict'` and `secure: true` always (not just in prod).

### Component Auto-Import

`pathPrefix: false` in nuxt.config -- components are named by **filename only**, no directory prefix. `components/onboarding/FeatureGuideDrawer.vue` registers as `<FeatureGuideDrawer>`, NOT `<OnboardingFeatureGuideDrawer>`. Always check `.nuxt/components.d.ts` when unsure.

### TypeScript Strictness

- **Zero `any`:** Never use `any` in app/ code. Use proper types, `unknown` with narrowing, or specific type assertions.
- **Error handling:** Always `catch (err: unknown)`. Narrow with typed assertions: `(err as { data?: { error?: string } })?.data?.error`. Use `getErrorMessage()` and `extractBackendError()` from `utils/errors.ts` for this pattern.
- **Shared types:** Use `FrequencyUnit` from `~/types/habit` instead of inline `'Day' | 'Week' | 'Month' | 'Year'` unions. Keep type aliases in `types/` and import them.
- **Non-null assertions:** Prefer nullish coalescing (`?? []`, `?? ''`) or guards (`if (!x) continue`) over `!` assertions.
- **No `console.log/error/warn`:** Errors are handled by stores and surfaced via reactive `error` refs. Do not leave console statements in production code.
- **JSON files:** No trailing commas in `.json` files (i18n locales, package.json). JSON !== JavaScript.

### i18n

- All user-facing strings go through i18n -- never hardcode display text (labels, units, day names).
- Enum values sent to the API stay in English (`'Day'`, `'Monday'`); use `{value, label}` objects for selects/pickers where `label` calls `t()`.
- i18n keys for frequency units: `habits.form.unitDay`, `habits.form.unitWeek`, etc.
- i18n keys for day names: `dates.days.*` (full) and `dates.daysShort.*` (abbreviated).
- **pt-BR accents:** Always use proper diacritical marks in Portuguese strings (accents, tildes, cedillas). Examples: "ação" not "acao", "amanhã" not "amanha", "até" not "ate", "você" not "voce".

## Key Types

- `ChecklistItem` - Checklist entry: `{ text: string, isChecked: boolean }`
- `BaseHabitFields` - Shared fields (id, title, description, frequencyUnit, frequencyQuantity, isBadHabit, isCompleted, days, dueDate, dueTime, position, checklistItems) extended by all habit types
- `HabitScheduleItem` - Paginated GET response: extends BaseHabitFields with `scheduledDates: string[]` and `isOverdue: boolean`
- `HabitDetail` - GET by ID response: extends BaseHabitFields with `createdAtUtc` and `children`
- `NormalizedHabit` - Pinia store: extends BaseHabitFields with `scheduledDates`, `isOverdue`, `parentId`, `slipAlertEnabled`
- `HabitsFilter` - Query params: requires `dateFrom` and `dateTo`, optional `includeOverdue`, `search`, `frequencyUnit`, `isCompleted`, `page`, `pageSize`
- `PaginatedResponse<T>` - Generic wrapper: `items`, `page`, `pageSize`, `totalCount`, `totalPages`
- `AiActionType` - Chat action types: `CreateHabit`, `LogHabit`, `UpdateHabit`, `DeleteHabit`, `SuggestBreakdown`, `AssignTags`
- `ColorScheme` - Theme options: `purple`, `blue`, `green`, `rose`, `orange`, `cyan`

## Nuxt UI v4 Gotchas

- `UDrawer`: default slot = trigger. Use `title` prop + `#body`/`#footer` for content (NOT `#content`).
- `UModal`: use `v-model:open` with a writable `ref` only. Do NOT use a readonly `computed`. Do NOT combine with `v-if` -- prevents reka-ui Dialog transitions. For conditional mounting (e.g., onboarding wizard), wrap the `<UModal>` in a parent `v-if` instead.

## Working Principles

### Plan First

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If an approach goes sideways, STOP and re-plan immediately -- don't keep pushing a broken path.
- Write specs upfront to reduce ambiguity. Use plan mode for verification, not just building.

### Best Approach Only -- No Workarounds

- **ALWAYS use the best possible approach.** Never settle for workarounds, hacks, or "good enough" solutions. If the ideal approach exists, use it.
- Find root causes. No temporary fixes. No band-aids. Senior developer standards.
- Make every change as simple as possible. Impact minimal code.
- For non-trivial changes: pause and ask "is there a more elegant way?"
- Skip elegance checks for simple, obvious fixes -- don't over-engineer.
- If a workaround is tempting, STOP and find the proper solution. Ask if unsure.

### Verification Before Done

- Never mark a task complete without proving it works.
- Ask: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness.
- Diff behavior between main and your changes when relevant.

### Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests -- then resolve them.
- Zero context switching required from the user.

### Subagent Strategy

- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- One task per subagent for focused execution.

### Self-Improvement

- After any correction from the user: capture the lesson so the same mistake doesn't repeat.
- Write rules that prevent the pattern, not just fix the instance.

## Git Workflow

Branch protection is enforced on `main`. No direct pushes, no force pushes, no branch deletion.

### Branching Convention

- `feature/xxx` -- new features
- `fix/xxx` -- bugfixes
- `chore/xxx` -- maintenance, config, docs

### Merge Strategy

- **Squash merge only** -- keeps `main` history linear and clean
- Squash commit uses PR title + PR body
- Head branches auto-delete after merge

### Workflow

```bash
# 1. Create branch from main
git checkout main && git pull
git checkout -b feature/my-change

# 2. Work and commit
git add <files> && git commit -m "description"

# 3. Push and create PR
git push -u origin feature/my-change
gh pr create --fill

# 4. Merge via squash
gh pr merge --squash
```

### Rules

- Never push directly to `main` -- always go through a PR
- Never force push to `main`
- Keep PRs focused: one feature or fix per PR
- Branch names should be descriptive: `feature/add-tags-to-habits`, `fix/login-redirect`
- **Never reuse a branch after its PR is squash-merged.** Always create a fresh branch from updated `main`. Reusing branches after squash merge causes repeated merge conflicts because the branch history diverges from main's squashed version.

## Testing

- **Unit:** 131 tests (Vitest + Vue Test Utils + happy-dom). Run: `npx vitest run`
- **E2E:** 75+ tests (Playwright) in `e2e/tests/`. Run: `npm run test:e2e`
- Every new feature must include unit tests AND E2E tests.
- See `.claude/rules/testing.md` for conventions.

## Planning

GSD planning docs in `.planning/`. Current milestone: v1.5 Onboarding & Feature Guide (completed). See `.planning/STATE.md` for status.
