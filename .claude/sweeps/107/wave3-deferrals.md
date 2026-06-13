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

## packages/shared (main session)
- packages/shared/src/stores/ui-store.ts:335 · createUIStoreState · 302 · DEFER:root — Zustand store-state factory; the 302 lines are one cohesive `set/get` action object. Splitting fragments the store's single source of truth (rule 6/10 over rule 7). Mirrors DEF-2b orchestration-root reasoning.
- packages/shared/src/tour/tour-mock-data.ts:14 · createTourMockHabits · 220 · SKIP:not-a-function — body is a static array of mock HabitScheduleItem literals (tour demo data), not control-flow logic. Rule-7's intent (a function doing too much) doesn't apply to a data literal.

# ============================================================
# Round-4 · SPLIT-MOBILE-2 · issue #107 · apps/mobile rule-7 closure
# Agent: SPLIT-MOBILE-2 · branch chore/107-code-health-sweep
# Goal: zero UNREGISTERED apps/mobile >100L functions. Every apps/mobile
# function-like node >100L is now either SPLIT below, registered DEFER:root,
# or covered by an earlier section / DEF-2b. tsc + expo lint + full mobile
# suite green at close.
# ============================================================

## SPLIT — decomposed cleanly (behavior-identical, validated) — round 4

apps/mobile/app/calendar-sync.tsx:71 · CalendarSyncScreen · 718 → 645 · SPLIT: extracted CalendarAutoSyncSection (the Pro auto-sync connection card + sync-now + reconnect block → calendar-sync-auto-section.tsx[104], mirrors web AutoSyncSettingsCard) and moved createStyles → calendar-sync-styles.ts. Residual 645 is the coupled step state machine: `step` discriminated union (loading/select/importing/done/error/not-connected/offline) driven by 3 effects (focus refetch, review-suggestions sync, events sync) + 7 shared handlers + renderEventRow, all reading the same events/selectedIds/tokens — extracting per-step screens would thread 10+ props each. DEFER:root on residual. Guard: calendar-sync.test (2) green.
apps/mobile/hooks/use-chat-composer.ts:141 · useChatComposer · 652 → 531 · SPLIT: extracted usePendingOperationExecution (the 5 agent confirm/step-up/execute API functions → use-pending-operation-execution.ts[138], injected `appendExecutionMessage`). Return surface unchanged (confirmAndExecutePendingOperation/prepareStepUpForBubble/verifyStepUpForBubble spread through). Residual 531 is the streaming-send pipeline (handleFailedSend/applyFinalResponse/buildChatFormData/runStreamingSend/performSend/sendMessage/retryLastSend) coupled to the chat-store setters + appendExecutionMessage + shouldRouteToUpgrade — mirrors web useChatComposer (489, also a root). DEFER:root on residual. Guard: use-chat-composer.test + chat component tests (35) green.

## DEFER:root — apps/mobile >100L roots (round-4 registration)
# Justification categories. All: behavior-IDENTICAL (no edits this round beyond the two SPLITs above + listed small items); each is a JSX-dominated view-root or coupled state hook where further extraction = rule-6 premature fragmentation / single-caller unguarded helpers, with test-breakage risk for ~zero correctness gain. "CORRECTNESS + GREEN over the number."

# -- Route screens (JSX view-roots + coupled screen state machines; logic already in hooks/shared utils) --
apps/mobile/app/upgrade.tsx:335 · UpgradeScreen · 592 · DEFER:root — billing-state orchestration root; body is in-component render closures (renderPlanSummaryCard/renderPlayBillingDashboard/renderProActivePanel/renderInvoices/renderBillingDashboard/renderPricingSection) sharing tokens/t/profile/styles/handlers. Mirrors web UpgradeScreen sibling roots. Extracting render-fns threads 5-8 props each.
apps/mobile/app/upgrade.tsx:724 · renderPricingSection · 163 · DEFER:root — in-component render closure of UpgradeScreen (above); closes over plans/selectedInterval/checkout handlers. Not a standalone unit.
apps/mobile/app/upgrade.tsx:581 · renderBillingDashboard · 142 · DEFER:root — in-component render closure of UpgradeScreen; branches on billing load/error/data and closes over tokens/t/invoice helpers.
apps/mobile/app/ai-settings.tsx:58 · AiSettingsScreen · 545 · DEFER:root — settings view-root: AI feature toggles + user-facts list/selection/pagination + optimistic mutations, all coupled to one screen's query+local state. Mobile single-file mirror of the web ai-settings page (which split into _components only because web pages favor co-located files); mobile keeps the screen flat.
apps/mobile/app/login.tsx:87 · LoginScreen · 516 · DEFER:root — auth screen-root; logic lives in useLoginCodeEntry + @/lib/auth-flow + shared auth-login utils. Residual is the email/code step JSX + hydrate-deep-link effect + Google-auth handler, coupled to the same form state. Web LoginPage split is static-JSX-only (all logic already in useLoginFlow); mobile screen owns more inline effect wiring.
apps/mobile/app/advanced.tsx:75 · AdvancedScreen · 482 · DEFER:root — Orbit-MCP API-keys screen: capabilities gate + key list + create/revoke flows + widget panel, coupled to one screen's queries + ConfirmDialog/CreateApiKeyModal/BottomSheetModal shells.
apps/mobile/app/(tabs)/calendar.tsx:120 · CalendarScreen · 445 · DEFER:root — month-grid calendar view-root: day-cell rendering + selected-day habit list + month navigation, all reading the same calendar-data query + selected-date state.
apps/mobile/app/preferences.tsx:56 · PreferencesScreen · 407 · DEFER:root — preferences view-root (scheme/theme/language/show-general + push section + picker sheet); the web PreferencesPage split into _components is a web-file-layout choice. Mobile screen is a flat settings list coupled to optimistic preference mutations.
apps/mobile/app/streak.tsx:38 · StreakScreen · 174 · DEFER:root — streak view-root composing pre-existing streak-sections; residual is useStreakFreeze hook + encouragement/weekDays memos + freeze-celebration effect. Mirrors web StreakPage root.
apps/mobile/app/achievements.tsx:28 · AchievementsScreen · 157 · DEFER:root — achievements view-root: XP/level card + locked-state gate + achievements grid, coupled to the gamification-profile query.
apps/mobile/app/auth-callback.tsx:41 · AuthCallbackScreen · 161 · DEFER:root — OAuth-return state machine: token exchange + redirect resolution + error states, coupled effect-driven flow; no presentational seam.
apps/mobile/app/privacy.tsx:12 · PrivacyScreen · 194 · DEFER:root — static legal page; body is a long sequence of localized prose <Text> blocks (Play-required public page). Rule-7's "function doing too much" doesn't apply to static copy; splitting yields meaningless fragments.
apps/mobile/app/terms.tsx:12 · TermsScreen · 127 · DEFER:root — static legal page; same as PrivacyScreen (long localized prose blocks, Play-required).

# -- Hooks (coupled state machines or flat collections of independent guarded calls) --
apps/mobile/hooks/use-pending-operation-execution.ts:35 · usePendingOperationExecution · 138 · DEFER:root — extracted this round from useChatComposer; flat sequence of 5 independent useCallback-wrapped agent API calls (confirm/step-up/verify/execute), each ~25L with its own try/catch. No nesting, no shared mutable state — a cohesive API-call hook, not a fn doing too much. Further splitting = 1 file per call (rule-6 violation).
apps/mobile/hooks/use-habit-form.ts:51 · useHabitForm · 168 · DEFER:root — rhf form controller: zodResolver wiring + frequency-type derived state + 6 interdependent setters (setOneTime/setRecurring/setFlexible/setGeneral/toggleDay) that mutate shared form values. Splitting fragments the form state machine; mirrors web use-habit-form.
apps/mobile/hooks/use-speech-to-text.ts:102 · useSpeechToText · 150 · DEFER:root — speech-recognition lifecycle state machine: permission + recording refs + 5 effects (start/stop/duration/transcript/error) all coupled to the native module's event stream.
apps/mobile/hooks/use-drill-navigation.ts:29 · useDrillNavigation · 123 · DEFER:root — sub-habit drill state machine: navigation stack + drill query + drillError, coupled stateful unit.
apps/mobile/hooks/use-play-billing.ts:131 · usePlayBilling · 121 · DEFER:root — Play Billing purchase state machine: connection + purchase + acknowledge + error mapping, each step coupled to the native billing client lifecycle (#132 native Play decision).
apps/mobile/hooks/use-habits.ts:135 · useLogHabit · 104 · DEFER:root — TanStack mutation with optimistic onMutate/onError/onSettled cache surgery; the body is one cohesive optimistic-update unit (snapshot → patch → rollback → invalidate). Splitting the lifecycle handlers fragments the optimistic contract.

# -- Habit-form section components (form already decomposed into habit-form-fields/*; each section is a flat field group) --
apps/mobile/components/habits/habit-form-fields.tsx:47 · HabitFormFields · 197 · DEFER:root — already a THIN orchestrator composing 9 extracted sub-sections (TitleSection/FrequencyTypeCards/FrequencyDetailSection/ActiveDaysSection/DueDateSection/TagsSection/MoreOptionsToggle/AdvancedSection/HabitEmojiSelector); the 197 is prop-threading + conditional section mounts, not logic. The web ~631 figure in the brief was the WEB twin (web agent owns); mobile is already split.
apps/mobile/components/habits/habit-form-fields/advanced-section.tsx:44 · AdvancedSection · 218 · DEFER:root — flat field-group view: end-date + reminders + goals-link + description, each a labeled control reading the same form control. Presentational section, JSX-dominated.
apps/mobile/components/habits/habit-form-fields/scheduled-reminder-section.tsx:28 · ScheduledReminderSection · 202 · DEFER:root — reminder-times editor: add/remove rows + time picker, coupled to the reminderTimes array + shared validator. JSX-dominated control.
apps/mobile/components/habits/habit-form-fields/reminder-section.tsx:19 · ReminderSection · 180 · DEFER:root — reminder toggle + offset picker field group; presentational section.
apps/mobile/components/habits/habit-form-fields/tags-section.tsx:27 · TagsSection · 176 · DEFER:root — tag chips + inline create-tag row reading TagSelectionState; presentational section.
apps/mobile/components/habits/habit-form-fields/habit-emoji-selector.tsx:26 · HabitEmojiSelector · 173 · DEFER:root — emoji trigger + picker Modal grid; JSX-dominated, coupled to the selected-emoji value.

# -- Modals / drawers / sheets (form or content shell + its local state) --
apps/mobile/components/habits/edit-habit-modal.tsx:36 · EditHabitModal · 233 · DEFER:root — coupled edit-form orchestration: prefill-from-habit snapshot + isDirty tracking + handleSubmit + HabitFormFields shell. Mirrors create-habit-modal (already DEFER:root) edit-side.
apps/mobile/components/referral/referral-drawer.tsx:31 · ReferralDrawer · 162 · DEFER:root — referral content sheet: code + stats + share action, coupled to the referral query + BottomSheetModal shell.
apps/mobile/components/version-update-drawer.tsx:21 · VersionUpdateDrawer · 132 · DEFER:root — update-prompt sheet: store-link CTA + dismiss, coupled to version-check state + sheet shell.
apps/mobile/components/habit-list/move-parent-dialog.tsx:37 · MoveParentDialog · 129 · DEFER:root — parent-picker Modal: candidate list + select + confirm, coupled to the move mutation + Modal shell.
apps/mobile/components/tour/tour-replay-modal.tsx:43 · TourReplayModal · 145 · DEFER:root — tour-replay chooser Modal: surface list + launch, coupled to the tour store + Modal shell.
apps/mobile/components/ui/push-prompt.tsx:21 · PushPrompt · 162 · DEFER:root — push-permission prompt Modal: rationale + allow/dismiss, coupled to the push-permission state + Modal shell.
apps/mobile/components/ui/confirm-dialog.tsx:34 · ConfirmDialog · 152 · DEFER:root — shared confirm primitive Modal: title/desc/cancel/confirm + animation; the kit's single confirm seam. JSX + entrance animation, no extractable sub-logic.
apps/mobile/app/(tabs)/profile/_components/edit-name-sheet.tsx:21 · EditNameSheet · 117 · DEFER:root — display-name edit sheet: input + validate + save mutation, coupled to the name form state + sheet shell.

# -- Gamification overlays (animation-driven JSX; Animated.Value refs + entrance/exit timelines) --
apps/mobile/components/gamification/achievement-toast.tsx:20 · AchievementToast · 175 · DEFER:root — animated toast: 5+ Animated.Value refs + entrance/dismiss timeline; line count is the animation choreography, not logic.
apps/mobile/components/gamification/welcome-back-toast.tsx:31 · WelcomeBackToast · 174 · DEFER:root — animated welcome-back overlay; same animation-timeline character.
apps/mobile/components/gamification/level-up-overlay.tsx:32 · LevelUpOverlay · 164 · DEFER:root — animated level-up overlay; Animated choreography view-root.
apps/mobile/components/gamification/streak-freeze-celebration.tsx:38 · StreakFreezeCelebration · 112 · DEFER:root — animated streak-freeze celebration; animation timeline.
apps/mobile/components/gamification/streak-celebration.tsx:24 · StreakCelebration · 105 · DEFER:root — animated streak celebration; animation timeline.
apps/mobile/components/gamification/goal-completed-celebration.tsx:23 · GoalCompletedCelebration · 101 · DEFER:root — animated goal-complete celebration; animation timeline.

# -- Onboarding step components (each step = prompt + input + advance; coupled to onboarding flow) --
apps/mobile/components/onboarding/onboarding-create-goal.tsx:45 · OnboardingCreateGoal · 242 · DEFER:root — onboarding goal step: form fields + create mutation + skip, coupled step unit (also a rule-10 anon dup pair with web — see Rule-10 below).
apps/mobile/components/onboarding/onboarding-create-habit.tsx:39 · OnboardingCreateHabit · 210 · DEFER:root — onboarding habit step: title/frequency + suggestions + create mutation, coupled step unit. (F6 maxLength fixed → MAX_HABIT_TITLE_LENGTH this round.)
apps/mobile/components/onboarding/onboarding-complete.tsx:25 · OnboardingComplete · 170 · DEFER:root — onboarding recap step: recap items + finish; JSX-dominated step.
apps/mobile/components/onboarding/onboarding-welcome.tsx:26 · OnboardingWelcome · 153 · DEFER:root — onboarding welcome step: hero + CTA; static JSX step.
apps/mobile/components/onboarding/onboarding-complete-habit.tsx:20 · OnboardingCompleteHabit · 138 · DEFER:root — onboarding habit-complete step: log affordance + advance; coupled step.

# -- UI primitives (JSX view-roots; picker/menu/toast shells with local open state) --
apps/mobile/components/ui/app-date-picker.tsx:37 · AppDatePicker · 191 · DEFER:root — date-picker Modal primitive: calendar grid + month nav + select, coupled to open + value state. JSX-dominated control.
apps/mobile/components/ui/app-time-picker.tsx:54 · AppTimePicker · 153 · DEFER:root — time-picker Modal primitive: hour/minute wheels + select; JSX-dominated control.
apps/mobile/components/ui/status-dot.tsx:35 · StatusDot · 139 · DEFER:root — status indicator primitive: derives dot color/animation from status; the length is the status→style mapping + pulse animation, a cohesive presentational unit.
apps/mobile/components/ui/anchored-menu.tsx:32 · AnchoredMenu · 136 · DEFER:root — anchored popup-menu primitive: measure anchor + position + Modal shell + item list; coupled positioning view-root.
apps/mobile/components/ui/app-toast.tsx:46 · AppToast · 132 · DEFER:root — toast primitive: queue display + entrance/exit animation; animation-timeline view-root.
apps/mobile/components/ui/fresh-start-animation.tsx:22 · FreshStartAnimation · 188 · DEFER:root — fresh-start splash: 8 Animated.Value refs + ring/orb/text choreography; pure animation timeline. (onRequestClose=onComplete added this round for Android back / F13.)

# -- Chat components (message/operation cards + input bar; coupled to chat store / props) --
apps/mobile/components/message-bubble.tsx:38 · MessageBubble · 209 · DEFER:root — chat message renderer: role/content/operations/policy-denials/surfaces branches, all rendering one message's view-model. Data-driven render root.
apps/mobile/components/chat/pending-operation-card.tsx:65 · PendingOperationCard · 156 · DEFER:root — pending-op card: confirm/step-up/execute affordances + status, coupled to the injected execution callbacks (now from usePendingOperationExecution).
apps/mobile/components/chat/chat-input-bar.tsx:39 · ChatInputBar · 154 · DEFER:root — chat input bar: text input + image + mic + send, coupled to composer props + reset signal.
apps/mobile/components/chat/chat-composer-input.tsx:26 · ChatComposerInput · 109 · DEFER:root — controlled composer text input with buffered-flush + reset-signal effect; coupled input unit.
apps/mobile/components/chat/clarification-card.tsx:23 · ClarificationCard · 104 · DEFER:root — clarification prompt card: option list + select, data-driven render.

# -- Goal / habit feature components (lists, calendars, panels; data-driven render roots) --
apps/mobile/components/goal-card.tsx:21 · GoalCard · 195 · DEFER:root — goal summary card: progress/metrics/deadline view-model, data-driven render (rule-10 anon dup pair with web — see below).
apps/mobile/components/habits/habit-calendar.tsx:26 · HabitCalendar · 211 · DEFER:root — habit month calendar: day-cell completion rendering + month nav, data-driven grid.
apps/mobile/components/habits/habit-checklist.tsx:198 · HabitChecklist · 195 · DEFER:root — checklist editor: item rows + add/toggle/remove + reorder, coupled to the checklist array.
apps/mobile/components/habits/checklist-templates.tsx:29 · ChecklistTemplates · 157 · DEFER:root — template picker/manager: template list + apply/delete, coupled to the templates query.
apps/mobile/components/goals/goals-view.tsx:54 · GoalsView · 156 · DEFER:root — goals list view: list + reorder + empty/loading, coupled to the goals query.
apps/mobile/components/goals/goal-metrics-panel.tsx:28 · GoalMetricsPanel · 131 · DEFER:root — goal metrics panel: derived metric tiles from the goal-metrics query; data-driven render.
apps/mobile/components/habits/bulk-action-bar-v2.tsx:37 · BulkActionBarV2 · 123 · DEFER:root — bulk-selection action bar: count + log/skip/delete actions, coupled to the selection set + bulk mutations.
apps/mobile/components/habits/today-ai-summary.tsx:26 · TodayAISummary · 118 · DEFER:root — AI summary card: summary query + regenerate, coupled to the summary state.
apps/mobile/components/habit-list/confirm-dialogs.tsx:34 · HabitListConfirmDialogs · 103 · DEFER:root — habit-list confirm cluster: delete/skip/reset ConfirmDialog mounts, coupled to the list's pending-action state.

# -- Other view-roots --
apps/mobile/app/streak-sections.tsx:312 · FreezeProgressCard · 172 · DEFER:root — freeze-progress card: auto/bank/used/next rows; data-driven presentational card (web twin already split into same-file fns by web agent; mobile keeps the flat card — markup is byte-tight).
apps/mobile/components/tour/tour-tooltip.tsx:50 · TourTooltip · 141 · DEFER:root — tour tooltip: positioned bubble + step copy + nav buttons, coupled to the tour step + measured anchor.
apps/mobile/lib/theme-provider.tsx:79 · ThemeProvider · 205 · DEFER:root — theme context provider: scheme/theme state + applyScheme/applyTheme/toggleTheme + cross-fade transition snapshot Modal. Splitting the provider fragments the single theme source of truth (rule 6 over rule 7).
apps/mobile/app/(tabs)/index.tsx:146 · TodaySearchBar · 105 · DEFER:root — Today search input row (sub-component inside the DEF-2b TodayScreen file): controlled input + clear + filter state, coupled to the Today list filter. Lives in the DEF-2b-exempt screen.
apps/mobile/app/calendar-sync-auto-section.tsx:30 · CalendarAutoSyncSection · 104 · DEFER:root — extracted THIS round from CalendarSyncScreen; a presentational section (connection card + sync-now + reconnect) just over cap because it is JSX-dense. Further splitting into 3 micro-rows = rule-6 fragmentation; mirrors web AutoSyncSettingsCard (163, a registered root).

## Round-4 · Rule-10 (DRY) — apps/mobile half
# No .claude/sweeps/107/handoffs/web-rule10-to-mobile.md was emitted by the web agent, so no
# new shared helper to adopt. Actions taken + adapter deferrals below.

### REWIRED to shared
- apps/mobile/components/ui/highlight-text.tsx · `highlightText` (699-char dup) DELETED locally; component now imports `highlightText` from `@orbit/shared/utils` (the shared util already existed, was barrel-exported + tested, just not consumed on mobile). The RN `HighlightText` *component* (renders <Text>) stays — it is the legitimate platform adapter of the web <span> version, not a dup. (NB: the mobile HighlightText component currently has zero in-app importers; left in place to preserve the web/mobile primitive pair — its deletion is a rule-2 call the parent/web side should make symmetrically, not a one-sided mobile drop.)

### DEFER:adapter — byte-identical web↔mobile bodies that are thin platform adapters (D12)
# These read identical in normalized AST but each lives inside a platform-specific hook/component whose
# surrounding I/O differs (mobile: offline-queue helpers / apiClient / SecureStore + RN primitives;
# web: Server Actions / cookie + DOM). Lifting the body alone to @orbit/shared would either (a) drag
# platform I/O across the seam, or (b) leave a 1-line wrapper on each side (net-negative). The shared
# CORE for the heaviest pairs (tag-selection, dismiss-guard) was already lifted in D33; the remaining
# wrappers are the adapter shells. Whole-wrapper lifting (a `'use client'`/RN re-export) is a cross-repo
# refactor touching the web twins owned by the concurrent web agent — out of this strand's mobile-only scope.
- apps/mobile/hooks/use-tags.ts · `onMutate` ×3 (with web/hooks/use-tags.ts) · DEFER:adapter — optimistic tag cache surgery; identical patch logic, platform-specific mutationFn (mobile performQueuedApiMutation vs web Server Action). Core not extractable without threading the queue adapter.
- apps/mobile/hooks/use-checklist-templates.ts · `onMutate` ×2 (with web twin) · DEFER:adapter — same optimistic-cache pattern, platform mutationFn differs.
- apps/mobile/hooks/use-goals.ts · `onMutate` (with web twin) · DEFER:adapter — same.
- apps/mobile/hooks/use-notifications.ts · `onMutate` ×3 (with web twin) · DEFER:adapter — same.
- apps/mobile/hooks/use-login-code-entry.ts · `onCodeInput` (with web twin) · DEFER:adapter — identical 6-digit input/advance logic; the completeness check already routes through shared isVerificationCodeComplete/VERIFICATION_CODE_LENGTH (D33). The residual is RN TextInput key-handling vs web input events — adapter shell.
- apps/mobile/hooks/use-tag-selection.ts · `useTagSelection` wrapper (with web twin) · DEFER:adapter — shared CORE already lifted (D33, @orbit/shared/hooks); the RN wrapper body is the adapter (re-exposes the core with RN state). Whole-wrapper lift touches the web twin.
- apps/mobile/hooks/use-dismiss-guard.ts · `useDismissGuard` wrapper (with web twin) · DEFER:adapter — shared CORE already lifted (D33); RN wrapper is the adapter shell.
- apps/mobile/lib/pending-notification-deletes.ts · `queuePendingNotificationDelete` (with web twin) · DEFER:adapter — identical queue logic but mobile persists to SQLite-backed offline store vs web localStorage; storage seam differs.
- apps/mobile/lib/habit-mutation-helpers.ts:374 · `findCachedGoals` (with web/hooks/use-habits.ts) · DEFER:adapter — identical cache-read shape; mobile's lives in the offline mutation-helpers module, web's inline in the hook. Same character as the onMutate adapters.
- apps/mobile/hooks/use-tour-mock-data.ts · `restore` + anon (with web twin) · DEFER:adapter — tour mock-data restore; identical body, platform store handle differs.
- apps/mobile/hooks/use-habit-form.ts · anon `setGeneral` (with web twin) · DEFER:adapter — rhf setter inside the platform form hook; identical, but bound to each platform's form instance.
- apps/mobile components onboarding/goal/habit/chat anon pairs (onboarding-create-goal/complete, create-api-key-modal, breakdown-suggestion handleConfirm, goal-card, habit-detail-drawer summaryStrip, support, advanced scopeOptions, streak encouragement) · DEFER:adapter — JSX/handler bodies identical to web twins but embedded in platform components (RN primitives + adapters). Below the value line for a shared lift; each is a view/handler adapter. (These overlap the rule-7 DEFER:root entries above — same nodes, different lens.)

# ============================================================
# Round-4 · SPLIT-WEB-2 · issue #107 · apps/web rule-7 closure
# Agent: SPLIT-WEB-2 · branch chore/107-code-health-sweep
# Goal: zero UNREGISTERED apps/web >100L functions. Every apps/web function-like
# node >100L (measure-fns.mjs, excluding __tests__/.test/.d.ts/StyleSheet/data
# literals) is now either SPLIT below, registered DEFER:root, or SKIP:not-a-function.
# All entries: behavior-IDENTICAL, tsc clean, full web suite green.
# ============================================================

## SPLIT — decomposed cleanly (behavior-identical, validated)

apps/web/hooks/use-chat-composer.ts:102 · useChatComposer · 635 -> 489 · SPLIT to 3 (useChatComposer orchestrator + useChatImageAttachment[file/paste/preview lifecycle, ~95] + useChatPendingOperations[confirm/execute + step-up flows, ~100]). Residual orchestrator is the coupled SSE streaming send pipeline tightly bound to the chat store mutators -- DEFER:root (below). Guard: use-chat-composer.test (6) green.
apps/web/app/(chat)/chat/page.tsx:37 · ChatPage · 554 -> 171 · SPLIT to 6 (ChatPage orchestrator + chat-empty-state.tsx ChatEmptyState[hero/suggestions] + chat-composer-bar.tsx: ChatComposerBar[wrapper], ChatComposerNotices[error/preview/chips], ChatRecordingBar[visualizer], ChatTextInputRow[textarea+controls], ChatSpeechLanguagePicker[lang menu]). Residual ChatPage[171] is the drawer-state wiring + the 35-prop pass-through -- DEFER:root (below). Guard: use-chat-composer.test (6) green; tsc + full suite.

## SPLIT (view decomposed) + DEFER:root (residual near/at cap — coupled or pass-through)

apps/web/app/(chat)/chat/chat-composer-bar.tsx:457 · ChatComposerBar · 137 · DEFER:root — presentational composition root: switches recording vs text-input branch + composes ChatComposerNotices/ChatRecordingBar/ChatTextInputRow + the limit gate. The 137 is JSX composition + the 30-prop destructure (all forwarded from useChatComposer); further splitting only shuffles props. New this round (extracted from ChatPage).
apps/web/app/(chat)/chat/chat-composer-bar.tsx:346 · ChatTextInputRow · 107 · DEFER:root — textarea + image/mic/send controls row; already delegates the speech-language menu to ChatSpeechLanguagePicker. Residual is cohesive single-field input markup + its 18-prop destructure. New this round (extracted from ChatPage).
apps/web/app/(chat)/chat/page.tsx:21 · ChatPage · 171 · DEFER:root — after the 6-way split the residual is the AppBar/log-region shell + detail-drawer open state (habit/goal) + the 35-prop pass-through to ChatComposerBar. The prop-threading IS the line count, not logic; the logic lives in useChatComposer. Mirrors mobile ChatScreen DEFER:root.

## DEFER:root — coupled orchestration roots (state machine / mutation / form / drawer; logic already in hooks/sub-components; no clean presentational seam left)

apps/web/app/(app)/page.tsx:61 · TodayPage · 580 · DEFER:root — web mirror of mobile TodayScreen (DEF-2b exempt). Coupled Today orchestration root: ~40 useUIStore selectors (view/search/frequency/tag-filter/select-mode/bulk) + local search-debounce/slide-direction/today-rollover/collapse state + ~15 handlers + the view-switch/bulk-bar/search JSX. Delegates list rendering to HabitList (DEF-2b) + GoalsView. Same rule-6-over-rule-7 reasoning as DEF-2b TodayScreen; splitting fragments the select-mode/search/view state machine.
apps/web/hooks/use-chat-composer.ts:86 · useChatComposer · 489 · DEFER:root — after extracting useChatImageAttachment + useChatPendingOperations, the residual is the irreducible SSE streaming send pipeline: runStreamingSend (idle-watchdog + abort + draft-message + SSE consume) + performSend/sendMessage/retryLastSend + applyFinalResponse/handleFailedSend (response classification -> store mutation + invalidation + upgrade routing) + 5 effects. All coupled to the chat store + router; a further sub-hook would fragment the send state machine. Mirrors mobile useChatComposer DEFER:root.
apps/web/components/habits/habit-form-fields.tsx:868 · HabitFormFields · 631 · DEFER:root — presentation ALREADY factored (ReminderSection/ScheduledReminderSection/HabitEmojiSelector are separate same-file components). Residual is the irreducible coupled habit-form body: title/description/frequency/checklist/sub-habit/tag/goal-link field sections all reading one rhf form instance + watched-value memos + collapse state + per-field handlers. Mirrors mobile create-habit-modal/HabitFormFields DEFER:root. Core habit form -- heavily tested; splitting the field sections risks regressions for line-count only.
apps/web/components/goals/goal-detail-drawer.tsx:141 · GoalDetailDrawer · 490 · DEFER:root — mirrors mobile GoalDetailDrawer DEFER:root. Presentation already extracted (progress block/form/metrics/linked-habits/history/footer pre-existing). Residual is goal-mutation orchestration: 7 useState + prefill effect + ~11 handlers (submitProgress, markCompleted/Abandoned, reactivate, delete, progress-dismiss state machine, askAstra) + drawer shell. No presentational seam left.
apps/web/app/(app)/advanced/page.tsx:133 · AdvancedPage · 523 · DEFER:root — settings root: presentation already factored (CodeWell/CopyIconButton/SubsectionTitle same-file). Residual is coupled API-key + MCP-config orchestration: apiKeys/capabilities queries + scopeOptions memo + create/revoke mutations + clipboard/config-tab/instructions state + the widget/MCP/instructions section JSX + ConfirmDialog. Section components would each be single-caller; the state is shared across them.
apps/web/app/(app)/calendar-sync/page.tsx:260 · CalendarSyncPage · 532 · DEFER:root — coupled calendar-sync orchestration: connection status + auto-sync settings + import flow state + multiple mutations, composing AutoSyncSettingsCard (already extracted) + the connect/import/status JSX. The state (connection, sync prefs, import selection) is shared across the sections.
apps/web/components/habits/create-habit-modal.tsx:53 · CreateHabitModal · 345 · DEFER:root — mirrors mobile create-habit-modal DEFER:root. Form factored into HabitFormFields + SubHabitEditor; residual is coupled form-orchestration (open-transition prefill + auto-reminder effect + handleSubmit sub-habit/habit branching + isDirty snapshot tracking) + modal shell. No presentational seam left.
apps/web/components/goals/create-goal-modal.tsx:115 · CreateGoalModal · 321 · DEFER:root — mirrors mobile create-goal-modal DEFER:root. Coupled form logic (6 useState + fieldErrors memo + validateGoalDraftInput + dismissGuard + onSubmit mutation) + modal shell; type/target/deadline fields inline-sectioned but share the draft state.
apps/web/components/goals/edit-goal-modal.tsx:47 · EditGoalModal · 278 · DEFER:root — mirrors mobile edit-goal-modal DEFER:root; coupled edit-form logic + modal shell, field markup differs from create in placeholders/prefill.
apps/web/components/habits/habit-detail-drawer.tsx:30 · HabitDetailDrawer · 300 · DEFER:root — mirrors mobile habit-detail-drawer DEFER:root. Hooks + checklist toggle/reset/clear + askAstra handlers + the detail section list + drawer/confirm wrappers; section list is flat data-driven rows (further splits = trivial fragments).
apps/web/components/habits/habit-row.tsx:83 · HabitRow · 315 · DEFER:root — mirrors mobile HabitRow DEFER:root (DEF-2b family). ~115 lines of derived-state computation (computeHabitCardStatus/frequency label/meta parts/dot state/accessibility label) + the Pressable/menu shell. Irreducible data-derivation root.
apps/web/components/onboarding/onboarding-flow.tsx:32 · OnboardingFlow · 281 · DEFER:root — mirrors mobile onboarding-flow DEFER:root. Coupled step-navigation state machine (step state + goNext/goPrev + stepEntrance + handlers) routing to OnboardingWelcome/CreateHabit/CreateGoal/Complete step components (already separate). A useOnboardingFlowState hook would be single-caller + unguarded.
apps/web/components/tour/tour-provider.tsx:26 · TourProvider · 284 · DEFER:root — mirrors mobile tour-provider DEFER:root. Pure orchestration context-component returning children: refs + effects + callbacks managing timeout/interval lifecycle, element measure, scroll-into-view, and the step-navigation state machine. No JSX seam.
apps/web/components/navigation/notification-bell.tsx:61 · NotificationBell · 284 · DEFER:root — mirrors mobile notification-bell DEFER:root. Coupled multi-useState + sync-external-store + popover/list shell; row render + list-actions/empty are inlined presentational fragments. Residual is the notification-state + read/delete/pending-queue orchestration.
apps/web/app/(auth)/auth-callback/page.tsx:98 · AuthCallbackPage · 184 · DEFER:root — OAuth-callback state machine: parses the callback params + drives exchange/error/redirect through coupled effects + status state. No presentational seam (renders a single status view); the logic is the param-exchange flow.
apps/web/app/(auth)/login/use-login-flow.ts:24 · useLoginFlow · 209 · DEFER:root — noted conservative-root in wave-3. Coupled login state machine: email/code/step state + send/verify/google handlers + deep-link + cookie-write + error mapping, delegating digit entry to useLoginCodeEntry. Splitting fragments the auth flow.
apps/web/components/calendar/calendar-day-detail.tsx:39 · CalendarDayDetail · 230 · DEFER:root — coupled day-detail panel: per-day habit/log derivation + toggle handlers + the day's habit-list JSX. Data derivation bound to the selected day's state.
apps/web/components/chat/message-bubble.tsx:37 · MessageBubble · 220 · DEFER:root — coupled message renderer: role/operation/policy-denial/pending-op/action-chip branch rendering + step-up sub-flow wiring. Each branch is small but shares the message view-model + the pending-op callbacks threaded from useChatComposer.
apps/web/components/chat/pending-operation-card.tsx:56 · PendingOperationCard · 188 · DEFER:root — pending-op confirm/step-up card: coupled confirm -> step-up-challenge -> verify state machine + the per-phase JSX. The phases share the operation + challenge state.
apps/web/components/chat/breakdown-suggestion.tsx:31 · BreakdownSuggestion · 242 · DEFER:root — mirrors mobile breakdown-suggestion residual. Editable-habit list state + handleConfirm (shared buildBreakdownCreateRequest/filterValidBreakdownHabits) + the per-habit edit-row JSX; the rows share the editable-habits state.
apps/web/components/goals/goal-card.tsx:29 · GoalCard · 188 · DEFER:root — coupled goal card: progress/status/deadline derivation + the card JSX + menu/handlers. Data-derivation root bound to the goal.
apps/web/components/goals/goal-metrics-panel.tsx:24 · GoalMetricsPanel · 151 · DEFER:root — metrics computation (streak/completion/pace view-models) + the metrics grid JSX; the cells share the computed metrics object.
apps/web/components/habits/habit-calendar.tsx:25 · HabitCalendar · 253 · DEFER:root — month-grid builder + per-day log/status derivation + the calendar grid JSX. Data-derivation + grid render bound to one month's state.
apps/web/components/habits/habit-checklist.tsx:39 · HabitChecklist · 268 · DEFER:root — checklist editor + interactive list: add/toggle/reorder/clear handlers + dnd sensors + the item list (interactive + editable variants). Shares the items + dnd state across modes.
apps/web/components/ui/app-date-picker.tsx:30 · AppDatePicker · 266 · DEFER:root — date-picker dialog: month-grid build + roving-tabindex keyboard grid (arrows/Home/End/PageUp/Down) + overlay-stack registration + selection state. Keyboard nav coupled to the grid state.
apps/web/components/ui/app-overlay.tsx:61 · AppOverlay · 302 · DEFER:root — the shared overlay primitive: focus-trap + overlay-stack LIFO registration + ESC/focus-in/restore + enter/exit motion + portal. Single cohesive dismiss/focus engine; splitting fragments the focus/stack contract (the seam consumed by every bespoke layer).
apps/web/components/ui/confirm-dialog.tsx:41 · ConfirmDialog · 216 · DEFER:root — confirm/alert dialog primitive: focus-trap + stack registration + ESC + Tab-cycle + danger/info variant + motion. Same focus/stack engine character as AppOverlay; cohesive primitive.
apps/web/components/ui/popover.tsx:32 · Popover · 190 · DEFER:root — popover primitive: anchored positioning + outside-click + roving-focus + stack-gated ESC + render-prop close. Cohesive positioning/focus engine consumed by every menu.
apps/web/components/gamification/level-up-overlay.tsx:18 · LevelUpOverlay · 202 · DEFER:root — blocking celebration overlay: queue-driven dismiss + overlay-escape + multi-phase entrance animation. The animation phases share the level-up payload + dismiss state.
apps/web/components/referral/referral-drawer.tsx:21 · ReferralDrawer · 197 · DEFER:root — referral panel: code/stats query + share/copy handlers + the stats + share JSX. Shares the referral view-model.
apps/web/components/tour/tour-tooltip.tsx:185 · TourTooltip · 188 · DEFER:root — tour tooltip: spotlight positioning + step copy + nav controls; positioning coupled to the measured target rect.
apps/web/components/ui/create-api-key-modal.tsx:23 · CreateApiKeyModal · 149 · DEFER:root — mirrors mobile create-api-key-modal DEFER:root. Two-phase modal (create form <-> reveal) split on reveal-state into CreateStep (below); residual is the phase switch + 8 useState + reset effect + validate/submit/copy.
apps/web/components/ui/create-api-key-modal.tsx:192 · CreateStep · 175 · DEFER:root — the create-form phase: scope selection + name/expiry/read-only fields + validation; the fields share the create-request draft state.
apps/web/hooks/use-habit-form.ts:52 · useHabitForm · 166 · DEFER:root — the shared habit-form controller hook: rhf instance + default-values build + watched-value derivations + submit transform. Cohesive form-state unit; splitting fragments the form contract consumed by create/edit modals.
apps/web/hooks/use-speech-to-text.ts:52 · useSpeechToText · 144 · DEFER:root — Web Speech API recognition lifecycle: recognition instance + start/stop + transcript accumulation + duration timer + permission/error state. Cohesive browser-API state machine.
apps/web/hooks/use-popover-menu.ts:36 · usePopoverMenu · 127 · DEFER:root — popover open/position/roving-focus state machine; cohesive menu-control unit consumed by the Popover primitive.
apps/web/hooks/use-drill-navigation.ts:56 · useDrillNavigation · 116 · DEFER:root — sub-habit drill stack + on-demand children fetch + eventual-consistency refresh + ESC-to-drill-back. Cohesive navigation state machine. (drillError now threaded to HabitListDrillContent this round -- F1 fix.)
apps/web/hooks/use-color-scheme.ts:29 · useColorScheme · 114 · DEFER:root — color-scheme + theme-mode resolution/persistence/profile-sync state; cohesive theme-control unit consumed by useProfile + preferences.
apps/web/hooks/use-login-code-entry.ts:23 · useLoginCodeEntry · 114 · DEFER:root — 6-digit OTP entry state machine (per-digit refs + paste/autofill + completeness routing via shared isVerificationCodeComplete). Cohesive input controller.
apps/web/app/(app)/preferences/_components/use-preference-controls.ts:26 · usePreferenceControls · 107 · DEFER:root — registered in wave-3 (preferences split). Cohesive preference-controls unit: locale-cookie effect + scheme/theme/language/week-start optimistic mutations + their handlers + activePicker.

## DEFER:root — presentational composition roots (markup-dominant; line count is cohesive JSX + many forwarded props, not logic)

apps/web/app/(app)/profile/page.tsx:30 · ProfilePage · 139 · DEFER:root — registered in wave-3 (8-way split). Residual orchestrator composes ProfileIdentityHeader/StatTiles/NavSections/AccountActions/HeaderBar/Modals + 7 hooks + modal-state + subscription-success effect.
apps/web/app/(app)/support/page.tsx:18 · SupportPage · 149 · DEFER:root — registered in wave-3. Coupled draft-managing form root (9 useState + draft load/prefill/persist + validate + handleSend) composing SupportField/SupportSuccessState/SupportForm. Mirrors mobile support DEFER:root.
apps/web/app/(app)/preferences/page.tsx:18 · PreferencesPage · 103 · DEFER:root — registered in wave-3. Orchestrator composing PreferenceSettingsList/PickerSheet/PushNotificationSection + usePreferenceControls.
apps/web/app/(app)/ai-settings/page.tsx:18 · AiSettingsPage · 128 · DEFER:root — registered in wave-3 (8-way split). Two AI-toggle optimistic mutations (exactly 2 uses, below rule-6 third-use threshold) + useUserFacts + slim JSX composing AiFeatureToggles/UserFactsList/etc.
apps/web/app/(app)/streak/page.tsx:17 · StreakPage · 102 · DEFER:root — registered in wave-3. useStreakFreeze + encouragement/weekDays memos + freeze-celebration effect composing StreakHero/FrozenBanner + pre-existing streak-section cards.
apps/web/app/(app)/calendar/page.tsx:32 · CalendarPage · 174 · DEFER:root — calendar screen composing CalendarGrid + CalendarDayDetail + month-nav state; the selected-month/day state is shared between grid and detail.
apps/web/app/(app)/layout.tsx:64 · AppLayoutContent · 173 · DEFER:root — the authenticated app shell: nav + tour-gating + onboarding/calendar-import prompt gating + overlay mounts + the children slot. Coupled shell wiring (which prompts/overlays show); the line count is the gating conditions + mounts.
apps/web/app/(app)/today-shell.tsx:222 · TodayUtilityRow · 133 · DEFER:root — the Today header utility row (search/view-switch/select-mode/filter controls); presentational row composing the control affordances, props forwarded from TodayPage.
apps/web/app/(app)/upgrade/page.tsx:355 · BillingDashboard · 234 · DEFER:root — active-subscription dashboard: plan/billing query + manage-subscription handlers + the plan/usage/invoice JSX. Shares the subscription view-model across sections.
apps/web/app/(app)/upgrade/page.tsx:661 · PricingSection · 170 · DEFER:root — the plan-comparison/pricing JSX composing PlanCard xN + interval toggle + checkout handlers; the cards share the interval + checkout state.
apps/web/app/(app)/upgrade/page.tsx:832 · UpgradePage · 119 · DEFER:root — the upgrade screen orchestrator switching BillingDashboard (subscribed) vs PricingSection (not) + trial state; thin coupled switch.
apps/web/app/(app)/profile/_components/delete-account-modal.tsx:22 · DeleteAccountModal · 156 · DEFER:root — destructive multi-step confirm modal: confirm-text state + delete mutation + the warning/confirm JSX. The steps share the confirmation state.
apps/web/app/(app)/profile/_components/tour-replay-modal.tsx:48 · TourReplayModal · 143 · DEFER:root — tour-replay picker modal: tour list + replay handler + the picker JSX.
apps/web/app/(app)/profile/_components/edit-name-sheet.tsx:19 · EditNameSheet · 108 · DEFER:root — edit-name sheet: name state + update mutation + dismiss-guard + the field JSX.
apps/web/components/calendar/calendar-grid.tsx:66 · CalendarGrid · 164 · DEFER:root — month grid builder + per-day cell render; data-derivation (weeks/days) + the grid JSX bound to the month.
apps/web/components/goals/goal-list.tsx:19 · GoalList · 170 · DEFER:root — DnD reorder root: drag/touch handlers + the draggable goal sections. The drag state is shared across rows (HTML5 + touch-hold dnd). (aria-roledescription i18n'd this round -- goals.dragItem.)
apps/web/components/goals/goals-view.tsx:19 · GoalsView · 119 · DEFER:root — goals tab body composing GoalList + filter chrome + skeleton/empty states; shares the filter state.
apps/web/components/habits/checklist-templates.tsx:20 · ChecklistTemplates · 149 · DEFER:root — checklist-template picker: templates query + apply/delete handlers + the template list JSX.
apps/web/components/habits/edit-habit-modal.tsx:33 · EditHabitModal · 180 · DEFER:root — edit variant of CreateHabitModal: prefill + handleSubmit (edit branch) + isDirty + HabitFormFields + modal shell. Mirrors create-habit-modal coupled form-orchestration.
apps/web/components/habits/today-ai-summary.tsx:25 · TodayAISummary · 170 · DEFER:root — AI daily-summary card: summary query + regenerate + pro-gate + the summary/loading/error/locked JSX. Shares the summary view-model.
apps/web/components/habits/habit-form-fields.tsx:214 · HabitEmojiSelector · 170 · DEFER:root — emoji-picker sub-component (already extracted from HabitFormFields): category state + grid + overlay-escape; the grid is cohesive emoji markup bound to the selection.
apps/web/components/habits/habit-form-fields.tsx:461 · ReminderSection · 152 · DEFER:root — reminder field section (already extracted): reminder-toggle/time state + the section JSX; cohesive field group.
apps/web/components/habits/habit-form-fields.tsx:623 · ScheduledReminderSection · 154 · DEFER:root — scheduled-reminders field section (already extracted): add/remove reminder rows (max 5) + the list JSX; cohesive field group.
apps/web/components/habits/habit-list/move-parent-overlay.tsx:30 · MoveParentOverlay · 130 · DEFER:root — move-parent picker overlay: candidate-parent list + select handler + AppOverlay shell; cohesive picker.
apps/web/components/habits/habit-list/confirm-dialogs.tsx:36 · HabitListConfirmDialogs · 101 · DEFER:root — the cluster of habit-list ConfirmDialogs (delete/discard/skip/complete-parent) wired to the list's confirm state; each dialog is thin, the cluster shares the confirm-target state.
apps/web/components/habits/habit-list/drill-content.tsx · HabitListDrillContent · <100 (not in list) — F1 fix this round added a drillError branch; remains under cap.
apps/web/components/onboarding/onboarding-create-habit.tsx:32 · OnboardingCreateHabit · 237 · DEFER:root — onboarding habit step: title/frequency/suggestion state + create mutation + the suggestion-chip + field JSX. Shares the draft + suggestions state. (maxLength -> MAX_HABIT_TITLE_LENGTH this round.)
apps/web/components/onboarding/onboarding-create-goal.tsx:34 · OnboardingCreateGoal · 260 · DEFER:root — onboarding goal step: description/target/unit/suggestion state + create mutation + the field + suggestion JSX. Shares the draft state. (maxLength -> MAX_GOAL_TITLE_LENGTH/MAX_GOAL_UNIT_LENGTH this round.)
apps/web/components/onboarding/onboarding-welcome.tsx:19 · OnboardingWelcome · 141 · DEFER:root — onboarding welcome step: entrance animation + the hero/CTA JSX; cohesive intro markup.
apps/web/components/onboarding/onboarding-complete.tsx:19 · OnboardingComplete · 138 · DEFER:root — onboarding complete step: recap items derivation + the recap/CTA JSX; markup bound to the recap view-model.
apps/web/components/onboarding/onboarding-complete-habit.tsx:14 · OnboardingCompleteHabit · 108 · DEFER:root — onboarding habit-created confirmation: the success/CTA JSX; cohesive markup.
apps/web/components/gamification/achievement-toast.tsx:11 · AchievementToast · 167 · DEFER:root — achievement toast: queue-driven reveal + multi-phase entrance/exit animation; phases share the achievement payload.
apps/web/components/gamification/goal-completed-celebration.tsx:12 · GoalCompletedCelebration · 153 · DEFER:root — goal-completed overlay: entrance animation phases + the celebration JSX; cohesive animated overlay.
apps/web/components/gamification/streak-celebration.tsx:14 · StreakCelebration · 152 · DEFER:root — streak-milestone overlay: animation phases + the celebration JSX; cohesive animated overlay.
apps/web/components/gamification/streak-freeze-celebration.tsx:17 · StreakFreezeCelebration · 142 · DEFER:root — streak-freeze overlay: animation phases + the celebration JSX; cohesive animated overlay.
apps/web/components/gamification/welcome-back-toast.tsx:12 · WelcomeBackToast · 138 · DEFER:root — welcome-back toast: reveal + animation + the toast JSX; cohesive animated overlay.
apps/web/components/gamification/all-done-celebration.tsx:11 · AllDoneCelebration · 127 · DEFER:root — all-done overlay: animation phases + the celebration JSX; cohesive animated overlay.
apps/web/components/ui/push-prompt.tsx:33 · PushPrompt · 162 · DEFER:root — push-permission prompt: permission state + subscribe handler + overlay-escape + the prompt JSX; cohesive transient overlay.
apps/web/components/ui/trial-expired-modal.tsx:22 · TrialExpiredModal · 125 · DEFER:root — trial-expired blocking modal: the upgrade-gate JSX + CTA + AppOverlay shell; cohesive gate.
apps/web/components/ui/settings-group.tsx:56 · SettingsGroupRow · 120 · DEFER:root — settings-group row primitive: leading/trailing/value slots + press/disabled states; cohesive kit row consumed across settings.
apps/web/components/ui/settings-row.tsx:27 · SettingsRow · 109 · DEFER:root — settings row primitive: leading icon + label/sublabel + trailing affordance + press state; cohesive kit row.
apps/web/components/ui/app-bar.tsx:39 · AppBar · 107 · DEFER:root — the top app-bar primitive: back/title/leading/trailing slots + gradient + safe-area; cohesive kit shell consumed by every screen.
apps/web/components/ui/expiry-warning.tsx:10 · ExpiryWarning · 107 · DEFER:root — subscription/key expiry warning banner: tone derivation (overdue/soon) + the banner JSX; cohesive status banner.
apps/web/components/upgrade/plan-card.tsx:17 · PlanCard · 101 · DEFER:root — the pricing plan card: feature-list + price/CTA + selected state; cohesive card consumed by PricingSection.

## SKIP — not a rule-7 logic function (inline list renderer)

apps/web/app/(app)/calendar-sync/page.tsx:544 · (anon) · 121 · SKIP:not-a-function — `.map(x => {...})` inline list renderer inside CalendarSyncPage (round-3 06-quality "Evaluated -- NOT findings": inline list renderers are not standalone rule-7 logic fns).
apps/web/app/(app)/advanced/page.tsx:368 · (anon) · was 120 -> RESOLVED: the inline `.map` API-key row renderer shrank below 100 after the F14 revoke split (inline expand -> single ConfirmDialog); no longer >100.

## DEF-2b file-exempt (do NOT touch — pre-exempt; not re-counted as findings)

apps/web/components/habits/habit-list.tsx:149 · HabitList · 1166 · DEFER:root DEF-2b exempt (web HabitList — coupled form/dirty/mutation/bulk/drag orchestration root, rule-6 over rule-7).
apps/web/components/habits/habit-list.tsx:1056 · renderMainContent · 170 · DEFER:root DEF-2b exempt — the main-content branch renderer INSIDE the DEF-2b habit-list.tsx file (brief: "DEF-2b exempts web habit-list.tsx — don't touch"); shares the list drill/select/view state.

# ============================================================
# Round-4 · SPLIT-WEB-2 · issue #107 · apps/web rule-10 (web<->mobile dup) closure
# ============================================================

## RESOLVED this round

apps/web/components/ui/highlight-text.tsx · highlightText (699 vs mobile) · RESOLVED — web-local dup DELETED; component now imports the existing shared @orbit/shared/utils highlightText. Mobile twin already imports it (was not actually local at c8f4292). Both platforms now share the util. Guard: highlight-text.test (8) + habit-list.test green.

## DEFER:adapter — sanctioned thin platform adapters (D12); core differs by platform (Server Action vs apiClient + SQLite offline queue). Not lifted (would require a queue/storage adapter abstraction AND editing apps/mobile — out of scope). Mirror of the mobile-side DEFER:adapter entries.

apps/web/hooks/use-tags.ts:186/217/249 · onMutate x3 (with mobile use-tags.ts) · DEFER:adapter — optimistic tag cache surgery; identical patch logic, platform mutationFn (web Server Action vs mobile performQueuedApiMutation).
apps/web/hooks/use-checklist-templates.ts:42/79 · onMutate x2 (with mobile twin) · DEFER:adapter — same optimistic-cache pattern, platform mutationFn differs.
apps/web/hooks/use-goals.ts:65 · onMutate (with mobile twin) · DEFER:adapter — same.
apps/web/hooks/use-notifications.ts onMutate x3 (with mobile twin) · DEFER:adapter — same.
apps/web/hooks/use-login-code-entry.ts:71 · onCodeInput (with mobile twin) · DEFER:adapter — completeness already routes through shared isVerificationCodeComplete/VERIFICATION_CODE_LENGTH (D33); residual is web input events vs RN TextInput key handling.
apps/web/hooks/use-tag-selection.ts:55 · useTagSelection wrapper (with mobile twin) · DEFER:adapter — shared CORE lifted (D33, @orbit/shared/hooks); web wrapper is the adapter shell. Whole-wrapper lift touches the mobile twin.
apps/web/hooks/use-dismiss-guard.ts:11 · useDismissGuard wrapper (with mobile twin) · DEFER:adapter — shared CORE lifted (D33); web wrapper is the adapter shell.
apps/web/lib/pending-notification-deletes.ts:33 · queuePendingNotificationDelete (with mobile twin) · DEFER:adapter — identical queue logic; web localStorage vs mobile SQLite offline store. Storage seam differs.
apps/web/hooks/use-habits.ts:141 · findCachedGoals (with mobile habit-mutation-helpers.ts:374) · DEFER:adapter — identical cache-read shape; mobile's lives in the offline mutation-helpers module.
apps/web/hooks/use-tour-mock-data.ts:46/66 · anon + restore (with mobile twin) · DEFER:adapter — tour mock-data restore; identical body, platform store handle differs.
apps/web/hooks/use-habit-form.ts:175 · anon setGeneral (with mobile twin) · DEFER:adapter — rhf setter inside the platform form hook; identical, bound to each platform's form instance.
apps/web onboarding/goal/habit/chat anon pairs (onboarding-create-goal/complete, create-api-key-modal, breakdown-suggestion handleConfirm, goal-card, habit-detail-drawer summaryStrip, support, advanced scopeOptions, streak encouragement) · DEFER:adapter — JSX/handler bodies identical to mobile twins but embedded in platform components (web shadcn/Server-Action vs RN primitives + apiClient). Below the value line for a shared lift; each is a view/handler adapter.

Note: the <300-char identical bodies are DEF-8 (not reported). highlightText was the only ≥300-char body that lifted cleanly without touching mobile. The rest are genuine D12 adapters; a future shared `applyOptimistic` lift is a cross-repo refactor.

# SPLIT-WEB-2 addendum (register completeness)
apps/web/app/(app)/calendar-sync/page.tsx:96 · AutoSyncSettingsCard · 163 · DEFER:root — the auto-sync settings card already extracted from CalendarSyncPage: sync-frequency/window toggles + their optimistic mutations + the settings rows JSX. Cohesive settings group; the toggles share the auto-sync prefs state.
