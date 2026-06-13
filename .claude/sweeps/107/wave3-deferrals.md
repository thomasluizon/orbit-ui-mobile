# Wave 3 — apps/mobile rule-7 function-split register

Agent: WAVE3-MOBILE · issue #107 Strand 1 · branch `chore/107-code-health-sweep`

Format: `<file>:<line> · <fn name> · <lines> · SPLIT to N pieces | DEFER:root <why> | SKIP:not-a-function <why>`

## SKIP — not a rule-7 function (StyleSheet.create / data literal / store factory / config)

apps/mobile/app/chat.styles.ts:7 · createStyles · 349 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/habits/habit-form-fields/styles.ts:233 · createStyles · 453 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/habits/habit-form-fields/styles.ts:14 · createSectionStyles · 218 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/upgrade.tsx:928 · styles · 309 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/streak-sections.tsx:549 · styles · 216 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/advanced.tsx:558 · styles · 186 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/retrospective.tsx:506 · styles · 167 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/login.tsx:603 · createStyles · 166 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/(tabs)/profile.tsx:1092 · createStyles · 192 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/chat/breakdown-suggestion.tsx:311 · createStyles · 175 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/habits/habit-calendar.tsx:232 · createStyles · 171 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/(tabs)/calendar.tsx:613 · createStyles · 156 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/habits/habit-checklist.tsx:384 · createStyles · 154 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/ai-settings.tsx:604 · createStyles · 149 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/goals/goal-detail-drawer/styles.ts:6 · createStyles · 148 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/message-bubble.tsx:250 · createStyles · 136 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/calendar-sync.tsx:790 · createStyles · 132 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/tour/tour-tooltip.tsx:191 · createTooltipStyles · 157 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/habit-list/move-parent-dialog.tsx:169 · createStyles · 130 · SKIP:not-a-function StyleSheet.create object
apps/mobile/app/(tabs)/index.tsx:1567 · createStyles · 127 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/navigation/notification-bell.tsx:314 · createStyles · 127 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/ui/create-api-key-modal.tsx:352 · createStyles · 124 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/habit-list.tsx:1819 · createStyles · 117 · SKIP:not-a-function StyleSheet.create object
apps/mobile/components/habits/checklist-templates.tsx:187 · createStyles · 112 · SKIP:not-a-function StyleSheet.create object
apps/mobile/stores/auth-store.ts:177 · useAuthStore · 131 · SKIP:not-a-function Zustand store factory body (create<AuthState>)
apps/mobile/vitest.config.ts:4 · defineConfig · 160 · SKIP:not-a-function Vitest config object literal

## DEF-2b pre-exempt (do not touch — coupled orchestration roots already exempted)

apps/mobile/components/habit-list.tsx:172 · HabitList · 1616 · DEFER:root DEF-2b exempt
apps/mobile/app/(tabs)/index.tsx:264 · TodayScreen · 1302 · DEFER:root DEF-2b exempt
apps/mobile/app/(tabs)/profile.tsx:186 · ProfileScreen · 905 · DEFER:root DEF-2b exempt

## SPLIT — decomposed cleanly (behavior-identical, validated)

apps/mobile/app/retrospective.tsx:118 · RetrospectiveScreen · 387 → 167 · SPLIT to 5 pieces (RetrospectiveLockedFree, RetrospectiveLockedYearly, RetrospectiveReportCard, RetrospectiveContent[132], orchestrator[167]); residual orchestrator is coupled hooks+3 effects (redirect guard, cache load/save)+handlers — justified root. Guard: upgrade-guard-redirects.test green.
apps/mobile/components/chat/breakdown-suggestion.tsx:56 · BreakdownSuggestion · 254 → ~111 · SPLIT to 4 pieces (BreakdownHabitRow[81], BreakdownSuccessCard, BreakdownActions) + createEditableHabit factory (DRY: shared by initializer+addHabit); residual orchestrator is coupled useState+handlers. Guard: breakdown-suggestion.test (3) green.
apps/mobile/components/navigation/notification-bell.tsx:63 · NotificationBell · 250 → 164 · SPLIT to 4 pieces (renderNotificationRow module fn[~70], NotificationListActions, NotificationListEmpty); row kept as module render-fn (not component) because notification-bell.test inspects renderItem()'s raw element tree — a component element would hide accessibilityLabel from findLabel. Residual orchestrator is coupled 8×useState + sync-external-store + modal/FlatList shell. Guard: notification-bell.test (3) green.
apps/mobile/app/support.tsx:85 · SupportScreen · 227 → 165 · SPLIT to 3 pieces (SupportSuccessState, SupportForm) + pre-existing SupportField; residual orchestrator is a coupled draft-managing state root (9×useState + 3 effects: draft load/prefill/save + validateForm + handleSend) — extracting a useSupportDraft hook would be single-caller + unguarded (no support-screen test), so deferred. Guard: tsc + full suite.
apps/mobile/components/chat/chat-input-area.tsx:64 · ChatInputArea · 211 → 102 · SPLIT to 4 pieces (ChatInputNotices[~70], ChatStarterChips, ChatLimitNotice); orchestrator now ~at cap (destructure + 4 child sections + usage text). Guard: chat component tests (28) green; full suite.
apps/mobile/components/onboarding/onboarding-flow.tsx:83 · OnboardingFlow · 252 → 196 · SPLIT to 3 pieces (OnboardingStepContent[step-router], OnboardingFooter[dots+CTAs]); residual orchestrator is the coupled step-navigation state machine (8×useState + goNext/goPrev astra/step logic + stepEntrance effect + 6 handlers) — a useOnboardingFlowState hook would be single-caller + unguarded (test covers shared helpers only), so deferred. Guard: onboarding tests (15) green.

## DEFER:root — genuine coupled orchestration roots (this sweep)

apps/mobile/app/chat.tsx:34 · ChatScreen · 276 · DEFER:root bulk is irreducible: ~40-prop wiring of useChatComposer/useChatReward hook outputs into a single <ChatInputArea> child + keyboard-inset effect + 3 drawer-state vars + message-interaction handlers. Extracting the conversation list saves ~25 lines while threading 6 handlers through — net negative. Logic already lives in hooks (useChatComposer/useChatReward); the screen is a thin coupled wiring root.
apps/mobile/components/ui/create-api-key-modal.tsx:58 · CreateApiKeyModal · 293 → ~121 · SPLIT to 3 pieces (ApiKeyRevealPanel, ApiKeyCreateForm[111]); two-phase modal split cleanly on isRevealState. Residual orchestrator is coupled 8×useState + reset effect + validate/handleSubmit/copyKey. Guard: create-api-key-modal.test (3) green.
apps/mobile/components/goals/create-goal-modal.tsx:68 · CreateGoalModal · 352 → 235 · SPLIT to 4 pieces (GoalTypeSelector, GoalTargetFields, GoalDeadlineField); residual orchestrator is coupled form logic (6×useState + fieldErrors memo + validateGoalDraftInput + dismissGuard + onSubmit mutation) + modal shell. Guard: create-goal-modal.test (3) green.
apps/mobile/components/goals/edit-goal-modal.tsx:57 · EditGoalModal · 278 → 209 · SPLIT to 3 pieces (EditGoalTargetFields, EditGoalDeadlineField); mirrors create-goal-modal locally (kept per-file vs lifting to shared — edit/create field markup differs in placeholders, and lifting would unify the styling seam + touch web twins owned by WAVE3-WEB). Residual is coupled form logic + modal shell. Guard: edit-goal-modal.test (3) green.
apps/mobile/components/habits/habit-row.tsx:88 · HabitRow · 368 → 254 · SPLIT to 3 pieces (HabitRowContent[title/desc/meta], HabitRowTrailing[status control + menu button]) + pre-existing CheckCircle/HabitRowMenuBody/MenuItem; residual orchestrator is ~115 lines of derived-state computation (computeHabitCardStatus/frequencyLabel/metaParts build/dotState/accessibility label) + the Pressable shell — irreducible data-derivation root. Guard: habit-list.test (30) green.
apps/mobile/components/habits/create-habit-modal.tsx:52 · CreateHabitModal · 348 · DEFER:root form already factored into HabitFormFields + SubHabitEditor; residual is irreducible coupled form-orchestration: open-transition prefill block (buildParentHabitFormState + 4 snapshot inits) + auto-reminder effect + handleSubmit(~72 lines, sub-habit vs habit branching) + 4-way isDirty snapshot tracking. No presentational seam left; extracting logic to a hook would be single-caller + unguarded.
apps/mobile/components/goals/goal-detail-drawer.tsx:55 · GoalDetailDrawer · 468 → 447 · SPLIT 1 leaf (GoalAskAstraButton) + presentation ALREADY extracted pre-sweep (GoalProgressBlock/GoalProgressForm/GoalMetricsPanel/GoalLinkedHabitsSection/GoalProgressHistorySection/GoalActionFooter). Residual is irreducible goal-mutation orchestration: 7×useState + prefill effect + 11 useCallback handlers (submitProgress, markCompleted/Abandoned, reactivate, delete, progress-dismiss state machine, askAstra). Effectively DEFER:root — no presentational seam left. Guard: goal-detail-drawer.test (4) green.
apps/mobile/components/habits/habit-detail-drawer.tsx:45 · HabitDetailDrawer · 316 → 150 · SPLIT to 3 pieces (HabitDetailContent[156, section list], HabitAskAstraButton); residual orchestrator is hooks + 2 state + 5 useCallback handlers (checklist toggle/reset/clear, askAstra) + DescriptionViewer/ConfirmDialog/BottomSheetModal wrappers. HabitDetailContent stays ~156 as a flat data-driven section list (further splits = trivial SettingsRow fragments). Guard: today-screen.test (20) green.
apps/mobile/app/_layout.tsx:118 · RootLayoutNav · 184 → 121 · SPLIT to 1 piece (RootStackScreens) + DRY'd 11x repeated slide_from_right Stack.Screen into SLIDE_FROM_RIGHT_SCREENS data map; residual orchestrator is coupled hooks + handleCreate + 3 effects (widget theme, admob init, android back handler) + layout shell. Guard: full suite (544) green.

apps/mobile/hooks/use-push-notifications.ts:273 · usePushNotifications · 296 · DEFER:root pure logic already at module level (getPushToken/sendTokenToBackend/etc); residual is the irreducible permission/registration state machine — 7×useState + 5 inter-dependent useCallback (registerAndSync, syncGrantedPermission, requestPermission, disable/enable) each setting 5-7 state pieces + 3 effects. No pure sub-function left; splitting needs a reducer/sub-hook = real behavior risk.
apps/mobile/hooks/use-ad-mob.ts:161 · useAdMob · 187 · DEFER:root attempted a shared runAdLifecycle helper for the two near-identical ad-lifecycle blocks (showInterstitialIfDue/showRewardedAd) but reverted: library's overloaded addAdEventListener<T> types + the test's STRUCTURAL ad mock (not real instanceof RewardedAd) make a unified helper type-fragile and behavior-risky for the EARNED_REWARD path. Conservative-with-hooks + correctness-over-count → defer.
apps/mobile/components/tour/tour-provider.tsx:27 · TourProvider · 317 · DEFER:root pure orchestration hook-component returning <>{children}</> — no JSX seam. 7 refs + 6 effects + 8 useCallback managing timeout/interval lifecycle, element measure, scroll-into-view, and the step-navigation state machine. All coupled; nothing extracts cleanly. (routeMap dup is only 2 uses — below rule-6 threshold.)

# ============================================================
# Wave3-WEB · issue #107 Strand 1 · rule-7 function splits (apps/web)
# Agent: WAVE3-WEB · branch chore/107-code-health-sweep
# Format: <file>:<line> · <fn> · <old→new lines> · SPLIT to N | DEFER:root <why> | SKIP:not-a-function <why>
# All entries: behavior-IDENTICAL, tsc clean, full web suite green (163 files / 1511 tests).
# ============================================================

## SPLIT — decomposed cleanly (behavior-identical, validated)

app/(app)/achievements/page.tsx:16 · AchievementsPage · 197 → 71 (fn) · SPLIT to 3 (orchestrator[71] + AchievementXpCard[level/XP card], AchievementsLockedState[pro gate]). Guard: pages/achievements.test (16) green.
app/(app)/retrospective/page.tsx:58 · RetrospectivePage · 272 → 96 (fn) · SPLIT to 6 (orchestrator[96] + RetrospectiveView, RetrospectiveCard[owns escapeHtml/renderMarkdown], RetrospectiveEmptyState, RetrospectiveLockedStates, LockedBlock+pillLinkClassName module). Guard: pages/retrospective.test (1) green.
app/(auth)/login/page.tsx:9 · LoginPage · 230 → 78 (fn) · SPLIT to 6 (orchestrator[78] + login-sections.tsx: LoginHeader, ReferralBanner, LoginErrorMessage, LoginSuccessMessage, LoginStepStage[AnimatePresence step switch via ReactNode props]). Static-JSX page; all logic was already in useLoginFlow. Guard: pages/login.test (5) green.

## SPLIT (view decomposed) + DEFER:root (residual orchestrator near/at cap)

app/(app)/profile/page.tsx:64 · ProfilePage · 340 → ~137 (fn) · SPLIT to 8 (orchestrator + ProfileIdentityHeader, ProfileStatTiles, ProfileNavSections, ProfileAccountActions, ProfileHeaderBar[gradient+AppBar+error], ProfileModals[4 modal mounts], useDataExport hook[blob download + isExporting/exportError]). Residual orchestrator is coupled controller: 7 hooks + 4 modal-state vars + subscription-success invalidate effect + handleNavClick + derived plan-badge/identity view-model, composing 7 slim child sections. No presentational seam left; a god view-model hook would obscure data flow. DEFER:root. Guard: app/profile-page.test (1) green.
app/(app)/preferences/page.tsx:55 · PreferencesPage · 316 → ~103 (fn) · SPLIT to 6 (orchestrator + PreferenceSettingsList, PreferencePickerSheet, PushNotificationSection, usePreferenceControls hook[locale-cookie effect + 2 optimistic mutations + scheme/theme/language/show-general handlers + activePicker], derivePreferenceLabels pure helper). Residual orchestrator (~103) + usePreferenceControls (~107) are both at the soft cap; the hook is a cohesive controls unit (optimistic mutations coupled to their handlers + patchProfile/applyScheme) — splitting fragments it. DEFER:root on the residual.
app/(app)/ai-settings/page.tsx:177 · AiSettingsPage · 334 → ~110 (fn) · SPLIT to 8 (orchestrator + AiFeatureToggles, ProUpgradeLink, FactItem, FactsSelectBar, FactsPagination, UserFactsList[+local FactsCenteredState DRY for error/empty], useUserFacts hook[facts query + selection + pagination + delete/bulk-delete]). Residual orchestrator (~110) = two AI-toggle optimistic mutations (exactly 2 uses → below rule-6 extract-on-third threshold) + facts hook + slim JSX. DEFER:root on the two coupled mutations. Guard: no direct ai-settings test; tsc + full suite green.
app/(app)/support/page.tsx:94 · SupportPage · 234 → ~149 (fn) · SPLIT to 3 (orchestrator + SupportField, SupportSuccessState, SupportForm). Residual orchestrator is a coupled draft-managing form root: 9×useState + draft-load IIFE + profile-prefill sync + draft-persist effect + validateForm + handleSend (all share name/email/subject/message state; handleSend reads all 4 + clears draft). Mirrors the mobile twin's deferral (apps/mobile/app/support.tsx). DEFER:root. Guard: pages/support.test (1) green.
app/(app)/streak/page.tsx:18 · StreakPage · 197 → ~101 (fn) · SPLIT to 3 (orchestrator + StreakHero[hero block], StreakFrozenBanner[frozen-today banner]) [StreakStatsRow/StreakTimelineCard/FreezeProgressCard pre-existing in _components/streak-sections]. Residual orchestrator (~101, at cap) = useStreakFreeze hook + encouragement/weekDays useMemos + freeze-celebration ref/effect. DEFER:root. Guard: pages/streak.test (25) green.

## SPLIT — oversized FUNCTION inside an already-shared section file (per-function rule-7)

app/(app)/streak/_components/streak-sections.tsx:314 · FreezeProgressCard · 210 → ~10 (fn) · SPLIT to 5 same-file fns (FreezeProgressCard[thin branch] + FreezeAutoCard, FreezeBankCard, FreezeStatRow[DRY banked/used rows — exact inline markup, NOT CardRow which adds padding], NextFreezeRow, FreezeProGate). All markup byte-identical to original (verified CardRow's padding/minHeight would have changed layout — avoided). Guard: pages/streak.test (25) green.

## NOT-A-PRIORITY / out of this agent's scope (measured >100 but not in WAVE3-WEB brief's 8-page list)
# These are genuine components but belong to feature areas outside the prioritized settings/auth pages.
# Left untouched to keep the health PR focused; not evaluated for split here.
# e.g. components/habits/*, components/goals/*, components/chat/*, components/gamification/* (celebration overlays),
# app/(app)/page.tsx (TodayPage), app/(chat)/chat/page.tsx, app/(app)/advanced|calendar-sync|upgrade/page.tsx,
# components/tour/tour-provider.tsx, app/(auth)/login/use-login-flow.ts (hook — conservative, left as root).
