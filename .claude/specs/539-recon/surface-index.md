# #539 surface index (routes + modals) → files

Total surfaces mapped: 47

## create-habit-modal
- web: apps/web/components/habits/create-habit-modal.tsx
- mobile: apps/mobile/components/habits/create-habit-modal.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton, ConfirmDialog, HabitFormFields, Field / AppTextInput
- notes: Orchestrates shared form with tag/goal/sub-habit/reminder state and AI-suggest flow. Uses AppOverlay on web, BottomSheetModal on mobile. Dismiss guard confirms changes before closing.

## edit-habit-modal
- web: apps/web/components/habits/edit-habit-modal.tsx
- mobile: apps/mobile/components/habits/edit-habit-modal.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton, ConfirmDialog, HabitFormFields, Field / AppTextInput
- notes: Mirrors create-habit-modal but for editing existing habits. Same form orchestration and shared primitives.

## habit-detail-drawer
- web: apps/web/components/habits/habit-detail-drawer.tsx
- mobile: apps/mobile/components/habits/habit-detail-drawer.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), ConfirmDialog, SectionLabel, HabitChecklist, HabitCalendar, HabitDetailHeader, HabitDetailReminders
- notes: Full habit detail view with checklist, calendar, stats, reminders. Mobile uses withDrawerContentInset for bottom sheet styling.

## reschedule-sheet
- web: apps/web/components/habits/reschedule-sheet.tsx
- mobile: apps/mobile/components/habits/reschedule-sheet.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton
- notes: Reschedule habit with AI suggestion cards. Simple sheet with minimal content.

## create-goal-modal
- web: apps/web/components/goals/create-goal-modal.tsx
- mobile: apps/mobile/components/goals/create-goal-modal.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton, ConfirmDialog, FieldWell, GoalTypeSelector, GoalTargetFields, GoalDeadlineField
- notes: Goal creation with type selector, target fields, and deadline. Dismiss guard on dirty state.

## edit-goal-modal
- web: apps/web/components/goals/edit-goal-modal.tsx
- mobile: apps/mobile/components/goals/edit-goal-modal.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton, ConfirmDialog
- notes: Edit existing goal. Same structure as create but with populated form values.

## goal-detail-drawer
- web: apps/web/components/goals/goal-detail-drawer.tsx
- mobile: apps/mobile/components/goals/goal-detail-drawer.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), ConfirmDialog, EditGoalModal, PillButton, GoalMetricsPanel, GoalProgressForm
- notes: Full goal detail view with metrics, progress tracking, and action footer. Embeds EditGoalModal for inline editing.

## notification-detail-modal
- web: apps/web/components/navigation/notification-detail-modal.tsx
- mobile: apps/mobile/components/navigation/notification-detail-modal.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile)
- notes: Notification detail view with body copy and action buttons. Minimal chrome, no special form fields.

## feature-guide-drawer
- web: apps/web/components/onboarding/feature-guide-drawer.tsx
- mobile: apps/mobile/components/onboarding/feature-guide-drawer.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), Chip
- notes: Onboarding feature guide with tabbed sections (astra, connect, social, habits, goals, calendar, rewards, settings, notifications).

## referral-drawer
- web: apps/web/components/referral/referral-drawer.tsx
- mobile: apps/mobile/components/referral/referral-drawer.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton, ProgressBar, SectionLabel, SettingsRow, InfoCard
- notes: Referral stats, link copy, progress rows, and share CTA. Hero icon disc, mono link well, progress indicators.

## share-card-sheet
- web: apps/web/components/share/share-card-sheet.tsx
- mobile: apps/mobile/components/share/share-card-sheet.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton, Chip, SatelliteGlyph
- notes: Recap share preview with period selector, recap fetch, branded ShareCard, and native share. Shows empty state via SatelliteGlyph.

## rail-drawer
- web: apps/web/components/shell/rail-drawer.tsx
- mobile: 
- shared: RailDrawer (web-only right-side slide-in)
- notes: Web-only. Right-side slide-in drawer for desktop breakpoint (768–1279px) showing contextual rail content. Distinct from cross-platform modals.

## tour-replay-modal
- web: apps/web/components/tour/tour-replay-modal.tsx
- mobile: apps/mobile/components/tour/tour-replay-modal.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton
- notes: Tour replay modal with section list and step icons. Allows users to re-run onboarding tours.

## confirm-dialog
- web: apps/web/components/ui/confirm-dialog.tsx
- mobile: apps/mobile/components/ui/confirm-dialog.tsx
- shared: AnimatePresence / Animated (motion library), PillButton (internal button styling)
- notes: Generic confirmation dialog with danger/warning/success/info variants. Title + description + confirm/cancel pills. Handles focus management, keyboard trap, and overlay stacking on both platforms.

## create-api-key-modal
- web: apps/web/components/ui/create-api-key-modal.tsx
- mobile: apps/mobile/components/ui/create-api-key-modal.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton, FieldInput / AppTextInput, Chip, Switch
- notes: API key creation form with name input, scope checkboxes, and expiry toggle. Displays created key in mono font well.

## trial-expired-modal
- web: apps/web/components/ui/trial-expired-modal.tsx
- mobile: apps/mobile/components/ui/trial-expired-modal.tsx
- shared: AppOverlay (web) / Modal (mobile, full-screen), PillButton
- notes: Trial-expired upsell modal with crown hero, paused Pro features list, and upgrade CTAs. Async storage gating (seen-once). Web uses AppOverlay, mobile uses Modal for full-screen presentation.

## edit-name-sheet
- web: apps/web/app/(app)/profile/_components/edit-name-sheet.tsx
- mobile: apps/mobile/app/(tabs)/profile/_components/edit-name-sheet.tsx
- shared: AppOverlay (web) / BottomSheetModal (mobile), PillButton, FieldInput (web) / AppTextInput (mobile)
- notes: Simple edit-name form used in profile. Validates name, handles submission via updateName (web) or apiClient (mobile). Mobile uses offline queue mutation.

## version-update-drawer
- web: 
- mobile: apps/mobile/components/version-update-drawer.tsx
- shared: BottomSheetModal
- notes: Mobile-only. App version update notification drawer.

## move-parent-dialog
- web: 
- mobile: apps/mobile/components/habit-list/move-parent-dialog.tsx
- shared: ConfirmDialog
- notes: Mobile-only. Dialog for moving a habit to a different parent in the hierarchy.

## confirm-dialogs (habit-specific)
- web: apps/web/components/habits/habit-list/confirm-dialogs.tsx
- mobile: apps/mobile/components/habit-list/confirm-dialogs.tsx
- shared: ConfirmDialog
- notes: Habit-specific confirmation dialogs (delete, duplicate, etc.). Specialized uses of the generic ConfirmDialog primitive.

## Today / Home
- web: apps/web/app/(app)/page.tsx, apps/web/app/(app)/today-page-view.tsx, apps/web/app/(app)/today-sections.tsx, apps/web/app/(app)/use-today-page.tsx
- mobile: apps/mobile/app/(tabs)/index.tsx, apps/mobile/app/(tabs)/today-shell.tsx, apps/mobile/app/(tabs)/today-sections.tsx, apps/mobile/app/(tabs)/today-modals.tsx
- shared: SectionLabel, HabitRow, StatusDot, ProgressRing, PillButton, StatTile, BulkActionBarV2, TrialBanner, DismissibleCard

## Calendar (Month/Week/Range/Agenda views)
- web: apps/web/app/(app)/calendar/page.tsx, apps/web/app/(app)/calendar/_components/calendar-shell.tsx
- mobile: apps/mobile/app/(tabs)/calendar.tsx, apps/mobile/app/(tabs)/calendar/_components/calendar-grid.tsx, apps/mobile/app/(tabs)/calendar/_components/calendar-week-view.tsx, apps/mobile/app/(tabs)/calendar/_components/calendar-range-view.tsx, apps/mobile/app/(tabs)/calendar/_components/calendar-day-detail.tsx, apps/mobile/app/(tabs)/calendar/_components/calendar-stats.tsx
- shared: SectionHeadTabs, StatTile, ProgressBar, PillButton, AppOverlay, CalendarDayEntry type, calendar utilities (formatAPIDate, parseAPIDate)

## Profile
- web: apps/web/app/(app)/profile/page.tsx, apps/web/app/(app)/profile/_components/profile-identity-header.tsx, apps/web/app/(app)/profile/_components/profile-stat-tiles.tsx, apps/web/app/(app)/profile/_components/profile-feature-sections.tsx, apps/web/app/(app)/profile/_components/profile-nav-sections.tsx, apps/web/app/(app)/profile/_components/subscription-card.tsx, apps/web/app/(app)/profile/_components/profile-modals.tsx
- mobile: apps/mobile/app/(tabs)/profile.tsx, apps/mobile/app/(tabs)/profile/_components/profile-identity.tsx, apps/mobile/app/(tabs)/profile/_components/profile-stat-row.tsx, apps/mobile/app/(tabs)/profile/_components/profile-sections.tsx, apps/mobile/app/(tabs)/profile/_components/delete-account-modal.tsx, apps/mobile/app/(tabs)/profile/_components/fresh-start-modal.tsx, apps/mobile/app/(tabs)/profile/_components/edit-name-sheet.tsx
- shared: StatTile, PillButton, SettingsRow, ConfirmDialog, ProgressRing, NavHeader

## Achievements
- web: apps/web/app/(app)/achievements/page.tsx, apps/web/app/(app)/achievements/_components/achievement-category-section.tsx, apps/web/app/(app)/achievements/_components/achievement-xp-card.tsx, apps/web/app/(app)/achievements/_components/achievements-locked-state.tsx
- mobile: apps/mobile/app/achievements.tsx, apps/mobile/app/achievements-sections.tsx
- shared: StatTile, Badge, ProgressBar, InfoCard, PillButton, EmptyState

## Streak
- web: apps/web/app/(app)/streak/page.tsx, apps/web/app/(app)/streak/_components/streak-hero.tsx, apps/web/app/(app)/streak/_components/streak-frozen-banner.tsx, apps/web/app/(app)/streak/_components/streak-sections.tsx
- mobile: apps/mobile/app/streak.tsx, apps/mobile/app/streak-sections.tsx, apps/mobile/app/streak-sections-freeze.tsx
- shared: StatTile, ProgressRing, PillButton, status tokens (done/frozen/overdue)

## Social (Friends, Feed, Accountability)
- web: apps/web/app/(app)/social/page.tsx, apps/web/app/(app)/social/_components/social-feed.tsx, apps/web/app/(app)/social/_components/social-friends.tsx, apps/web/app/(app)/social/_components/social-identity-bar.tsx, apps/web/app/(app)/social/_components/buddy-row.tsx, apps/web/app/(app)/social/_components/friend-row.tsx, apps/web/app/(app)/social/_components/add-friend-form.tsx, apps/web/app/(app)/social/_components/accountability-section.tsx, apps/web/app/(app)/social/_components/cheer-composer.tsx, apps/web/app/(app)/social/_components/edit-handle-sheet.tsx, apps/web/app/(app)/social/_components/pair-detail.tsx
- mobile: apps/mobile/app/social.tsx, apps/mobile/app/social/_components/social-feed.tsx, apps/mobile/app/social/_components/social-friends.tsx, apps/mobile/app/social/_components/social-opt-in-gate.tsx, apps/mobile/app/social/_components/buddy-row.tsx, apps/mobile/app/social/_components/friend-row.tsx, apps/mobile/app/social/_components/friend-request-row.tsx, apps/mobile/app/social/_components/friend-profile-sheet.tsx, apps/mobile/app/social/_components/accountability-section.tsx, apps/mobile/app/social/_components/edit-handle-sheet.tsx
- shared: PillButton, ConfirmDialog, AppOverlay, ListRow, Field, Badge, StatTile

## Social Challenges
- web: apps/web/app/(app)/social/challenges/page.tsx, apps/web/app/(app)/social/challenges/_components/challenge-list.tsx, apps/web/app/(app)/social/challenges/_components/challenges-topbar-heading.tsx, apps/web/app/(app)/social/challenges/_components/challenges-content.tsx, apps/web/app/(app)/social/challenges/_components/challenge-card.tsx, apps/web/app/(app)/social/challenges/_components/create-challenge-form.tsx, apps/web/app/(app)/social/challenges/_components/join-by-code-form.tsx, apps/web/app/(app)/social/challenges/_components/share-join-code.tsx
- mobile: apps/mobile/app/social/challenges.tsx, apps/mobile/app/social/challenges/_components/challenge-list.tsx, apps/mobile/app/social/challenges/_components/challenge-card.tsx, apps/mobile/app/social/challenges/_components/create-challenge-form.tsx, apps/mobile/app/social/challenges/_components/join-by-code-form.tsx, apps/mobile/app/social/challenges/_components/habit-picker.tsx, apps/mobile/app/social/challenges/_components/invite-friends-picker.tsx
- shared: PillButton, InfoCard, Badge, Field, SettingsRow, ConfirmDialog

## Social Challenge Detail
- web: apps/web/app/(app)/social/challenges/[id]/page.tsx, apps/web/app/(app)/social/challenges/_components/challenge-detail.tsx, apps/web/app/(app)/social/challenges/_components/challenge-action-buttons.tsx, apps/web/app/(app)/social/challenges/_components/challenge-error-state.tsx, apps/web/app/(app)/social/challenges/_components/habit-picker.tsx, apps/web/app/(app)/social/challenges/_components/invite-friends-picker.tsx, apps/web/app/(app)/social/challenges/_components/share-join-code.tsx
- mobile: apps/mobile/app/social/challenges/[id].tsx, apps/mobile/app/social/challenges/_components/challenge-detail.tsx, apps/mobile/app/social/challenges/_components/habit-picker.tsx, apps/mobile/app/social/challenges/_components/invite-friends-picker.tsx, apps/mobile/app/social/challenges/_components/share-join-code.tsx
- shared: PillButton, StatTile, ProgressRing, SettingsRow, ConfirmDialog, Field

## Insights / Retrospective
- web: apps/web/app/(app)/insights/page.tsx, apps/web/app/(app)/retrospective/page.tsx, apps/web/app/(app)/retrospective/_components/retrospective-dashboard.tsx, apps/web/app/(app)/retrospective/_components/retrospective-view.tsx, apps/web/app/(app)/retrospective/_components/retrospective-empty-state.tsx, apps/web/app/(app)/retrospective/_components/retrospective-locked-states.tsx, apps/web/app/(app)/retrospective/_components/retrospective-no-data-state.tsx, apps/web/app/(app)/retrospective/_components/locked-block.tsx
- mobile: apps/mobile/app/insights.tsx, apps/mobile/app/retrospective.tsx, apps/mobile/app/retrospective-dashboard.tsx, apps/mobile/app/retrospective-view.tsx, apps/mobile/app/retrospective-empty-state.tsx, apps/mobile/app/retrospective-locked-states.tsx, apps/mobile/app/retrospective-no-data-state.tsx
- shared: StatTile, ProgressRing, ProgressBar, EmptyState, Satellite glyph, semantic tokens

## AI Settings
- web: apps/web/app/(app)/ai-settings/page.tsx, apps/web/app/(app)/ai-settings/_components/user-facts-list.tsx, apps/web/app/(app)/ai-settings/_components/facts-pagination.tsx, apps/web/app/(app)/ai-settings/_components/facts-select-bar.tsx, apps/web/app/(app)/ai-settings/_components/fact-item.tsx, apps/web/app/(app)/ai-settings/_components/ai-feature-toggles.tsx, apps/web/app/(app)/ai-settings/_components/pro-upgrade-link.tsx
- mobile: apps/mobile/app/ai-settings.tsx, apps/mobile/app/ai-settings-sections.tsx
- shared: SettingsRow, Switch, Field, Badge, PillButton

## Calendar Sync
- web: apps/web/app/(app)/calendar-sync/page.tsx, apps/web/app/(app)/calendar-sync/_components/auto-sync-settings-card.tsx, apps/web/app/(app)/calendar-sync/_components/calendar-picker-section.tsx, apps/web/app/(app)/calendar-sync/_components/calendar-sync-event-row.tsx, apps/web/app/(app)/calendar-sync/_components/select-all-toggle.tsx, apps/web/app/(app)/calendar-sync/_components/quiet-action-button.tsx
- mobile: apps/mobile/app/calendar-sync.tsx, apps/mobile/app/calendar-sync-auto-section.tsx, apps/mobile/app/calendar-sync-event-row.tsx, apps/mobile/app/calendar-sync-select-all-toggle.tsx, apps/mobile/app/calendar-picker-section.tsx
- shared: SettingsRow, Switch, Field, PillButton, ConfirmDialog

## Advanced Settings
- web: apps/web/app/(app)/advanced/page.tsx
- mobile: apps/mobile/app/advanced.tsx, apps/mobile/app/advanced-sections.tsx
- shared: SettingsRow, ConfirmDialog, PillButton, Switch

## Preferences
- web: apps/web/app/(app)/preferences/page.tsx, apps/web/app/(app)/preferences/_components/preference-settings-list.tsx, apps/web/app/(app)/preferences/_components/preference-picker-sheet.tsx, apps/web/app/(app)/preferences/_components/push-notification-section.tsx, apps/web/app/(app)/preferences/_components/marketing-consent-section.tsx
- mobile: apps/mobile/app/preferences.tsx, apps/mobile/app/preferences-sections.tsx
- shared: SettingsRow, Switch, AppOverlay, Badge, Radio, PillButton

## Wrapped (Year in Review)
- web: apps/web/app/(app)/wrapped/page.tsx, apps/web/app/(app)/wrapped/_components/wrapped-cover.tsx, apps/web/app/(app)/wrapped/_components/wrapped-slide.tsx, apps/web/app/(app)/wrapped/_components/wrapped-player.tsx
- mobile: apps/mobile/app/wrapped.tsx, apps/mobile/app/wrapped-cover.tsx, apps/mobile/app/wrapped-slide.tsx
- shared: PillButton, StatTile, motion/transition utilities, type roles (display, hero)

## Support
- web: apps/web/app/(app)/support/page.tsx, apps/web/app/(app)/support/_components/support-form.tsx, apps/web/app/(app)/support/_components/support-success-state.tsx
- mobile: apps/mobile/app/support.tsx
- shared: Field, PillButton, ConfirmDialog, AppOverlay

## Upgrade / Paywall
- web: apps/web/app/(app)/upgrade/page.tsx, apps/web/upgrade/plan-card.tsx
- mobile: apps/mobile/app/upgrade.tsx
- shared: PlanCard, PillButton, Badge (pro-badge), subscription tokens

## About
- web: apps/web/app/(app)/about/page.tsx
- mobile: apps/mobile/app/about.tsx
- shared: PillButton, typography tokens

## Explore
- web: apps/web/app/(app)/explore/page.tsx
- mobile: apps/mobile/app/explore.tsx (if implemented)
- shared: PillButton, ListRow, SettingsRow

## Login & Auth
- web: apps/web/app/(auth)/login/page.tsx, apps/web/app/(auth)/auth-callback/page.tsx, apps/web/app/api/auth/send-code/route.ts, apps/web/app/api/auth/verify-code/route.ts
- mobile: apps/mobile/app/login.tsx, apps/mobile/app/login-sections.tsx, apps/mobile/app/email-step.tsx, apps/mobile/app/code-step.tsx, apps/mobile/app/auth-callback.tsx
- shared: Field, OTP (CodeInput), PillButton, ConfirmDialog

## Onboarding
- web: apps/web/app/(onboarding)/onboarding/page.tsx
- mobile: apps/mobile/app/(onboarding)/index.tsx, apps/mobile/app/(onboarding)/_layout.tsx
- shared: Field, PillButton, Radio, Checkbox, AppOverlay

## Chat (Astra AI)
- web: apps/web/app/(chat)/chat/page.tsx
- mobile: apps/mobile/app/chat.tsx
- shared: Field, PillButton, AppOverlay, Server Streaming (SSE)

## Public Profile Share
- web: apps/web/app/(app)/public-profile/page.tsx
- mobile: apps/mobile/app/public-profile.tsx
- shared: StatTile, PillButton, ProgressRing, NavHeader

## Delete Account (Public)
- web: apps/web/app/(public)/delete-account/page.tsx
- mobile: apps/mobile/app/delete-account-modal.tsx (modal within profile)
- shared: ConfirmDialog, PillButton

## Privacy Policy (Public)
- web: apps/web/app/(public)/privacy/page.tsx
- mobile: apps/mobile/app/privacy.tsx
- shared: typography tokens only

## Terms of Service (Public)
- web: apps/web/app/(public)/terms/page.tsx
- mobile: apps/mobile/app/terms.tsx
- shared: typography tokens only

## Shared Habit Feed (/u/:slug)
- web: apps/web/app/(public)/u/[slug]/page.tsx
- mobile: apps/mobile/app/social/_components/friend-profile-sheet.tsx (modal)
- shared: StatTile, HabitRow, ProgressRing, NavHeader, PillButton

## Referral Join (/r/:code)
- web: apps/web/app/r/[code]/page.tsx
- mobile: apps/mobile/app/r/[code].tsx
- shared: PillButton, ConfirmDialog, Field

