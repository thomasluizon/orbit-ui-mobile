# Sweep 06 — Code Quality (the 10 Code Standards) — issue #107, ROUND 2

Date: 2026-06-12 · Read-only re-audit of WORKING TREES at the committed green baseline.
- orbit-ui-mobile: `main` @ ae5c150 ("recovery: repair partial wave-2 state to green build/test/lint").
- orbit-api: `chore/107-code-health-sweep` @ eee06ae ("recovery: complete error-code refactor + fix test assertions to green").

Method: `npm run lint` + `npm run type-check` per workspace (both 3/3 green, zero warnings — logs reviewed, not just exit codes) + AST measurement scripts (`.claude/sweeps/107/round-2/*.mjs`, read-only) + ripgrep evidence scans + per-symbol importer verification (word-boundary, excluding declaring file, barrels, `android/`, `build/`).

DEF-1..DEF-8 + DEF-2b honored — never reported as findings.

## Headline: round-1 fixes landed UNEVENLY

The "recovery" commits reverted most TS work to green but did NOT carry the wave-2/wave-3 TS fixes. Concretely:
- **C# Rule 7 (API-D 11 splits): ALL 11 CONFIRMED FIXED** — every method now <100L (measured individually). Zero C# function-size findings remain.
- **C# Rule 8 (2 MED audit-write swallows): BOTH CONFIRMED FIXED** — `AgentOperationExecutor.TryAuditAsync` and `WebApplicationExtensions` legacy-MCP catch now log via `LoggerMessage`.
- **C# Rule 5 (OAuthLoginPage embedded-JS narration): CONFIRMED FIXED** — zero `//` comments in the script template now.
- **SHARED Rule 10: PARTIAL** — ~17 cores lifted (tag-selection-core, dismiss-guard-core, highlight-text, etc. now exist in `packages/shared`), BUT the app-level hooks/components were NOT refactored to consume them, so 24 byte-identical ≥300-char bodies remain.
- **TS Rule 7 (function size): ~ZERO PROGRESS** — 210 functions >100L now vs 211 in round-1; 206 identical keys + 4 line-shifted (same functions). Wave-3 (D11) effectively not applied.
- **TS Rule 2 (dead code): ~ZERO PROGRESS** — every app/lib/util/theme/chat dead export re-verified as STILL dead. The DEPS cleanup did not remove them.

---

## Findings

### Rule 7 — TS function size (>100 lines). 210 functions still over cap; 206 are byte-for-byte the same as round-1.

DEF-2b exempts only: web+mobile `HabitList`, mobile `TodayScreen`, mobile `ProfileScreen` (4). Everything else below is a finding. Full list measured in `.claude/sweeps/107/round-2/measure-fns.mjs` output; the top of the distribution (all HIGH · rule 7 · split into subcomponents/sub-hooks):

- HIGH · apps/mobile/app/calendar-sync.tsx:88 · rule 7 · `CalendarSyncScreen` 678L
- HIGH · apps/mobile/hooks/use-chat-composer.ts:141 · rule 7 · `useChatComposer` 652L (D11 said "attempt split"; NOT split → now a finding)
- HIGH · apps/web/hooks/use-chat-composer.ts:102 · rule 7 · `useChatComposer` 635L (same)
- HIGH · apps/web/components/habits/habit-form-fields.tsx:871 · rule 7 · `HabitFormFields` 631L
- HIGH · apps/web/app/(app)/page.tsx:62 · rule 7 · `TodayPage` 629L
- HIGH · apps/mobile/app/upgrade.tsx:329 · rule 7 · `UpgradeScreen` 592L
- HIGH · apps/web/app/(chat)/chat/page.tsx:37 · rule 7 · `ChatPage` 554L
- HIGH · apps/web/app/(app)/advanced/page.tsx:130 · rule 7 · `AdvancedPage` 540L
- HIGH · apps/mobile/app/ai-settings.tsx:58 · rule 7 · `AiSettingsScreen` 535L
- HIGH · apps/web/app/(app)/calendar-sync/page.tsx:260 · rule 7 · `CalendarSyncPage` 532L
- HIGH · apps/mobile/app/login.tsx:87 · rule 7 · `LoginScreen` 523L
- HIGH · apps/web/components/goals/goal-detail-drawer.tsx:141 · rule 7 · `GoalDetailDrawer` 490L
- HIGH · apps/mobile/components/goals/goal-detail-drawer.tsx:55 · rule 7 · `GoalDetailDrawer` 472L
- HIGH · apps/mobile/components/habits/habit-form-fields/styles.ts:233 · rule 7 · `createStyles` 453L (style factory)
- HIGH · apps/mobile/app/advanced.tsx:52 · rule 7 · `AdvancedScreen` 432L
- HIGH · apps/mobile/app/(tabs)/calendar.tsx:109 · rule 7 · `CalendarScreen` 411L
- … (continues; **206 total** at exact round-1 keys + 4 line-shifted: chat-composer-input.tsx:26, message-bubble.tsx:250 createStyles, create-api-key-modal.tsx:23 `CreateApiKeyModal` + :192 `CreateStep`)

Net: **206 still-open** (after removing the 4 DEF-2b exemptions from the 210). All HIGH.

### Rule 10 — DRY: 24 byte-identical web↔mobile function bodies ≥300 normalized chars NOT lifted to shared.

Measured by AST body extraction + whitespace/quote normalization (`measure-dup.mjs`). Round-1 had 41; SHARED agent lifted ~17 cores but left these. NOTE: for `useTagSelection`, `useDismissGuard`, `highlightText` a shared core EXISTS but neither app imports it — the duplication is live (e.g. `apps/mobile/components/ui/highlight-text.tsx` imports only react/theme, not `@orbit/shared/utils`). All MED · rule 10 · extract to packages/shared (or wire apps to the already-lifted core):

- MED · apps/web/hooks/use-tag-selection.ts:58 + apps/mobile/hooks/use-tag-selection.ts:56 · rule 10 · `useTagSelection` (3717 chars; shared core `tag-selection-core.ts` exists but unused by apps)
- MED · apps/web/components/chat/breakdown-suggestion.tsx:106 + apps/mobile/.../breakdown-suggestion.tsx:125 · rule 10 · `handleConfirm` (1165)
- MED · apps/web/components/ui/highlight-text.tsx:15 + apps/mobile/components/ui/highlight-text.tsx:21 · rule 10 · `highlightText` (594; shared `utils/highlight-text.ts` exists but unused)
- MED · apps/web/hooks/use-tag-selection.ts:145 + apps/mobile/hooks/use-tag-selection.ts:143 · rule 10 · `deleteTag` (550)
- MED · apps/web/components/onboarding/onboarding-create-goal.tsx:74 + apps/mobile/.../onboarding-create-goal.tsx:113 · rule 10 · anon (543)
- MED · apps/web/hooks/use-tour-mock-data.ts:66 + apps/mobile/hooks/use-tour-mock-data.ts:65 · rule 10 · `restore` (528)
- MED · apps/web/components/goals/edit-goal-modal.tsx:80 + apps/mobile/components/goals/create-goal-modal.tsx:117 · rule 10 · anon (527)
- MED · apps/web/hooks/use-dismiss-guard.ts:10 + apps/mobile/hooks/use-dismiss-guard.ts:8 · rule 10 · `useDismissGuard` (513; shared `dismiss-guard-core.ts` exists but unused)
- MED · apps/web/hooks/use-tags.ts:186 + apps/mobile/hooks/use-tags.ts:246 · rule 10 · `onMutate` (471)
- MED · apps/web/hooks/use-tags.ts:217 + apps/mobile/hooks/use-tags.ts:294 · rule 10 · `onMutate` (449)
- MED · apps/web/lib/pending-notification-deletes.ts:33 + apps/mobile/lib/pending-notification-deletes.ts:33 · rule 10 · `queuePendingNotificationDelete` (421)
- MED · apps/web/hooks/use-tag-selection.ts:178 + apps/mobile/hooks/use-tag-selection.ts:176 · rule 10 · `createAndSelectTag` (414)
- MED · apps/web/app/(app)/support/page.tsx:150 + apps/mobile/app/support.tsx:149 · rule 10 · `validateForm` (413)
- MED · apps/web/hooks/use-checklist-templates.ts:42 + apps/mobile/hooks/use-checklist-templates.ts:38 · rule 10 · `onMutate` (407)
- MED · apps/web/app/(app)/advanced/page.tsx:155 + apps/mobile/app/advanced.tsx:83 · rule 10 · `scopeOptions` (392)
- MED · apps/web/components/habits/create-habit-modal.tsx:160 + apps/mobile/components/habits/create-habit-modal.tsx:186 · rule 10 · anon (392)
- MED · apps/web/app/(app)/streak/page.tsx:45 + apps/mobile/app/streak.tsx:71 · rule 10 · `encouragement` (382)
- MED · apps/web/components/onboarding/onboarding-complete.tsx:35 + apps/mobile/.../onboarding-complete.tsx:109 · rule 10 · `recapItems` (367)
- MED · apps/web/hooks/use-habit-form.ts:175 + apps/mobile/hooks/use-habit-form.ts:176 · rule 10 · `setGeneral` (357)
- MED · apps/web/hooks/use-habits.ts:141 + apps/mobile/lib/habit-mutation-helpers.ts:374 · rule 10 · `findCachedGoals` (351)
- MED · apps/web/hooks/use-tags.ts:249 + apps/mobile/hooks/use-tags.ts:346 · rule 10 · `onMutate` (345)
- MED · apps/web/hooks/use-tour-mock-data.ts:46 + apps/mobile/hooks/use-tour-mock-data.ts:45 · rule 10 · anon (343)
- MED · apps/web/components/habits/habit-detail-drawer.tsx:54 + apps/mobile/.../habit-detail-drawer.tsx:126 · rule 10 · `summaryStrip` (328)
- MED · apps/web/hooks/use-checklist-templates.ts:79 + apps/mobile/hooks/use-checklist-templates.ts:82 · rule 10 · `onMutate` (304)

(<300-char identical bodies = DEF-8, not reported.)

### Rule 2 — dead code: app/lib/util/theme/chat dead exports STILL present (re-verified one by one).

Each re-verified by word-boundary cross-file scan (excluding declaring file, barrels, `android/`, `build/`) → ZERO real importers. The round-1 DEPS cleanup did not touch these. (An Explore subagent initially mis-cleared several as "fixed" by counting same-file references; all such claims were overturned by direct verification.)

Runtime (MED · rule 2 · delete or drop `export`):
- MED · apps/web/app/(auth)/login/login-form-helpers.ts:58 · `appendAuthReference`
- MED · apps/web/app/actions/subscription.ts:32 · `claimAdReward`
- MED · apps/web/app/api/_utils/forwarded-client-context.ts:29 · `sanitizeClientCountryCode`
- MED · apps/web/hooks/use-summary.ts:72 · `useInvalidateSummary`
- MED · apps/web/hooks/use-push-notification-preferences.ts:69 · `isPushNotificationSupported`
- MED · apps/web/lib/auth-api.ts:64 · `getTokenExpiry`
- MED · apps/web/lib/auth-api.ts:75 · `isTokenRefreshRequired`
- MED · apps/web/lib/auth-api.ts:108 · `getAuthToken`
- MED · apps/web/lib/auth-proxy.ts:7 · `extractErrorMessage`
- MED · apps/web/lib/auth-proxy.ts:50 · `buildEmailLogContext`
- MED · apps/web/lib/theme-dom.ts:9 · `VALID_COLOR_SCHEMES`
- MED · apps/web/lib/theme-dom.ts:29 · `canvasColor`
- MED · apps/mobile/components/ui/drawer-content-inset.ts:3 · `DRAWER_CONTENT_BOTTOM_INSET`
- MED · apps/mobile/components/ui/keyboard-aware-scroll-view.tsx:266 · `KeyboardAwareView`
- MED · apps/mobile/lib/google-auth.ts:82 · `getGoogleAuthRedirectUrl`
- MED · apps/mobile/lib/motion.ts:45 · `setReducedMotionPreferenceForTests`
- MED · apps/mobile/lib/motion.ts:51 · `resetReducedMotionPreferenceForTests`
- MED · apps/mobile/lib/motion.ts:112 · `getReanimatedEasing`
- MED · apps/mobile/lib/motion.ts:118 · `getSpringConfig`
- MED · apps/mobile/lib/offline-runtime.ts:9 · `getCachedConnectivity`
- MED · apps/mobile/lib/typography.ts:29 · `resolveFontFamily`
- MED · apps/mobile/lib/typography.ts:46 · `typeRoleStyle`
- MED · packages/shared/src/chat/index.ts:34 · `MAX_CHAT_IMAGE_SIZE_BYTES`
- MED · packages/shared/src/chat/index.ts:36 · `CHAT_IMAGE_MIME_TYPES`
- MED · packages/shared/src/validation/habit-form.ts:107 · `validateDescription`

Type-only (LOW · rule 2 · delete or drop `export`):
- LOW · apps/web/app/(app)/today-shell.tsx:198 · `TodayUtilityRowProps`
- LOW · apps/web/app/actions/chat.ts:15 · `PendingOperationActionResult`
- LOW · apps/web/app/actions/subscription.ts:6 · `CheckoutResponse`
- LOW · apps/web/app/actions/subscription.ts:10 · `PortalResponse`
- LOW · apps/web/components/habits/controls-menu.tsx:15 · `ControlsMenuProps`
- LOW · apps/web/hooks/use-calendar-events.ts:13 · `CalendarEventsResult`
- LOW · apps/web/hooks/use-popover-menu.ts:5 · `PopoverPosition`
- LOW · apps/web/hooks/use-popover-menu.ts:10 · `PopoverPlacement`
- LOW · apps/web/hooks/use-popover-menu.ts:26 · `UsePopoverMenuReturn`
- LOW · apps/web/hooks/use-push-notification-preferences.ts:14 · `PushPreferenceStatus`
- LOW · apps/web/hooks/use-push-notification-preferences.ts:16 · `PushPreferenceSnapshot`
- LOW · apps/web/hooks/use-push-notification-preferences.ts:23 · `UsePushNotificationPreferencesResult`
- LOW · apps/web/lib/auth-api.ts:36 · `ResolvedServerSession`
- LOW · apps/mobile/components/habits/habit-form-fields/types.ts:8 · `SectionThemeProps`
- LOW · apps/mobile/hooks/use-version-check.ts:15 · `VersionNeedsUpdateResponse`
- LOW · apps/mobile/lib/anchored-menu.ts:17 · `AnchoredMenuPosition`
- LOW · apps/mobile/lib/google-auth-callback.ts:10 · `GoogleAuthParams`
- LOW · apps/mobile/lib/google-auth.ts:18 · `MobileGoogleAuthResult`
- LOW · apps/mobile/lib/theme.ts:28 · `ShadowValue`
- LOW · apps/mobile/lib/theme.ts:44 · `AppSurfaceLayer`
- LOW · apps/mobile/lib/theme.ts:130 · `AppShadowV2`
- LOW · apps/mobile/lib/theme.ts:138 · `AppShadowsV2`
- LOW · apps/mobile/lib/version-check.ts:1 · `AppStoreLookup`
- LOW · apps/mobile/modules/orbit-widget/src/OrbitWidget.types.ts:29 · `OnLoadEventPayload`
- LOW · packages/shared/src/chat/related-surfaces.ts:8 · `RelatedSurface`
- LOW · packages/shared/src/chat/sse-stream.ts:10 · `ChatSseParser`
- LOW · packages/shared/src/theme/motion.ts:26 · `MotionBezier`
- LOW · packages/shared/src/theme/motion.ts:143 · `MotionPreset`
- LOW · packages/shared/src/utils/habit-emoji-options.ts:510 · `HabitEmojiOption`
- LOW · packages/shared/src/utils/pagination.ts:1 · `PaginatedItemsResponse`

Shared `types/*.ts` truly-dead under D13 (schema AND inferred type both unused — `measure dead-d13.mjs`). 21 total, all LOW · rule 2:
- LOW · packages/shared/src/types/ai.ts:46 · `AppSurface` · :65 · `UserDataCatalogEntry`
- LOW · packages/shared/src/types/chat.ts:30 · `AiActionType` · :34 · `ActionStatus` · :57 · `ConflictingHabit`
- LOW · packages/shared/src/types/habit.ts:51 · `ScheduledReminderTime`
- LOW · packages/shared/src/types/profile.ts:12 · `subscriptionSourceSchema` · :14 · `SubscriptionSource`
- LOW · packages/shared/src/types/subscription.ts:8 · `PlanPrice` · :27 · `BillingPaymentMethod` · :40 · `BillingInvoice`
- LOW · packages/shared/src/types/sync.ts:73 · `SyncBatchRequest` · :80 · `SyncMutationResult` · :87 · `SyncBatchResponse` · :210 · `SyncChangesV2Response`
- LOW · packages/shared/src/types/referral.ts:8 · `ReferralCode` · :20 · `ReferralStats`
- LOW · packages/shared/src/types/auth.ts:39 · `SendCodeRequest` · :48 · `VerifyCodeRequest` · :58 · `GoogleAuthRequest`
- LOW · packages/shared/src/types/api.ts:7 · `APIError`

**D13 CORRECTION (not new findings — narrows round-1):** round-1 listed ~130 additional shared-type schema consts (e.g. `goalDetailSchema`, `createHabitRequestSchema`, `updateGoalRequestSchema`, every `set*RequestSchema`) as dead. Under D13 these are NOT dead: each is consumed by its paired `export type X = z.infer<typeof xSchema>` whose type IS imported across the apps (e.g. `HabitDetail` 13 consumers, `CreateGoalRequest` 7, `GoalDetailWithMetrics` 9). The schema const only appears in its own `z.infer` line — load-bearing, not dead. Do NOT delete these.

### Rule 8 — error handling (still open)

- LOW · orbit-api/src/Orbit.Api/OAuth/OAuthAuthorizationStore.cs:18 · rule 8 · cleanup-timer `try { Cleanup(); } catch (Exception) { }` — repeated cleanup failures stay invisible; log the exception (keep timer non-fatal). (Round-1 finding; the other two C# audit-write swallows are now FIXED.)
- MED · apps/web/app/(app)/preferences/page.tsx:92 · rule 8 · `updateLanguage` failure swallowed by empty `catch {}` then unconditional `globalThis.location.reload()` — server-side language pref silently unsaved. Also a parity divergence: the mobile mirror (`apps/mobile/app/preferences.tsx:112`) DOES the right thing (rolls back `selectedLanguage` + `i18n.changeLanguage` on catch). Surface/log on web, or mirror mobile's rollback.

### Rule 5 — comments outside lint scope (still open)

- LOW · apps/web/next.config.ts:17 · rule 5 · narration/WHY comment without URL ("HSTS: 2 years, include subdomains. Production traffic is HTTPS-only via Vercel.") in a lint-exempt config — delete or attach an upstream doc link.
- LOW · apps/mobile/eslint.config.js:7-10 · rule 5 · WHY block ("eslint-config-expo@55 ships react-hooks v5 …") has no URL — add the upstream issue link or delete.

### Rule 9 — naming (minor; C# locals)

- LOW · orbit-api/src/Orbit.Infrastructure/Services/BackgroundServiceHealthCheck.cs:30 · rule 9 · local `var data = new Dictionary<string,object>()` uses banned final name `data` — rename (e.g. `healthData`).
- LOW · orbit-api/src/Orbit.Api/Mcp/Tools/GoalTools.cs:94 · rule 9 · local `var info` (display-string builder) — banned final name; rename (e.g. `summaryText`).
- LOW · orbit-api/src/Orbit.Api/Mcp/Tools/GoalTools.cs:234 · rule 9 · local `var info` — same.
- LOW · orbit-api/src/Orbit.Api/Mcp/Tools/HabitTools.cs:88 · rule 9 · local `var info` — same.

(TS side: ZERO — no exported or local symbol named data/info/stuff/temp/obj/helper/util.)

---

## Confirmed FIXED since round-1 (do NOT re-report)

- C# Rule 7 — all 11 methods split <100L: `BuildCapabilities` 794→24, `BuildDirectFlowOperations` 153→7, `BuildSurfaces` 148→10, `BuildUserDataCatalog` 203→9, `AgentOperationExecutor.ExecuteAsync` 264→46, `OnModelCreating` 237→40, `AddOrbitInfrastructure` 196→45, `AddOrbitAiServices` 147→9, `ProcessUserChatCommand.Handle` 155→58, `ExecuteSingleToolCallAsync` 147→48, `AiController.ResolveClarification` 115→79. No new C# helper exceeds 100L (largest measured: `GetHabitScheduleQuery.HandleScheduledHabits` 81L, `HandleWebhookCommand.Handle` 60L).
- C# Rule 8 — `AgentOperationExecutor.TryAuditAsync` and `WebApplicationExtensions` legacy-MCP catch now log via `LoggerMessage` source-gen (were empty `catch {}`).
- C# Rule 5 — `OAuthLoginPage.cs` embedded-JS narration comments (round-1 cited 297/438/480) removed; zero `//` comments in the template now.
- SHARED Rule 10 (partial) — `packages/shared/src/hooks/tag-selection-core.ts`, `dismiss-guard-core.ts`, `utils/highlight-text.ts` (+ tests) added. (But apps don't import them yet — see Rule 10 findings.)

## Evaluated — NOT findings

- `OAuthLoginPage.Render` (479L): body is a single verbatim interpolated HTML/CSS/JS string literal (6 HtmlEncode lines + return). Round-1's C# methodology excluded string-template builders; kept consistent. Not a Rule 7 logic finding.
- `ProcessUserChatCommand.StripJsonWrapper`: heuristic over-measured (a `'{'` char-literal at line 728 skewed brace-depth); the real method is 17L. Not a finding.
- C# `catch (JsonException) {}` parse-fallbacks (GoogleTokenService:95, WebApplicationExtensions:320, ProcessUserChatCommand:737): defined-default fallbacks at boundaries — acceptable as in round-1.
- Rule 3 (`any`/`as any`/`as unknown as`): ZERO in non-test TS (all hits in `__tests__`/`*.test.*`). Rule 4 (console.*): ZERO in prod TS; ZERO `Console.Write*` in API src. lint + type-check: 3/3 green each, zero warnings.

## Verdict

| Severity | Count | Breakdown |
|---|---|---|
| HIGH | 206 | rule 7: 206 TS functions >100L (210 measured − 4 DEF-2b exemptions) |
| MED  | 50  | rule 10: 24 identical ≥300-char bodies · rule 2: 25 dead runtime exports · rule 8: 1 (web preferences swallow) |
| LOW  | 58  | rule 2: 30 dead type-only exports + 21 dead shared-type (D13) · rule 8: 1 (OAuth cleanup timer) · rule 5: 2 · rule 9: 4 |
| **Total** | **314** | |

Zero-finding checks: rule 3 (`any`), rule 4 (console), TS rule 9, TS strict, lint, type-check, C# rule 7 (all 11 fixed), C# rule 8 audit-writes (both fixed), C# rule 5 OAuth template (fixed).
