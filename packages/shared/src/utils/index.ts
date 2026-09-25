export { achievementEmoji } from './achievement-emoji'
export { getRadioNavigationIndex } from './radio-navigation'
export { createClientId } from './client-id'
export {
  parseAPIDate,
  formatAPIDate,
  formatAPIDateInTimeZone,
  getAccountDateTime,
  nowDate,
  resolveHabitDetailRouteDate,
  type AccountDateTime,
} from './dates'
export {
  buildHabitHistoryMonth,
  appendHabitDetailChild,
  buildHabitDetailChildDateModel,
  buildHabitDetailUpdateRequest,
  buildHabitDetailSchedulePatch,
  buildHabitDetailTimePatch,
  canInlineEditHabitSchedule,
  buildHabitStripModel,
  canNavigateHabitHistoryBack,
  canNavigateHabitHistoryForward,
  getHabitHistoryLog,
  getHabitStartDate,
  habitHistoryCutoff,
  isHabitHistoryMonthLoaded,
  isHabitCompletedOnDate,
  isHabitSlipping,
  formatHabitDetailReminderValue,
  hasAuthoritativeHabitRelationshipState,
  HABIT_DETAIL_FREQUENCY_UNITS,
  HABIT_DETAIL_WEEKDAYS,
  mergeHabitDetailWithScopedHabit,
  parseHabitHistoryDate,
  removeHabitDetailChild,
  shouldResetHabitChecklist,
  shouldShowHabitMetrics,
  type HabitHistoryDay,
  type HabitDetailChildDateModel,
  type HabitStripModel,
} from './habit-detail-flow'
export { buildCalendarMonthModel, deriveCalendarStats } from './calendar-month'
export {
  CALENDAR_MONTH_GRID_GEOMETRY,
  CALENDAR_MONTH_GRID_RESERVED_DAY_HEIGHT,
  resolveCalendarMonthDisplayState,
  type CalendarMonthDisplayState,
} from './calendar-month-state'
export {
  buildDayCellAccessibleName,
  getDayStripStateWord,
  resolveDayCellOutcome,
} from './date-surfaces'
export type {
  CalendarMonthDay,
  CalendarMonthModel,
  CalendarMonthStats,
} from './calendar-month'
export { getTimezoneList } from './timezones'
export { isValidEmail } from './email'
export { isRecord } from './is-record'
export {
  AUTH_BACKEND_ERROR_MAP,
  createVerificationCodeDigits,
  extractAuthBackendMessage,
  fillVerificationCodeDigits,
  getAuthLoginErrorKey,
  isValidVerificationCode,
  isVerificationCodeComplete,
  normalizeVerificationCodeInput,
  resolveAuthLoginErrorKey,
  VERIFICATION_CODE_LENGTH,
  type AuthLoginErrorInput,
  recordLoginFailure,
  deriveLoginEmailSubmission,
  formatLoginCountdown,
  type LoginAttempts,
  type LoginCodeFailure,
} from './auth-login'
export {
  ApiClientError,
  createApiClientError,
  ERROR_CODE_TO_KEY,
  extractBackendError,
  extractBackendErrorCode,
  extractBackendFieldErrors,
  extractBackendRequestId,
  extractBackendStatus,
  isPayGateError,
  getErrorMessage,
  getFriendlyErrorKey,
  getFriendlyErrorMessage,
  translateErrorKey,
  validateApiResponse,
} from './error-utils'
export { isFeatureEnabled } from './config'
export { getMarkdownImageLabel, stripInlineMarkdown } from './markdown'
export {
  resolveShellDestination,
  SHELL_DESTINATION_ROUTES,
} from './shell-destinations'
export type {
  ShellDestinationId,
  ShellDestinationRoute,
} from './shell-destinations'
export { plural } from './plural'
export { buildRecentChatHistory } from './chat-history'
export {
  CALENDAR_NOT_CONNECTED_ERROR_CODE,
  CALENDAR_RECONNECT_REQUIRED_ERROR_CODE,
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  resolveCalendarEventsGrantRevocation,
  type CalendarEventsGrantRevocationAction,
  formatCalendarAutoSyncLastSynced,
  formatCalendarSyncRecurrenceLabel,
  filterCalendarSyncEventsByDate,
  getCalendarSyncClockValue,
  getCalendarSyncImportIssue,
  getCalendarSyncImportIssueMessageKey,
  isCalendarAutoSyncStatusReconnectRequired,
  isCalendarSyncConnectionActive,
  isCalendarSyncEventImportable,
  isCalendarSyncNotConnectedMessage,
  parseCalendarSyncRecurrence,
  resolveCalendarSyncEndDate,
  reconcileCalendarAutoSyncGrantRevocation,
} from './calendar-sync'
export type {
  CalendarSyncEvent,
  CalendarSyncImportIssue,
  CalendarSyncImportIssueMessageKey,
  CalendarSyncParsedRecurrence,
  CalendarSyncTranslationAdapter,
} from './calendar-sync'
export {
  buildGoogleCalendarOAuthOptions,
  GOOGLE_CALENDAR_CONSENT_QUERY_PARAMS,
  GOOGLE_CALENDAR_OAUTH_QUERY_PARAMS,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from './google-calendar-auth'
export {
  applyChecklistTemplate,
  CHECKLIST_TEMPLATE_STORAGE_KEY,
  createChecklistTemplate,
  deleteChecklistTemplate,
  LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY,
  parseChecklistTemplates,
  resolveChecklistTemplates,
} from './checklist-templates'
export {
  buildCreateHabitRequest,
  buildSubHabitRequest,
  buildUpdateHabitRequest,
  buildRescheduleUpdateRequest,
} from './habit-request-builders'
export type { HabitFormData } from './habit-request-builders'
export {
  filterHabitEmojiCategories,
  HABIT_EMOJI_CATEGORIES,
  HABIT_EMOJI_OPTIONS,
} from './habit-emoji-options'
export { readHabitPhrase, segmentHabitPhrase } from './habit-phrase-parser'
export type {
  HabitPhraseCadence,
  HabitPhraseRead,
  HabitPhraseSegment,
  HabitPhraseToken,
  HabitPhraseTokenKind,
} from './habit-phrase-parser'
export {
  applyHabitFormMode,
  buildEditHabitFormState,
  buildEmptyHabitFormValues,
  buildParentHabitFormState,
  DEFAULT_REMINDER_TIMES,
  resolveAutoManagedReminderEnabled,
  resolveHabitFormMode,
  toggleSelectedId,
} from './habit-form-state'
export type {
  AutoManagedReminderEnabledInput,
  EditHabitFormStateSnapshot,
  HabitFormMode,
  HabitFormModeActions,
  HabitFormStateSnapshot,
} from './habit-form-state'
export {
  buildHabitDaysList,
  buildHabitAstraFallbackCopy,
  buildHabitFormPatchFromSuggestion,
  buildHabitUnderstandingLabels,
  buildHabitUnderstandingSentence,
  clearHabitFormProposalSection,
  createHabitFormController,
  createHabitFormSuggestionRevision,
  EMPTY_HABIT_FORM_PROPOSAL,
  applyHabitDayCorrection,
  applyHabitPhraseRead,
  applyHabitQuantityCorrection,
  formatHabitReminderLabel,
  buildHabitFrequencyUnits,
  coalesceFormText,
  HABIT_REMINDER_PRESETS,
  formatHabitTimeInput,
  getHabitFormFlags,
  habitFeaturePlan,
  hasHabitFormProposal,
  isHabitAstraLimitReached,
  normalizeHabitFormData,
  releaseHabitPhraseOwnership,
  requestHabitFormProposal,
  resolveHabitStartDate,
  shouldShowHabitAstraFallback,
  isValidHabitTimeInput,
  validateHabitFormInput,
} from './habit-form-helpers'
export type {
  HabitDayOption,
  HabitFormSuggestionPatch,
  HabitFormCommonProps,
  HabitFormController,
  HabitFormControllerOptions,
  HabitFormProposal,
  HabitFormSuggestionRevision,
  HabitPhraseFormOwnership,
  HabitUnderstandingLabels,
  HabitUnderstandingProps,
  HabitFormTranslationAdapter,
  HabitFormValidationContext,
} from './habit-form-helpers'
export {
  canLogHabitOnDate,
  computeHabitCardStatus,
  computeHabitFlexibleProgressLabel,
  computeHabitFrequencyLabel,
  computeHabitFutureHint,
  computeHabitMatchBadges,
} from './habit-card-helpers'
export type {
  HabitCardMatchBadge,
  HabitCardStatus,
  HabitCardTranslationAdapter,
} from './habit-card-helpers'
export { formatHabitDetailSummary } from './habit-detail-summary'
export { parseShowGeneralOnTodayPreference } from './preferences'
export {
  capitalizeFirstLetter,
  detectDefaultTimeFormat,
  formatLocaleDate,
  formatLocaleDateTime,
  formatLocaleTime,
  formatDeviceDate,
  formatDeviceDateTime,
  formatDeviceTime,
  getSystemLocale,
  resolveSupportedLocale,
  resolveSystemLocale,
  splitMonthYear,
} from './locale-format'
export {
  DAY_PERIODS,
  formatTimeParts,
  from12Hour,
  HOURS_12,
  HOURS_24,
  MINUTES,
  padTimePart,
  parseTimeParts,
  to12Hour,
} from './time-parts'
export type { DayPeriod, TimeParts } from './time-parts'
export { buildYearRange } from './year-range'
export {
  CALENDAR_HORIZONTAL_SWIPE_DIRECTION_RATIO,
  CALENDAR_MONTH_SWIPE_THRESHOLD,
  filterRecurringDayMap,
  filterRecurringEntries,
  resolveCalendarEventsDisplayState,
} from './calendar-entries'
export type { CalendarEventsDisplayState } from './calendar-entries'
export {
  CALENDAR_MONTH_MAX_RANGE_DAYS,
  buildCalendarRangeModel,
  MAX_RANGE_DAYS,
  resolveCalendarRangeEnd,
  splitCalendarMonthRange,
} from './calendar-range'
export type { CalendarRangeChunk, CalendarRangeModel } from './calendar-range'
export { fetchAllPaginatedItems } from './pagination'
export {
  buildHabitQueryString,
  buildUrlWithQuery,
  getDailySummaryTimeBucket,
  getMsUntilNextDailySummaryTimeBucket,
} from './habit-query'
export {
  applySubscriptionDiscount,
  formatPrice,
  monthlyEquivalent,
} from './subscription-pricing'
export { resolveSubscriptionScreen } from './subscription-screen'
export { subscriptionSummary } from './subscription-summary'
export type {
  ResolveSubscriptionScreenInput,
  SubscriptionPortalState,
  SubscriptionScreenContent,
  SubscriptionScreenModel,
  SubscriptionScreenState,
} from './subscription-screen'
export {
  APP_VERSION_HEADER,
  buildClientTimeZoneHeaders,
  CLIENT_TIME_ZONE_HEADER,
  getClientTimeZone,
} from './client-context'
export { isVersionBelow } from './version'
export { formatTimeFieldInput } from './time-field'
export { buildReferralUrl, buildRecapShareUrl, isValidReferralCode } from './referral'
export {
  canRepeatOnboardingScheduleWeeks,
  canSnapshotOnboardingEntry,
  clampOnboardingRepeatWeeks,
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  buildOnboardingHabitInput,
  buildOnboardingScheduleFromPhrase,
  buildOnboardingScheduleFromSuggestion,
  changeOnboardingScheduleMode,
  toggleOnboardingScheduleDay,
  getOnboardingHabitTitle,
  getOnboardingCompleteCopy,
  getOnboardingScheduleMode,
  getOnboardingReminderPreviewTime,
  getOnboardingRemindCopy,
  isOnboardingHabitDueToday,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_STARTERS,
  ONBOARDING_WHAT_STEP,
  ONBOARDING_WHEN_STEP,
  ONBOARDING_TOTAL_STEPS,
  ONBOARDING_REMINDER_MINUTES,
  resolveRetainedOnboarding,
  shouldRequestOnboardingSuggestion,
} from './onboarding'
export type { OnboardingCompleteCopy, OnboardingCompleteState, OnboardingRemindCopy, OnboardingRemindState, OnboardingSchedule, OnboardingScheduleMode, RetainedOnboardingAction } from './onboarding'
export {
  isMissingBillingError,
  isMissingBillingStatus,
} from './billing'
export {
  PLAY_BASE_PLAN_MONTHLY,
  PLAY_BASE_PLAN_YEARLY,
  PLAY_PACKAGE_NAME,
  PLAY_REFERRAL_OFFER_TAG,
  PLAY_SUBSCRIPTION_PRODUCT_ID,
  playBasePlanToInterval,
  playManageSubscriptionUrl,
} from './play-billing'
export {
  applyLinkedGoalUpdates,
  buildChildrenIndex,
  habitDetailToNormalized,
  normalizeHabitQueryData,
  normalizeHabits,
  sortNormalizedHabits,
} from './habit-normalization'
export {
  buildHabitPickerOptions,
  filterHabitPickerOptions,
} from './habit-picker'
export type { HabitPickerOption } from './habit-picker'
export {
  buildHabitDateBuckets,
  computeParentSettlementDecision,
  computeParentPromptProgress,
} from './habit-list-progress'
export type {
  HabitDateBucket,
  HabitResolution,
  HabitResolutionMode,
  ParentPromptProgress,
  ParentPromptProgressOptions,
  ParentSettlementDecision,
} from './habit-list-progress'
export {
  buildGoalTitle,
  getFirstGoalDraftFieldError,
  getGoalDraftFieldErrorKeys,
  isGoalDeadlinePast,
  parseGoalTargetValue,
  validateGoalDraftInput,
  validateGoalProgressInput,
} from './goal-form'
export type { GoalDraftFieldError, GoalDraftFieldErrorKeys } from './goal-form'
export {
  createEmptyNotificationsResponse,
  deleteNotificationFromList,
  invalidateNotificationList,
  markAllNotificationsReadInList,
  markNotificationReadInList,
  restoreNotificationList,
  snapshotNotificationList,
} from './notification-cache'
export { formatNotificationRelativeTime } from './notification-time'
export { getReturningInterval, type ReturningInterval } from './returning-interval'
export {
  getNotificationDetailActionVisibility,
  getNotificationDestination,
  getNotificationTargetKey,
  getNotificationInboxState,
  isViewableNotificationUrl,
  resolveNotificationUrl,
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
  shouldShowTodayAstraSurface,
} from './notification-actions'
export {
  buildTempGoal,
  nextGoalPosition,
  sortGoalsByPosition,
  updateGoalDetailItem,
  updateGoalListItem,
  updateGoalProgressDetail,
  updateGoalProgressItem,
  updateGoalStatusDetail,
  updateGoalStatusItem,
} from './goal-mutations'
export {
  formatGoalHistoryDelta,
  formatGoalHistoryNumber,
  formatGoalMetricsDate,
  getGoalMetricsStatusPresentation,
} from './goal-metrics'
export { normalizeGoalQueryData } from './goal-query'
export type { NormalizedGoalsData } from './goal-query'
export {
  appendTag,
  mapHabitTagReferences,
  removeTagFromList,
  resolveHabitTags,
  setHabitTags,
  updateTagInList,
} from './tag-cache'
export {
  getCurrentPlan,
  getIsYearlyPro,
  getTrialDaysLeft,
  getTrialExpired,
  getTrialUrgent,
} from './profile-selectors'
export {
  getAgentCapabilityLabelKey,
  getAgentOperationLabelKey,
  getAgentPolicyReasonKey,
} from './agent-pending-operation'
export { coalesceAgentOperationOutcomes } from './agent-operation-outcomes'
export type { AgentOperationOutcome } from './agent-operation-outcomes'
export {
  calculateXpProgress,
  deriveGamificationProfileState,
  detectCrossedStreakMilestones,
  detectGamificationMilestones,
  deriveStreakFreezeState,
  getAchievementsByCategory,
  getEarnedAchievements,
  getLockedAchievements,
  getStreakTierLabelKey,
  isShareableAchievement,
  SHAREABLE_ACHIEVEMENT_RARITIES,
} from './gamification-selectors'
export type {
  GamificationMilestoneState,
  GamificationProfileDerivedState,
  StreakFreezeDerivedState,
  StreakFreezeFallback,
} from './gamification-selectors'
export {
  buildCalendarDayMap,
  optimisticSetCalendarHabitLog,
  rollbackOptimisticCalendarHabitLog,
  rollbackOptimisticHabitLogs,
  buildUnresolvedBulkFailures,
  rebaseSelectedIds,
  computeHabitReorderPositions,
  collectSelectableDescendantIds,
  collectVisibleHabitTreeIds,
  DEFAULT_OVERDUE_WINDOW_DAYS,
  determineHabitDayStatus,
  getHabitEmptyStateKey,
  hasAncestorInSet,
  hasHabitScheduleOnDate,
  isWithinOverdueWindow,
} from './habits'
export {
  buildHabitCalendarDayCells,
  buildHabitCalendarWeekdayKeys,
  buildHabitLogDateSet,
} from './habit-calendar'
export { buildStreakWeekDays } from './streak-week'
export {
  canNavigateToNextDay,
  getDayOffset,
  getTodayBoundary,
  isCalendarDayLoggable,
  type TodayBoundary,
} from './today-date'
export type {
  HabitHierarchyNode,
  HabitReorderPosition,
  ReorderableHabitItem,
} from './habits'
export type {
  HabitCalendarDayCell,
  HabitCalendarWeekdayKey,
} from './habit-calendar'
export {
  loadDrillChildren,
  mergeDrillChildrenMap,
  normalizeDrillDetailChild,
  normalizeHabitDetailForDrill,
} from './drill-navigation'
export type { NormalizedDrillDetail } from './drill-navigation'
export {
  buildOptimisticSkipPatch,
  findHabitInList,
  findHabitInTree,
  getTomorrowDateString,
  optimisticPatchHabit,
  withChildren,
} from './habit-optimistic'
export type { HabitTreeNode } from './habit-optimistic'
export { initialsOf } from './name-initials'
export {
  buildBreakdownCreateRequest,
  filterValidBreakdownHabits,
  getBreakdownCadenceKey,
  nextBreakdownCadence,
} from './breakdown-suggestion'
export type { BreakdownEditableHabit } from './breakdown-suggestion'
export {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  subscribePendingNotificationDeleteIds,
} from './pending-notification-deletes'
export { createSessionScopedRunner } from './session-scope'
export {
  createHabitVisibilityHelpers,
  filterMoveTargetsBySearch,
  getChildrenFromIndex,
  isCompletedOneTimeHabit,
  isHabitSelectableAsMoveTarget,
  isHabitVisibleInAllView,
} from './habit-visibility'
export type {
  HabitVisibilityHelpers,
  HabitVisibilityOptions,
  HabitVisibilityView,
} from './habit-visibility'
export {
  buildRetrospectiveRequestUrl,
  getBestRetrospectiveWeekdayKey,
} from './retrospective'
export type {
  RetrospectivePeriod,
  RetrospectiveResponse,
  RetrospectiveWeekdayKey,
} from './retrospective'
export {
  buildRecapRequestUrl,
  buildShareCardStats,
  buildShareCardWeekday,
  formatCompletionRate,
  isRecapShareEmpty,
  parseWrappedRouteSelection,
  RECAP_SHARE_PERIODS,
  SHARE_CARD_FILE_NAME,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  WRAPPED_WEEKDAY_KEYS,
  recapPeriodLabelKey,
} from './share-card'
export type {
  ClosedRecapMonth,
  RecapSharePeriod,
  ShareCardStat,
  ShareCardWeekday,
  WrappedRouteSelection,
} from './share-card'
export {
  buildWrappedSlides,
  getWeeklyConsistencyReading,
} from './wrapped'
export type {
  WeeklyConsistencyReading,
  WrappedSlide,
  WrappedSlideId,
} from './wrapped'
export {
  canAccessEntitlement,
  DEFAULT_FREE_COLOR_SCHEME,
  resolveAccessibleColorScheme,
  resolveUpgradeEntitlementDenial,
  resolveUpgradeEntitlementFromError,
  resolveUpgradeEntitlementFromPolicyDenial,
} from './upgrade'
export type {
  UpgradeAccessSnapshot,
  UpgradeDenialInput,
  UpgradeEntitlementMode,
  UpgradeEntitlementRequirement,
  UpgradeEntitlementResolution,
} from './upgrade'
export {
  buildWeekStartOptions,
  LANGUAGE_OPTIONS,
} from './preferences-options'
export type {
  LabeledOption,
  PreferencesTranslationAdapter,
} from './preferences-options'
export {
  buildAgentScopeOptions,
  buildMcpConfigJson,
  MCP_CONFIG_TABS,
  MCP_ENDPOINT_URL,
  WIDGET_FEATURES,
  WIDGET_STEP_KEYS,
} from './advanced-settings'
export type {
  AgentScopeOption,
  McpConfigTab,
  WidgetFeatureDefinition,
  WidgetFeatureIconKey,
} from './advanced-settings'
export {
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  FRESH_START_DELETED_ITEM_KEYS,
  FRESH_START_PRESERVED_ITEM_KEYS,
} from './fresh-start'
export {
  buildSupportRequestBody,
  normalizeSupportSubjectId,
  SUPPORT_API_MESSAGE_MAX_LENGTH,
  attachSupportVersion,
  buildSupportVersionSuffix,
  getSupportMessageMaxLength,
  getSupportMessageFit,
  getSupportSendReasonKey,
  SUPPORT_SUBJECT_OPTIONS,
} from './support'
export type {
  SupportFormFields,
  SupportProfileFields,
  SupportRequestBody,
  SupportSubjectId,
} from './support'
export {
  achievementGlyphKey,
  buildGoalMovePositions,
  buildProtectedDayLabels,
  deriveProgressViewState,
  filterProgressGoals,
  formatStreakDate,
  formatStreakRepairDates,
  getProgressGoalLabelKey,
  deriveStreakRepairState,
  getStreakRepairErrorMessageKey,
  getGoalDeadlinePresentation,
  getGamificationLevelTitleKey,
  PROGRESS_GOAL_FILTERS,
  visibleProgressAchievements,
  isProgressEmpty,
} from './progress'
export type {
  AchievementGlyphKey,
  GoalDeadlineState,
  ProgressGoalFilter,
  StreakRepairState,
} from './progress'
export {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
} from './profile-navigation'
export type {
  ProfileNavHintMode,
  ProfileNavIconKey,
  ProfileNavItem,
  ProfileNavSection,
  ProfileNavVariant,
} from './profile-navigation'
export * from './step-up'
export {
  getNativePushStatusMessageKey,
  getNativePushStatusPresentation,
  getNativePushStatusTone,
  getPushStatusToneClass,
  getWebPushStatusMessageKey,
  getWebPushStatusPresentation,
  getWebPushStatusTone,
} from './push-notification-settings'
export type {
  NativePushPermissionStatus,
  NativePushRegistrationStatus,
  NativePushStatusSnapshot,
  PushStatusPresentation,
  PushStatusTone,
  WebPushPermission,
  WebPushPreferenceStatus,
} from './push-notification-settings'
export {
  tintProposedChildren,
  type ProposedTintAdapter,
  type ProposedTintDecision,
  type ProposedTintElementProps,
} from './proposed-tint'

export { searchCommands, type SearchCommandPage, type SearchCommandId } from './search-commands'
export { buildCommandHabitList, type CommandHabitEntry } from './command-habit-list'

export * from './error-surface'

export { buildSearchEntries, buildSearchMatchLines, type SearchMatchLine } from './search-presentation'
