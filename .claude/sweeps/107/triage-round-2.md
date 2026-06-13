# Round-2 triage — fix-wave assignments (authoritative)

Baseline committed green: ui-mobile ae5c150, api eee06ae. Round-2 reports in `.claude/sweeps/107/round-2/*.md`. Deferral register from triage-round-1.md still binds (DEF-1..DEF-8, DEF-2b). Global rules from triage-round-1.md still bind (parity on every FE fix; emit i18n to i18n-additions/<agent>.json; no narration comments; behavior tests; no `npm install` except where noted).

Root cause of round-2 findings: Wave-2/3 agents died at the session limit; recovery restored green build/test/lint but did NOT finish feature work. So most FE round-1 fixes must be (re-)applied; the shared/backend/canon SCAFFOLDING already exists.

## New decisions (round 2)

- **D29** contract LOW: `GET /api/habits/logs` (GetAllLogs) has no constant + no callers → DELETE the controller action (rule 2). orbit-api.
- **D30** deps LOW: delete redundant `@next/env` from apps/web/package.json dependencies (next supplies it transitively). No npm install needed (removal only); if lockfile drift, run scoped install + pin verification.
- **D31** quality rule-7 (206 TS fns >100L): Wave-3 splitting is a SEPARATE pass AFTER feature fixes land (see Wave 3 below). Split where it cleanly decomposes; genuine orchestration roots get a one-line justification appended to the deferral register (issue #107 acceptance allows "explicitly justified as an orchestration root"). useChatComposer (web 635 / mobile 652) MUST be attempted.
- **D32** D3 client error-code mapping: COMPLETE it. Backend already carries codes; client has tested `extractBackendErrorCode` + `getFriendlyErrorKey`. Make `getErrorMessage` resolve errorCode→i18n FIRST, fall back to server text. Emit `error-codes.json` is NOT required (client maps by code key). AUTH-FIX owns this.
- **D33** orphaned cores: rewire app hooks to consume shared `tag-selection-core` + `dismiss-guard-core`, DELETE the duplicated app-local logic (fixes rule-10 dup + rule-2 orphan + test-reaches-dead-code in one move).
- **D34** sub-habit tooltip: repoint code from the nonexistent `upgrade.comparison.subHabits.tooltip` to the EXISTING `upgrade.features.subHabits.tooltip` (both platforms). Do NOT mint a new key.

## Fix agents (file-partitioned; each fixes ALL round-2 findings touching ITS files, across every sweep)

### API-FIX (orbit-api, exclusive) — batch 1
- i18n HIGH: controllers still hand-roll `new { error = result.Error }` dropping errorCode (37+ sites: Habits/Goals/ChecklistTemplates/Ai/ApiKeys + AuthController 7 sites) → route ALL failure returns through `ToErrorResult()`/`ToPayGateAwareResult()` so errorCode ships. Preserve each endpoint's status code.
- i18n MED: AiController.cs:335-377 serializes an AppError as `error` (malformed) → use ToErrorBody/ToErrorResult; Chat/Ai/Calendar/Sync inline English literals → ErrorMessages catalog entries.
- perf HIGH: BulkSkipHabitsCommand.cs:42 unfiltered Include(h.Logs) → date-bound filter (mirror BulkLog round-1 fix). perf MED: CreateTagCommand/CreateUserFactCommand/CreateApiKeyCommand materialize-for-count → AnyAsync/CountAsync.
- quality: OAuthAuthorizationStore.cs:18 cleanup-timer catch → log; C# `var data`/`var info` locals → descriptive names (BackgroundServiceHealthCheck, GoalTools×2, HabitTools).
- tests: assert errorCode (not just status) on a representative controller failure + auth; cover ToErrorBody(AppError). Update any controller tests that assert old `{error}`-only shape to also assert errorCode.
- Validate: dotnet build 0/0 + dotnet test green.

### SHELL-FIX (web+mobile) — batch 2
Files: layouts, navigation, overlay primitives (app-overlay/app-date-picker/confirm-dialog/popover/anchored-menu/description-viewer/emoji-picker), overlay-stack lib, onboarding-flow, tour/*, level-up/celebration, push-prompt, upgrade/paywall, achievements/streak pages, satellite/empty-state, not-found, the 6 'use client'-removal files (3 layouts + streak-sections + achievement-category-section + local-image).
- keyboard 13: D27 overlay-stack registration (date-picker F1, emoji F2, description-viewer F3 → ESC resolves top-most LIFO), ConfirmDialog focus-restore F10, ControlsMenu focus-in/arrows/Home/End/restore F8, level-up F7, tour F6, push-prompt F5 ESC+back; D26 dnd KeyboardSensor on habit-list + checklist (coordinate: habit-list file is HABITS-TODAY's — emit handoff for the habit-list dnd half); mobile dead dismissTopOverlay F15.
- ux 12: D28 mobile root ErrorBoundary + web (chat)/error.tsx.
- design 11: onboarding dots width→scaleX (both), tour-tooltip dots (web), 404 GradientTop removal, app-overlay border→inset ring, achievements/profile skeleton radii (profile skeleton may be PROFILE-FIX's — handoff).
- parity 02: upgrade price timeZone+coupon mobile.
- a11y/i18n in shell files.

### HABITS-FORMS-FIX (web+mobile) — batch 2
Files: create/edit-habit-modal, habit-form-fields + sections, sub-habit-editor, reminder sections, checklist editor, tag picker/manage, use-habit-form, use-tag-selection, use-dismiss-guard.
- validation 14: F1+F2 submit-gating (mobile gate on full shared-schema validity, both create+edit); constants adoption (MAX_SCHEDULED_REMINDERS + validateScheduledReminders, MAX_HABIT_TITLE_LENGTH/desc, MAX_GOALS_PER_HABIT) both platforms; sub-habit non-pro flow parity.
- D33: rewire useTagSelection→tag-selection-core, useDismissGuard→dismiss-guard-core; delete dup logic.
- D34: repoint sub-habit tooltip key.
- design 11: .collapsible grid-rows + mobile LayoutAnimation → opacity/translateY (D9, both).
- a11y 04: bad-habit checkbox display:none→sr-only focusable; remove-reminder X ≥44 (both); accessibilityRole on form pressables; fg-4→fg-3 + status-text token migration for these files.
- i18n/dead-code (use-habit-form dead exports if any).

### HABITS-TODAY-FIX (web+mobile) — batch 3
Files: habit-list, habit-row, today page/(tabs)/index + today-shell, date-group-section, drill panel, bulk-action bar, use-habit-queries, use-habits, use-drill-navigation, use-bulk-actions, use-horizontal-swipe, habit-mutation-helpers, habit-optimistic-helpers, actions/habits.ts.
- parity 02: invalidation drift (count()/profileKeys/skip scope/error-path).
- keyboard 13: drill ESC F4 (web), habit-list dnd KeyboardSensor (D26, from shell handoff), focus rings; statusDot mobile wiring.
- design 11: refetch indicator height→scaleY.
- a11y 04: expand chevron 14×14 (web) + drill chevron 16×16 (mobile) →≥44; statusDot keys mobile; accessibilityRole; fg-4→fg-3/status-text migration.
- perf 03: PanResponder→RNGH Gesture.Pan (D25); confirm round-1 already-applied items.
- architecture 07: actions/habits.ts 15 raw paths→API.habits.*; aiKeys inline (advanced page is PROFILE's — coordinate).
- DEF-2b: do NOT split HabitList/TodayScreen main fns.

### PROFILE-FIX (web+mobile) — batch 3
Files: profile/preferences/advanced/ai-settings/about pages+screens, delete-account, edit-name, api-key modal, widget dialog, profile/api-key/user-facts/widget hooks, actions/profile.ts, lib/supabase.ts.
- validation 14: API-key expiry mobile→shared parseApiKeyExpiryUtc + orbitMcp.invalidExpiry key; name cap mobile→MAX_API_KEY_NAME_LENGTH.
- security 05: lib/supabase.ts env-or-throw (D24).
- ux 12: raw error.message (profile.tsx:542 mobile, create-key mobile), fetchApiKeys swallow→error (web), user-facts error branch (both), fact-pill translate (web ai-settings:92), widget dialog parity (mobile WIDGET_FEATURES), delete-account offline copy.
- i18n: orbitMcp.invalidExpiry, auth.minutesShort, updatePrompt.version (emit copy), ai-settings category.
- architecture 07: actions/profile.ts 13 raw paths→API.profile.*; aiKeys.capabilities() in advanced page (both platforms).
- quality 06: preferences/page.tsx:92 swallow+reload parity (mobile rolls back); auth-api dead exports (getTokenExpiry/isTokenRefreshRequired/getAuthToken).
- a11y in these files.

### GOALS-CHAT-FIX (web+mobile) — batch 4
Files: goals/* (lists, detail-drawer, create/edit modals, progress, metrics), breakdown-suggestion (both), use-goal-queries, chat pages/screens, chat components, use-chat-* (incl use-chat-reward), actions/goals.ts.
- parity 02: breakdown frequency-quantity editor mobile; retrospective regenerate web (or remove mobile — judge).
- ux 12: breakdown F16 inverted-error ternary (both); chat error states.
- validation 14: goal unit maxLength→MAX_GOAL_UNIT_LENGTH (4 modals); goal noValidate + suppress native min bubble.
- design 11: (goal status-as-text → status-overdue-text token — a11y overlap).
- a11y 04: goals status-text token migration; roles; goal-list FlatList (perf 03).
- D33 overlap: breakdown-suggestion uses shared buildBreakdownCreateRequest/highlightText (verify wired).
- architecture 07: actions/goals.ts 7 raw paths→API.goals.*.
- i18n.

### CAL-NOTIF-FIX (web+mobile) — batch 4
Files: calendar/calendar-sync pages+screens, calendar-grid, calendar-import-prompt, use-calendar-data/use-timezone-auto-sync, notification-bell, use-push-notifications/preferences, notification components, actions/calendar.ts + notifications.ts.
- parity 02: calendar-import prompt mobile tour-gating (hasCompletedTour); calendar-events TanStack hook mobile.
- perf 03: notification-bell .map→FlatList; calendar day-entries→FlatList.
- ux 12: offline copy F15 (the 7 mobile surfaces borrowing calendarSync.notConnected → proper chat.offline.* keys; merge the staged chat.json); calendar-sync empty/loading states mobile.
- design 11: use-push-notifications lightColor '#7f46f7'→tintFromPrimary.
- a11y 04: calendar day-cell completion text/icon equiv (both); roles.
- architecture 07: actions/{calendar,notifications}.ts raw paths→constants.
- i18n: "Google Calendar" → calendar.title (if both locales render exactly that); push error strings.

### AUTH-FIX (web+mobile) — batch 5 (never launched in wave 2)
Files: login screens/pages, use-login-flow, use-login-code-entry, auth-store, google-auth, auth-callback, login-form-helpers, BFF auth routes (web app/api/auth/*), shared getErrorMessage/auth-login.
- parity 02: wasReactivated notice mobile; OTP auto-verify convergence (manual 6th digit + deep-link on web).
- security 05: BFF auth routes Zod-parse bodies (D23) + log-on-500.
- D32: complete client error-code mapping (getErrorMessage resolves code→i18n first).
- architecture 07: actions/auth.ts 2 raw paths (Server Actions); mobile auth-store/google-auth raw fetch→apiClient + dedup mergeRequestIdIntoPayload.
- tests 09: mobile google-auth, BFF auth routes, use-login-code-entry, account-deletion state machine (PROFILE may co-own — coordinate).

### CLEANUP-FIX (small; me or one agent) — batch 5
- D29 delete GetAllLogs endpoint (orbit-api). D30 remove @next/env. quality dead exports: mobile motion.ts (4), typography.ts (resolveFontFamily/typeRoleStyle), 21 shared types/* dead exports (D13-verified list in 06-quality.md). architecture: i18n.ts default→named; use-billing/use-summary inline key factories→shared; 6 'use client' removals (if not in SHELL set).

## Central i18n merge (after all FE agents) — W2.5 redo
Merge every i18n-additions/*.json (incl. the pre-staged chat.json) into BOTH en.json + pt-BR.json; verify parity (counts equal); re-run the referenced-but-missing scan to confirm zero.

## Wave 3 — TS function splits (after feature fixes + validation green)
Partition the 206 rule-7 fns by directory; split where clean (extract well-named subcomponents/helpers, behavior-identical, tests stay green); genuine orchestration roots → append one-line justification to deferral register. Round-3 quality sweep gets the expanded register.

## Sequence
batch1 API-FIX ∥ → commit → batch2 (SHELL,HABITS-FORMS) → commit → batch3 (HABITS-TODAY,PROFILE) → commit → batch4 (GOALS-CHAT,CAL-NOTIF) → commit → batch5 (AUTH,CLEANUP) → commit → central i18n merge → validate both repos → Wave 3 splits → validate → round-3 battery.
