# Icon action surfaces

> **At a glance** - universal icon-action owners, accessible names and retained text boundaries on web and Android.

Each source reference identifies the action after migration. Labels remain localized through the existing shared locale keys or caller-supplied translated labels. Both platform primitives use the same 48px round target: 44px neutral interaction paint at radius 22 plus a transparent 2px hit extension on every side. Disabled and busy behavior share that geometry. Web exposes its label through both aria-label and the native title tooltip.

The inventory includes retries, stale refresh, signed paging, disclosure, add controls, copy and sharing, drawn sheet footer actions and per-record actions. Read-block revisions, preview drafts, clipboard feedback, pending requests and focus handoffs retain their original owners.

Text remains for the primary consequence ending a form or confirmation, required sign-in wording, and contextual requests, choices or destinations drawn in the active canvas. In particular, approval and destructive confirmation name their consequence; a pending preview's edit, reject and retry controls use icons. Personal text, calendar values, menu rows and selectable records remain content-bearing controls.

| Retained text surface | Paired owners | Drawing and geometry |
|---|---|---|
| Metas empty invitation | Web `app/(app)/progress/_components/progress-content.tsx`, Android `components/progress/progress-content.tsx`, `GoalsEmptyState` | `Orbit Progresso.dc.html` empty invitation, with the retained direct-creation entries in `create-goal-sheet-inventory.md`; one labelled small Create goal pill, primary below 768px and secondary at wider widths, with the empty paragraph |
| Wrapped paging | Both `components/ui/pager.tsx`, mounted by their `wrapped-player.tsx` | `Orbit Wrapped.dc.html` Pager; labelled Back and Continue pills, both small, with the trailing action row's 12px gap |
| Wrapped final actions | Web `app/(app)/wrapped/_components/wrapped-player.tsx`, Android `components/wrapped/wrapped-player.tsx` | `Orbit Wrapped.dc.html` sharing; Back, Download and Share remain labelled, equal-height small pills in one trailing row when their intrinsic widths fit |
| Sheet footer dismissal | The paired owners in `sheet-footer-inventory.md`, including `components/ui/confirm-sheet.tsx` | `Orbit Sobreposicoes.dc.html` and `Orbit Perfil.dc.html`; labelled ghost Cancel then the filled consequence, equal 44px visible heights and 18px inline padding |
| Sharing footer consequences | Both `components/referral/referral-drawer.tsx` and `components/milestone-share/milestone-share-prompt.tsx` | `sheet-footer-inventory.md`; labelled Share and web Download finish the sharing flow |
| Notification deletion consequence | Both `components/navigation/notification-detail-modal.tsx` | `Orbit Avisos.dc.html`; labelled destructive Delete finishes the detail flow |

`local/no-text-icon-action` permits only the exact drawn labels in their named owner components: sheet footer Cancel, sharing footer Share and web Download, notification detail Delete, Pager Back, and Wrapped Download and Share, including their existing translations. Refresh and other universal actions remain rejected within those owners. Create goal and Continue retain their contextual labels under the ordinary rule.

Drawn references: [Astra conversation](canvas/Orbit%20Astra%20Conversation.dc.html), [Habit create](canvas/Orbit%20Habit%20Create.dc.html), [Habit detail](canvas/Orbit%20Habit%20Detail.dc.html), [overlays](canvas/Orbit%20Sobreposicoes.dc.html), [Wrapped](canvas/Orbit%20Wrapped.dc.html), [sign-in](canvas/Orbit%20Entrar.dc.html) and the shared shape tokens. The universal icon-action order applies to their action controls while preserving the primary consequence and contextual text boundaries above.

| Platform and source | Localized name expression | Treatment |
|---|---|---|
| [apps/mobile/app/(tabs)/calendar.tsx:194](../apps/mobile/app/(tabs)/calendar.tsx#L194) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/app/(tabs)/calendar/_components/calendar-entry-details.tsx:37](../apps/mobile/app/(tabs)/calendar/_components/calendar-entry-details.tsx#L37) | `{t('calendar.dayDetail.clearEventSearch')}` | X |
| [apps/mobile/app/(tabs)/calendar/_components/calendar-entry-details.tsx:40](../apps/mobile/app/(tabs)/calendar/_components/calendar-entry-details.tsx#L40) | `{t('common.previous')}` | ChevronLeft |
| [apps/mobile/app/(tabs)/calendar/_components/calendar-entry-details.tsx:41](../apps/mobile/app/(tabs)/calendar/_components/calendar-entry-details.tsx#L41) | `{t('common.next')}` | ChevronRight |
| [apps/mobile/app/(tabs)/index.tsx:104](../apps/mobile/app/(tabs)/index.tsx#L104) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/app/(tabs)/profile/_components/delete-account-modal.tsx:119](../apps/mobile/app/(tabs)/profile/_components/delete-account-modal.tsx#L119) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/app/(tabs)/profile/_components/edit-name-sheet.tsx:96](../apps/mobile/app/(tabs)/profile/_components/edit-name-sheet.tsx#L96) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/app/(tabs)/profile/_components/fresh-start-modal.tsx:176](../apps/mobile/app/(tabs)/profile/_components/fresh-start-modal.tsx#L176) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/app/(tabs)/profile/_components/fresh-start-modal.tsx:200](../apps/mobile/app/(tabs)/profile/_components/fresh-start-modal.tsx#L200) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/app/(tabs)/profile/_components/profile-subscreen.tsx:44](../apps/mobile/app/(tabs)/profile/_components/profile-subscreen.tsx#L44) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/app/search.tsx:65](../apps/mobile/app/search.tsx#L65) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/app/search.tsx:76](../apps/mobile/app/search.tsx#L76) | `{t('habits.search.previous')}` | ChevronLeft |
| [apps/mobile/app/search.tsx:77](../apps/mobile/app/search.tsx#L77) | `{t('habits.search.next')}` | ChevronRight |
| [apps/mobile/app/upgrade.tsx:77](../apps/mobile/app/upgrade.tsx#L77) | `{t('upgrade.billing.retry')}` | RefreshCw |
| [apps/mobile/components/auth/turnstile-widget.tsx:84](../apps/mobile/components/auth/turnstile-widget.tsx#L84) | `{t('auth.turnstileRetry')}` | RefreshCw |
| [apps/mobile/components/calendar-sync/calendar-import-content.tsx:496](../apps/mobile/components/calendar-sync/calendar-import-content.tsx#L496) | `{t('common.goBack')}` | ChevronLeft |
| [apps/mobile/components/calendar-sync/calendar-import-content.tsx:549](../apps/mobile/components/calendar-sync/calendar-import-content.tsx#L549) | `{t('calendar.showMore')}` | ChevronDown |
| [apps/mobile/components/calendar-sync/calendar-import-content.tsx:629](../apps/mobile/components/calendar-sync/calendar-import-content.tsx#L629) | `{t('common.goBack')}` | ChevronLeft |
| [apps/mobile/components/calendar-sync/calendar-import-content.tsx:630](../apps/mobile/components/calendar-sync/calendar-import-content.tsx#L630) | `{t('calendar.retry')}` | RefreshCw |
| [apps/mobile/components/calendar-sync/calendar-picker-section.tsx:74](../apps/mobile/components/calendar-sync/calendar-picker-section.tsx#L74) | `{t('calendar.retry')}` | RefreshCw |
| [apps/mobile/components/calendar-sync/calendar-picker-section.tsx:108](../apps/mobile/components/calendar-sync/calendar-picker-section.tsx#L108) | `{t('calendar.showMore')}` | ChevronDown |
| [apps/mobile/components/chat/account-rows-card.tsx:72](../apps/mobile/components/chat/account-rows-card.tsx#L72) | `{t(copied ? 'chat.account.copied' : 'chat.account.copy')}` | View |
| [apps/mobile/components/chat/account-rows-card.tsx:75](../apps/mobile/components/chat/account-rows-card.tsx#L75) | `{t('chat.account.share')}` | Share2 |
| [apps/mobile/components/chat/breakdown-suggestion.tsx:62](../apps/mobile/components/chat/breakdown-suggestion.tsx#L62) | `{t('chat.batch.retry', { count: card.failedIds.length })}` | RefreshCw |
| [apps/mobile/components/chat/breakdown-suggestion.tsx:62](../apps/mobile/components/chat/breakdown-suggestion.tsx#L62) | `{t('habits.breakdown.addHabit')}` | Plus |
| [apps/mobile/components/chat/day-summary-card.tsx:85](../apps/mobile/components/chat/day-summary-card.tsx#L85) | `{t('chat.recordList.more')}` | ChevronDown |
| [apps/mobile/components/chat/habit-list-card.tsx:61](../apps/mobile/components/chat/habit-list-card.tsx#L61) | `{t('chat.habitList.more')}` | ChevronDown |
| [apps/mobile/components/chat/habit-ranking-card.tsx:45](../apps/mobile/components/chat/habit-ranking-card.tsx#L45) | `{t('chat.ranking.more')}` | ChevronDown |
| [apps/mobile/components/chat/habit-ranking-card.tsx:46](../apps/mobile/components/chat/habit-ranking-card.tsx#L46) | `{t('chat.ranking.refresh')}` | RefreshCw |
| [apps/mobile/components/chat/pending-operation-card.tsx:78](../apps/mobile/components/chat/pending-operation-card.tsx#L78) | `{labels.addListRow}` | Plus |
| [apps/mobile/components/chat/pending-operation-card.tsx:108](../apps/mobile/components/chat/pending-operation-card.tsx#L108) | `{labels.cancel}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/chat/pending-operation-card.tsx:177](../apps/mobile/components/chat/pending-operation-card.tsx#L177) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/chat/pending-operation-card.tsx:234](../apps/mobile/components/chat/pending-operation-card.tsx#L234) | `{props.accessibleName ?? label}` | RefreshCw |
| [apps/mobile/components/chat/period-insight-card.tsx:69](../apps/mobile/components/chat/period-insight-card.tsx#L69) | `{t(expanded ? 'chat.readBlock.less' : 'chat.habitList.more')}` | ChevronsUp |
| [apps/mobile/components/chat/prompt-library.tsx:90](../apps/mobile/components/chat/prompt-library.tsx#L90) | `{t('chat.templates.clearSearch')}` | X |
| [apps/mobile/components/chat/prompt-library.tsx:93](../apps/mobile/components/chat/prompt-library.tsx#L93) | `{t('chat.templates.previous')}` | ChevronLeft |
| [apps/mobile/components/chat/prompt-library.tsx:94](../apps/mobile/components/chat/prompt-library.tsx#L94) | `{t('chat.templates.more')}` | ChevronRight |
| [apps/mobile/components/chat/read-block-frame.tsx:59](../apps/mobile/components/chat/read-block-frame.tsx#L59) | `{t('chat.recordList.more')}` | ChevronDown |
| [apps/mobile/components/chat/read-block-frame.tsx:60](../apps/mobile/components/chat/read-block-frame.tsx#L60) | `{t('blockFrame.refresh')}` | RefreshCw |
| [apps/mobile/components/chat/record-list-card.tsx:112](../apps/mobile/components/chat/record-list-card.tsx#L112) | `{t('chat.recordList.filter')}` | Filter |
| [apps/mobile/components/chat/record-list-card.tsx:112](../apps/mobile/components/chat/record-list-card.tsx#L112) | `{t('chat.recordList.clearFilter')}` | X |
| [apps/mobile/components/chat/record-list-card.tsx:113](../apps/mobile/components/chat/record-list-card.tsx#L113) | `{t('chat.recordList.more')}` | ChevronDown |
| [apps/mobile/components/goals/create-goal-sheet.tsx:47](../apps/mobile/components/goals/create-goal-sheet.tsx#L47) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/goals/edit-goal-modal.tsx:187](../apps/mobile/components/goals/edit-goal-modal.tsx#L187) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/goals/edit-goal-modal/edit-goal-deadline-field.tsx:59](../apps/mobile/components/goals/edit-goal-modal/edit-goal-deadline-field.tsx#L59) | `{t('goals.form.addDeadline')}` | Plus |
| [apps/mobile/components/goals/goal-detail-drawer/goal-load-error.tsx:24](../apps/mobile/components/goals/goal-detail-drawer/goal-load-error.tsx#L24) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/components/goals/goal-detail-drawer/goal-progress-form.tsx:45](../apps/mobile/components/goals/goal-detail-drawer/goal-progress-form.tsx#L45) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/goals/goal-habits-field.tsx:46](../apps/mobile/components/goals/goal-habits-field.tsx#L46) | `{t('habits.createHabit')}` | Plus |
| [apps/mobile/components/goals/goal-habits-field.tsx:47](../apps/mobile/components/goals/goal-habits-field.tsx#L47) | `{t('common.close')}` | X |
| [apps/mobile/components/goals/goal-habits-field.tsx:58](../apps/mobile/components/goals/goal-habits-field.tsx#L58) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/components/habit-list/empty-state.tsx:75](../apps/mobile/components/habit-list/empty-state.tsx#L75) | `{actionLabel}` | RefreshCw |
| [apps/mobile/components/habit-list/habit-drill.tsx:164](../apps/mobile/components/habit-list/habit-drill.tsx#L164) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/components/habit-list/move-parent-dialog.tsx:79](../apps/mobile/components/habit-list/move-parent-dialog.tsx#L79) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/components/habit-list/move-parent-dialog.tsx:158](../apps/mobile/components/habit-list/move-parent-dialog.tsx#L158) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/habits/create-goal-from-habit/goal-deadline-field.tsx:59](../apps/mobile/components/habits/create-goal-from-habit/goal-deadline-field.tsx#L59) | `{t('goals.form.addDeadline')}` | Plus |
| [apps/mobile/components/habits/create-habit-modal/sub-habit-editor.tsx:95](../apps/mobile/components/habits/create-habit-modal/sub-habit-editor.tsx#L95) | `{t('habits.form.addSubHabit')}` | Plus |
| [apps/mobile/components/habits/edit-habit-modal.tsx:530](../apps/mobile/components/habits/edit-habit-modal.tsx#L530) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/habits/goal-linking-field.tsx:67](../apps/mobile/components/habits/goal-linking-field.tsx#L67) | `{t('goals.create')}` | Plus |
| [apps/mobile/components/habits/goal-linking-field.tsx:68](../apps/mobile/components/habits/goal-linking-field.tsx#L68) | `{t('habits.form.createGoal')}` | Plus |
| [apps/mobile/components/habits/habit-checklist.tsx:383](../apps/mobile/components/habits/habit-checklist.tsx#L383) | `{t('habits.form.clearChecklist')}` | Trash2 |
| [apps/mobile/components/habits/habit-create-actions.tsx:33](../apps/mobile/components/habits/habit-create-actions.tsx#L33) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/habits/habit-detail-screen.tsx:120](../apps/mobile/components/habits/habit-detail-screen.tsx#L120) | `{t('habits.detail.retry')}` | RefreshCw |
| [apps/mobile/components/habits/habit-detail-screen.tsx:207](../apps/mobile/components/habits/habit-detail-screen.tsx#L207) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/components/habits/habit-detail-screen.tsx:409](../apps/mobile/components/habits/habit-detail-screen.tsx#L409) | `{t('habits.detail.retry')}` | RefreshCw |
| [apps/mobile/components/habits/habit-detail-screen.tsx:574](../apps/mobile/components/habits/habit-detail-screen.tsx#L574) | `{t('habits.detail.retry')}` | RefreshCw |
| [apps/mobile/components/habits/habit-form-fields/reminder-section.tsx:140](../apps/mobile/components/habits/habit-form-fields/reminder-section.tsx#L140) | `{t("habits.form.reminderAdd")}` | Plus |
| [apps/mobile/components/habits/habit-form-fields/scheduled-reminder-section.tsx:158](../apps/mobile/components/habits/habit-form-fields/scheduled-reminder-section.tsx#L158) | `{t(nested ? 'habits.form.reminderAddTime' : 'habits.form.scheduledReminderAdd')}` | Plus |
| [apps/mobile/components/habits/habit-form-fields/scheduled-reminder-section.tsx:182](../apps/mobile/components/habits/habit-form-fields/scheduled-reminder-section.tsx#L182) | `{t("common.add")}` | Plus |
| [apps/mobile/components/habits/habit-form-fields/scheduled-reminder-section.tsx:183](../apps/mobile/components/habits/habit-form-fields/scheduled-reminder-section.tsx#L183) | `{t("common.add")}` | Plus |
| [apps/mobile/components/habits/habit-form-fields/tag-picker-field.tsx:55](../apps/mobile/components/habits/habit-form-fields/tag-picker-field.tsx#L55) | `{t('habits.form.newTag')}` | Plus |
| [apps/mobile/components/habits/habit-form-fields/tag-picker-field.tsx:65](../apps/mobile/components/habits/habit-form-fields/tag-picker-field.tsx#L65) | `{t('habits.form.newTag')}` | Plus |
| [apps/mobile/components/milestone-share/milestone-share-prompt.tsx:156](../apps/mobile/components/milestone-share/milestone-share-prompt.tsx#L156) | `{t('milestoneShare.share')}` | Drawn consequence text (`sm`) |
| [apps/mobile/components/navigation/notification-detail-modal.tsx:87](../apps/mobile/components/navigation/notification-detail-modal.tsx#L87) | `{t('notifications.delete')}` | Drawn consequence text (`sm`) |
| [apps/mobile/components/navigation/notification-list.tsx:41](../apps/mobile/components/navigation/notification-list.tsx#L41) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/components/onboarding/onboarding-flow.tsx:123](../apps/mobile/components/onboarding/onboarding-flow.tsx#L123) | `{t('onboarding.flow.retry')}` | RefreshCw |
| [apps/mobile/components/onboarding/onboarding-pro-step.tsx:83](../apps/mobile/components/onboarding/onboarding-pro-step.tsx#L83) | `{t('upgrade.billing.retry')}` | RefreshCw |
| [apps/mobile/components/profile/notion-connection-sheet.tsx:51](../apps/mobile/components/profile/notion-connection-sheet.tsx#L51) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/components/profile/preferences-sections.tsx:117](../apps/mobile/components/profile/preferences-sections.tsx#L117) | `{showMoreLabel}` | ChevronDown |
| [apps/mobile/components/profile/profile-api-keys.tsx:95](../apps/mobile/components/profile/profile-api-keys.tsx#L95) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/components/profile/profile-api-keys.tsx:194](../apps/mobile/components/profile/profile-api-keys.tsx#L194) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/profile/profile-api-keys.tsx:281](../apps/mobile/components/profile/profile-api-keys.tsx#L281) | `{copied ? t('orbitMcp.copied') : t('orbitMcp.copy')}` | Copy |
| [apps/mobile/components/profile/profile-mcp-guide.tsx:44](../apps/mobile/components/profile/profile-mcp-guide.tsx#L44) | `{copyState === 'copied' ? t('orbitMcp.copied') : t('orbitMcp.copy')}` | Copy |
| [apps/mobile/components/profile/push-devices-row.tsx:63](../apps/mobile/components/profile/push-devices-row.tsx#L63) | `{t('settings.notifications.openSettings')}` | Settings |
| [apps/mobile/components/progress/progress-content.tsx:300](../apps/mobile/components/progress/progress-content.tsx#L300) | `{t('progressScreen.retry')}` | RefreshCw |
| [apps/mobile/components/progress/progress-content.tsx:429](../apps/mobile/components/progress/progress-content.tsx#L429) | `{t('goals.create')}` | Plus |
| [apps/mobile/components/progress/progress-content.tsx:484](../apps/mobile/components/progress/progress-content.tsx#L484) | `{t('progressScreen.retry')}` | RefreshCw |
| [apps/mobile/components/progress/progress-content.tsx:638](../apps/mobile/components/progress/progress-content.tsx#L638) | `{t('progressScreen.retry')}` | RefreshCw |
| [apps/mobile/components/progress/progress-content.tsx:716](../apps/mobile/components/progress/progress-content.tsx#L716) | `{t('progressScreen.retry')}` | RefreshCw |
| [apps/mobile/components/referral/referral-drawer.tsx:200](../apps/mobile/components/referral/referral-drawer.tsx#L200) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/mobile/components/referral/referral-drawer.tsx:201](../apps/mobile/components/referral/referral-drawer.tsx#L201) | `{t('referral.drawer.share')}` | Drawn consequence text (`sm`) |
| [apps/mobile/components/search/search-results.tsx:47](../apps/mobile/components/search/search-results.tsx#L47) | `{t(onClearSearch ? 'common.clear' : 'habits.search.create')}` | X |
| [apps/mobile/components/share/share-card-entry-button.tsx:19](../apps/mobile/components/share/share-card-entry-button.tsx#L19) | `{t('shareCard.entry')}` | Share2 |
| [apps/mobile/components/share/share-card-sheet.tsx:55](../apps/mobile/components/share/share-card-sheet.tsx#L55) | `{t('shareCard.download')}` | Download |
| [apps/mobile/components/share/share-card-sheet.tsx:56](../apps/mobile/components/share/share-card-sheet.tsx#L56) | `{t('shareCard.share')}` | Share2 |
| [apps/mobile/components/share/share-card-sheet.tsx:69](../apps/mobile/components/share/share-card-sheet.tsx#L69) | `{t('common.retry')}` | RefreshCw |
| [apps/mobile/components/ui/app-toast.tsx:245](../apps/mobile/components/ui/app-toast.tsx#L245) | `{props.actionLabel}` | RefreshCw |
| [apps/mobile/components/ui/block-copy-control.tsx:38](../apps/mobile/components/ui/block-copy-control.tsx#L38) | `{label}` | Copy |
| [apps/mobile/components/ui/block-frame.tsx:189](../apps/mobile/components/ui/block-frame.tsx#L189) | `{frameProps.refreshLabel ?? t('blockFrame.refresh')}` | RefreshCw |
| [apps/mobile/components/ui/expiry-warning.tsx:193](../apps/mobile/components/ui/expiry-warning.tsx#L193) | `{t('auth.refresh')}` | RefreshCw |
| [apps/mobile/components/ui/scroll-to-top-button.tsx:13](../apps/mobile/components/ui/scroll-to-top-button.tsx#L13) | `{t('common.backToTop')}` | ArrowUp |
| [apps/mobile/components/upgrade/plan-selection.tsx:182](../apps/mobile/components/upgrade/plan-selection.tsx#L182) | `{t('upgrade.plans.retry')}` | RefreshCw |
| [apps/mobile/components/upgrade/provider-handoff.tsx:54](../apps/mobile/components/upgrade/provider-handoff.tsx#L54) | `{t('upgrade.billing.retry')}` | RefreshCw |
| [apps/mobile/components/wrapped/wrapped-cover.tsx:99](../apps/mobile/components/wrapped/wrapped-cover.tsx#L99) | `{t('wrapped.retry')}` | RefreshCw |
| [apps/mobile/components/wrapped/wrapped-slide.tsx:121](../apps/mobile/components/wrapped/wrapped-slide.tsx#L121) | `{t('wrapped.retry')}` | RefreshCw |
| [apps/web/app/(app)/preferences/_components/preference-picker-sheet.tsx:111](../apps/web/app/(app)/preferences/_components/preference-picker-sheet.tsx#L111) | `{showMoreLabel}` | ChevronDown |
| [apps/web/app/(app)/profile/_components/delete-account-modal.tsx:123](../apps/web/app/(app)/profile/_components/delete-account-modal.tsx#L123) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/app/(app)/profile/_components/edit-name-sheet.tsx:87](../apps/web/app/(app)/profile/_components/edit-name-sheet.tsx#L87) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/app/(app)/profile/_components/fresh-start-modal.tsx:255](../apps/web/app/(app)/profile/_components/fresh-start-modal.tsx#L255) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/app/(app)/profile/_components/fresh-start-modal.tsx:281](../apps/web/app/(app)/profile/_components/fresh-start-modal.tsx#L281) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/app/(app)/profile/_components/profile-astra-content.tsx:79](../apps/web/app/(app)/profile/_components/profile-astra-content.tsx#L79) | `{t('upgrade.billing.retry')}` | RefreshCw |
| [apps/web/app/(app)/profile/_components/profile-subscreen.tsx:35](../apps/web/app/(app)/profile/_components/profile-subscreen.tsx#L35) | `{t('common.retry')}` | RefreshCw |
| [apps/web/app/(app)/progress/_components/progress-content.tsx:358](../apps/web/app/(app)/progress/_components/progress-content.tsx#L358) | `{t('progressScreen.retry')}` | RefreshCw |
| [apps/web/app/(app)/progress/_components/progress-content.tsx:498](../apps/web/app/(app)/progress/_components/progress-content.tsx#L498) | `{t('goals.create')}` | Plus |
| [apps/web/app/(app)/progress/_components/progress-content.tsx:555](../apps/web/app/(app)/progress/_components/progress-content.tsx#L555) | `{t('progressScreen.retry')}` | RefreshCw |
| [apps/web/app/(app)/progress/_components/progress-content.tsx:682](../apps/web/app/(app)/progress/_components/progress-content.tsx#L682) | `{t('progressScreen.retry')}` | RefreshCw |
| [apps/web/app/(app)/progress/_components/progress-content.tsx:715](../apps/web/app/(app)/progress/_components/progress-content.tsx#L715) | `{t('progressScreen.retry')}` | RefreshCw |
| [apps/web/app/(app)/search/page.tsx:64](../apps/web/app/(app)/search/page.tsx#L64) | `{t('common.retry')}` | RefreshCw |
| [apps/web/app/(app)/search/page.tsx:69](../apps/web/app/(app)/search/page.tsx#L69) | `{t('habits.search.previous')}` | ChevronLeft |
| [apps/web/app/(app)/search/page.tsx:70](../apps/web/app/(app)/search/page.tsx#L70) | `{t('habits.search.next')}` | ChevronRight |
| [apps/web/app/(app)/today-page-client.tsx:96](../apps/web/app/(app)/today-page-client.tsx#L96) | `{t('common.retry')}` | RefreshCw |
| [apps/web/app/(app)/upgrade/page.tsx:189](../apps/web/app/(app)/upgrade/page.tsx#L189) | `{t('upgrade.billing.retry')}` | RefreshCw |
| [apps/web/app/(app)/wrapped/_components/wrapped-cover.tsx:89](../apps/web/app/(app)/wrapped/_components/wrapped-cover.tsx#L89) | `{t('wrapped.retry')}` | RefreshCw |
| [apps/web/app/(app)/wrapped/_components/wrapped-slide.tsx:125](../apps/web/app/(app)/wrapped/_components/wrapped-slide.tsx#L125) | `{t('wrapped.retry')}` | RefreshCw |
| [apps/web/app/(auth)/error.tsx:14](../apps/web/app/(auth)/error.tsx#L14) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/auth/turnstile-widget.tsx:160](../apps/web/components/auth/turnstile-widget.tsx#L160) | `{t('auth.turnstileRetry')}` | RefreshCw |
| [apps/web/components/calendar-sync/calendar-import-content.tsx:390](../apps/web/components/calendar-sync/calendar-import-content.tsx#L390) | `{t('common.goBack')}` | ChevronLeft |
| [apps/web/components/calendar-sync/calendar-import-content.tsx:437](../apps/web/components/calendar-sync/calendar-import-content.tsx#L437) | `{t('calendar.showMore')}` | ChevronDown |
| [apps/web/components/calendar-sync/calendar-import-content.tsx:555](../apps/web/components/calendar-sync/calendar-import-content.tsx#L555) | `{t('common.goBack')}` | ChevronLeft |
| [apps/web/components/calendar-sync/calendar-import-content.tsx:556](../apps/web/components/calendar-sync/calendar-import-content.tsx#L556) | `{t('calendar.retry')}` | RefreshCw |
| [apps/web/components/calendar-sync/calendar-picker-section.tsx:70](../apps/web/components/calendar-sync/calendar-picker-section.tsx#L70) | `{t('calendar.retry')}` | RefreshCw |
| [apps/web/components/calendar-sync/calendar-picker-section.tsx:111](../apps/web/components/calendar-sync/calendar-picker-section.tsx#L111) | `{t('calendar.showMore')}` | ChevronDown |
| [apps/web/components/calendar/calendar-entry-details.tsx:37](../apps/web/components/calendar/calendar-entry-details.tsx#L37) | `{t('calendar.dayDetail.clearEventSearch')}` | X |
| [apps/web/components/calendar/calendar-entry-details.tsx:40](../apps/web/components/calendar/calendar-entry-details.tsx#L40) | `{t('common.previous')}` | ChevronLeft |
| [apps/web/components/calendar/calendar-entry-details.tsx:41](../apps/web/components/calendar/calendar-entry-details.tsx#L41) | `{t('common.next')}` | ChevronRight |
| [apps/web/components/calendar/calendar-load-error.tsx:30](../apps/web/components/calendar/calendar-load-error.tsx#L30) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/chat/account-rows-card.tsx:23](../apps/web/components/chat/account-rows-card.tsx#L23) | `{t(copied ? 'chat.account.copied' : 'chat.account.copy')}` | Copy |
| [apps/web/components/chat/account-rows-card.tsx:100](../apps/web/components/chat/account-rows-card.tsx#L100) | `{t(canShare ? 'chat.account.share' : 'referral.drawer.copyLink')}` | Share2 |
| [apps/web/components/chat/breakdown-suggestion.tsx:64](../apps/web/components/chat/breakdown-suggestion.tsx#L64) | `{t('chat.batch.retry', { count: card.failedIds.length })}` | RefreshCw |
| [apps/web/components/chat/breakdown-suggestion.tsx:66](../apps/web/components/chat/breakdown-suggestion.tsx#L66) | `{t('habits.breakdown.addHabit')}` | Plus |
| [apps/web/components/chat/conversation.tsx:40](../apps/web/components/chat/conversation.tsx#L40) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/chat/day-summary-card.tsx:78](../apps/web/components/chat/day-summary-card.tsx#L78) | `{t('chat.recordList.more')}` | ChevronDown |
| [apps/web/components/chat/habit-list-card.tsx:57](../apps/web/components/chat/habit-list-card.tsx#L57) | `{t('chat.habitList.more')}` | ChevronDown |
| [apps/web/components/chat/habit-ranking-card.tsx:41](../apps/web/components/chat/habit-ranking-card.tsx#L41) | `{t('more')}` | ChevronDown |
| [apps/web/components/chat/habit-ranking-card.tsx:42](../apps/web/components/chat/habit-ranking-card.tsx#L42) | `{t('refresh')}` | RefreshCw |
| [apps/web/components/chat/pending-operation-card.tsx:81](../apps/web/components/chat/pending-operation-card.tsx#L81) | `{labels.addListRow}` | Plus |
| [apps/web/components/chat/pending-operation-card.tsx:99](../apps/web/components/chat/pending-operation-card.tsx#L99) | `{labels.cancel}` | Drawn ghost text (`sm`) |
| [apps/web/components/chat/pending-operation-card.tsx:168](../apps/web/components/chat/pending-operation-card.tsx#L168) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/components/chat/pending-operation-card.tsx:218](../apps/web/components/chat/pending-operation-card.tsx#L218) | `{props.accessibleName ?? label}` | RefreshCw |
| [apps/web/components/chat/period-insight-card.tsx:68](../apps/web/components/chat/period-insight-card.tsx#L68) | `{t(expanded ? 'chat.readBlock.less' : 'chat.habitList.more')}` | ChevronsUp |
| [apps/web/components/chat/prompt-library.tsx:69](../apps/web/components/chat/prompt-library.tsx#L69) | `{t('chat.templates.clearSearch')}` | X |
| [apps/web/components/chat/prompt-library.tsx:72](../apps/web/components/chat/prompt-library.tsx#L72) | `{t('chat.templates.previous')}` | ChevronLeft |
| [apps/web/components/chat/prompt-library.tsx:73](../apps/web/components/chat/prompt-library.tsx#L73) | `{t('chat.templates.more')}` | ChevronRight |
| [apps/web/components/chat/read-block-frame.tsx:51](../apps/web/components/chat/read-block-frame.tsx#L51) | `{t('chat.recordList.more')}` | ChevronDown |
| [apps/web/components/chat/read-block-frame.tsx:52](../apps/web/components/chat/read-block-frame.tsx#L52) | `{t('blockFrame.refresh')}` | RefreshCw |
| [apps/web/components/chat/record-list-card.tsx:95](../apps/web/components/chat/record-list-card.tsx#L95) | `{t('chat.recordList.clearFilter')}` | X |
| [apps/web/components/chat/record-list-card.tsx:96](../apps/web/components/chat/record-list-card.tsx#L96) | `{t('chat.recordList.more')}` | ChevronDown |
| [apps/web/components/command/command-menu.tsx:97](../apps/web/components/command/command-menu.tsx#L97) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/command/command-menu.tsx:102](../apps/web/components/command/command-menu.tsx#L102) | `{t('habits.search.previous')}` | ChevronLeft |
| [apps/web/components/command/command-menu.tsx:103](../apps/web/components/command/command-menu.tsx#L103) | `{t('habits.search.next')}` | ChevronRight |
| [apps/web/components/goals/create-goal-sheet.tsx:49](../apps/web/components/goals/create-goal-sheet.tsx#L49) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/components/goals/edit-goal-modal.tsx:178](../apps/web/components/goals/edit-goal-modal.tsx#L178) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/components/goals/edit-goal-modal/edit-goal-deadline-field.tsx:61](../apps/web/components/goals/edit-goal-modal/edit-goal-deadline-field.tsx#L61) | `{t('goals.form.addDeadline')}` | Plus |
| [apps/web/components/goals/goal-detail-drawer/goal-load-error.tsx:28](../apps/web/components/goals/goal-detail-drawer/goal-load-error.tsx#L28) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/goals/goal-detail-drawer/goal-progress-form.tsx:44](../apps/web/components/goals/goal-detail-drawer/goal-progress-form.tsx#L44) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/components/goals/goal-habits-field.tsx:35](../apps/web/components/goals/goal-habits-field.tsx#L35) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/goals/goal-habits-field.tsx:35](../apps/web/components/goals/goal-habits-field.tsx#L35) | `{t('habits.createHabit')}` | Plus |
| [apps/web/components/goals/goal-habits-field.tsx:35](../apps/web/components/goals/goal-habits-field.tsx#L35) | `{t('common.close')}` | X |
| [apps/web/components/habits/create-goal-from-habit/goal-deadline-field.tsx:53](../apps/web/components/habits/create-goal-from-habit/goal-deadline-field.tsx#L53) | `{t('goals.form.addDeadline')}` | Plus |
| [apps/web/components/habits/create-habit-modal/sub-habit-editor.tsx:53](../apps/web/components/habits/create-habit-modal/sub-habit-editor.tsx#L53) | `{t('habits.form.addSubHabit')}` | Plus |
| [apps/web/components/habits/edit-habit-modal.tsx:492](../apps/web/components/habits/edit-habit-modal.tsx#L492) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/components/habits/goal-linking-field.tsx:88](../apps/web/components/habits/goal-linking-field.tsx#L88) | `{t('goals.create')}` | Plus |
| [apps/web/components/habits/goal-linking-field.tsx:92](../apps/web/components/habits/goal-linking-field.tsx#L92) | `{t('habits.form.createGoal')}` | Plus |
| [apps/web/components/habits/habit-checklist.tsx:232](../apps/web/components/habits/habit-checklist.tsx#L232) | `{t('habits.form.clearChecklist')}` | Trash2 |
| [apps/web/components/habits/habit-create-actions.tsx:33](../apps/web/components/habits/habit-create-actions.tsx#L33) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/components/habits/habit-detail-screen.tsx:144](../apps/web/components/habits/habit-detail-screen.tsx#L144) | `{t('habits.detail.retry')}` | RefreshCw |
| [apps/web/components/habits/habit-detail-screen.tsx:464](../apps/web/components/habits/habit-detail-screen.tsx#L464) | `{t('habits.detail.retry')}` | RefreshCw |
| [apps/web/components/habits/habit-detail-screen.tsx:628](../apps/web/components/habits/habit-detail-screen.tsx#L628) | `{t('habits.detail.retry')}` | RefreshCw |
| [apps/web/components/habits/habit-form-fields/reminder-section.tsx:126](../apps/web/components/habits/habit-form-fields/reminder-section.tsx#L126) | `{t('habits.form.reminderAdd')}` | Plus |
| [apps/web/components/habits/habit-form-fields/scheduled-reminder-section.tsx:116](../apps/web/components/habits/habit-form-fields/scheduled-reminder-section.tsx#L116) | `{t(nested ? 'habits.form.reminderAddTime' : 'habits.form.scheduledReminderAdd')}` | Plus |
| [apps/web/components/habits/habit-form-fields/scheduled-reminder-section.tsx:138](../apps/web/components/habits/habit-form-fields/scheduled-reminder-section.tsx#L138) | `{t('common.add')}` | Plus |
| [apps/web/components/habits/habit-form-fields/tag-picker-field.tsx:71](../apps/web/components/habits/habit-form-fields/tag-picker-field.tsx#L71) | `{t('habits.form.newTag')}` | Plus |
| [apps/web/components/habits/habit-form-fields/tag-picker-field.tsx:74](../apps/web/components/habits/habit-form-fields/tag-picker-field.tsx#L74) | `{t('habits.form.newTag')}` | Plus |
| [apps/web/components/habits/habit-list/empty-state.tsx:123](../apps/web/components/habits/habit-list/empty-state.tsx#L123) | `{actionLabel}` | RefreshCw |
| [apps/web/components/habits/habit-list/habit-drill.tsx:141](../apps/web/components/habits/habit-list/habit-drill.tsx#L141) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/habits/habit-list/move-parent-overlay.tsx:72](../apps/web/components/habits/habit-list/move-parent-overlay.tsx#L72) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/habits/habit-list/move-parent-overlay.tsx:138](../apps/web/components/habits/habit-list/move-parent-overlay.tsx#L138) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/components/milestone-share/milestone-share-prompt.tsx:170](../apps/web/components/milestone-share/milestone-share-prompt.tsx#L170) | `{t('milestoneShare.download')}` | Drawn consequence text (`sm`) |
| [apps/web/components/milestone-share/milestone-share-prompt.tsx:172](../apps/web/components/milestone-share/milestone-share-prompt.tsx#L172) | `{t('milestoneShare.share')}` | Drawn consequence text (`sm`) |
| [apps/web/components/navigation/notification-detail-modal.tsx:77](../apps/web/components/navigation/notification-detail-modal.tsx#L77) | `{t('notifications.delete')}` | Drawn consequence text (`sm`) |
| [apps/web/components/navigation/notification-list.tsx:36](../apps/web/components/navigation/notification-list.tsx#L36) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/onboarding/onboarding-flow.tsx:147](../apps/web/components/onboarding/onboarding-flow.tsx#L147) | `{t('retry')}` | RefreshCw |
| [apps/web/components/onboarding/onboarding-pro-step.tsx:70](../apps/web/components/onboarding/onboarding-pro-step.tsx#L70) | `{t('upgrade.billing.retry')}` | RefreshCw |
| [apps/web/components/profile/notion-connection-sheet.tsx:46](../apps/web/components/profile/notion-connection-sheet.tsx#L46) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/profile/profile-api-keys.tsx:89](../apps/web/components/profile/profile-api-keys.tsx#L89) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/profile/profile-api-keys.tsx:187](../apps/web/components/profile/profile-api-keys.tsx#L187) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/components/profile/profile-api-keys.tsx:275](../apps/web/components/profile/profile-api-keys.tsx#L275) | `{copied ? t('orbitMcp.copied') : t('orbitMcp.copy')}` | Copy |
| [apps/web/components/profile/profile-mcp-guide.tsx:39](../apps/web/components/profile/profile-mcp-guide.tsx#L39) | `{copyState === 'copied' ? t('orbitMcp.copied') : t('orbitMcp.copy')}` | Copy |
| [apps/web/components/referral/referral-drawer.tsx:179](../apps/web/components/referral/referral-drawer.tsx#L179) | `{t('common.cancel')}` | Drawn ghost text (`sm`) |
| [apps/web/components/referral/referral-drawer.tsx:180](../apps/web/components/referral/referral-drawer.tsx#L180) | `{t('referral.drawer.share')}` | Drawn consequence text (`sm`) |
| [apps/web/components/search/search-results.tsx:31](../apps/web/components/search/search-results.tsx#L31) | `{t(onClearSearch ? 'common.clear' : 'habits.search.create')}` | X |
| [apps/web/components/share/share-card-entry-button.tsx:18](../apps/web/components/share/share-card-entry-button.tsx#L18) | `{t('shareCard.entry')}` | Share2 |
| [apps/web/components/share/share-card-sheet.tsx:45](../apps/web/components/share/share-card-sheet.tsx#L45) | `{t('shareCard.download')}` | Download |
| [apps/web/components/share/share-card-sheet.tsx:46](../apps/web/components/share/share-card-sheet.tsx#L46) | `{t('shareCard.share')}` | Share2 |
| [apps/web/components/share/share-card-sheet.tsx:59](../apps/web/components/share/share-card-sheet.tsx#L59) | `{t('common.retry')}` | RefreshCw |
| [apps/web/components/ui/block-copy-control.tsx:33](../apps/web/components/ui/block-copy-control.tsx#L33) | `{t(status === 'copied' ? 'copied' : 'copy')}` | Copy |
| [apps/web/components/ui/block-frame.tsx:147](../apps/web/components/ui/block-frame.tsx#L147) | `{frameProps.refreshLabel ?? t('refresh')}` | RefreshCw |
| [apps/web/components/ui/scroll-to-top-button.tsx:26](../apps/web/components/ui/scroll-to-top-button.tsx#L26) | `{t('common.backToTop')}` | ArrowUp |
| [apps/web/components/ui/toast.tsx:96](../apps/web/components/ui/toast.tsx#L96) | `{props.actionLabel}` | RefreshCw |
| [apps/web/components/ui/update-available-banner.tsx:38](../apps/web/components/ui/update-available-banner.tsx#L38) | `{reloadReason ? t('errors.api.reload') : t('forceUpdate.refresh')}` | RefreshCw |
| [apps/web/components/upgrade/plan-selection.tsx:153](../apps/web/components/upgrade/plan-selection.tsx#L153) | `{t('upgrade.plans.retry')}` | RefreshCw |
| [apps/web/components/upgrade/provider-handoff.tsx:38](../apps/web/components/upgrade/provider-handoff.tsx#L38) | `{t('upgrade.billing.retry')}` | RefreshCw |

The common `ui/block-frame` stale footer and `chat/read-block-frame` query footer cover every registered Astra read family. `PendingOperationButtonSpec.icon` carries preview edit, rejection and retry intent into both `PreviewButton` renderers, keeping approval text. `ToastProps.actionIcon` and `HabitListEmptyState.actionIcon` carry failed-deletion and list-load retry intent without guessing from translated text.

The ESLint rule resolves literal text, both locale catalogs, local label bindings, translated conditional keys and pill import aliases. It ignores accessible labels on icon-only controls and preserves mixed contextual flow labels. Primitive tests cover bilingual names, target dimensions, hover, disabled and busy behavior. Stale-frame regression tests prove refresh has no visible label and invokes its existing callback. Consumer tests query accessible names rather than removed visible strings. Native target styles are unit evidence; device rendering remains a platform boundary.

API-key creation uses one plus entry opening distinct scoped and unscoped menu choices on both platforms, using the existing localized labels. A plus glyph alone cannot distinguish the two choices.

Habit suggestions use the paired `components/chat/habit-suggestions-card.tsx` owners.
Add uses Plus, Edit uses Pencil, Tweak uses AdjustmentsHorizontal and Swap uses RefreshCw.
The inline instruction submits through ArrowUp, and failed requests keep a named RefreshCw
retry. Every action retains a localized accessible name, a distinct shared icon target and
its disabled or busy state. Add all retains its explicitly requested primary text pill.
