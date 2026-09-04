'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { Time24 } from '@orbit/shared/contracts/forms'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import type { HabitFormCommonProps } from '@orbit/shared/utils'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import {
  buildHabitAstraFallbackCopy,
  buildHabitUnderstandingLabels,
  buildHabitUnderstandingSentence,
  createHabitFormController,
  EMPTY_HABIT_FORM_PROPOSAL,
  coalesceFormText,
  formatHabitReminderLabel,
  formatLocaleDate,
  getFriendlyErrorMessage,
  habitFeaturePlan,
  isFeatureEnabled,
  isHabitAstraLimitReached,
  readHabitPhrase,
  resolveHabitStartDate,
  resolveSupportedLocale,
  shouldShowHabitAstraFallback,
} from '@orbit/shared/utils'
import { validateTagForm } from '@orbit/shared/validation'
import { useAppToast } from '@/hooks/use-app-toast'
import { useConfig } from '@/hooks/use-config'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/hooks/use-tags'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { SectionLabel } from '@/components/ui/section-label'
import { Switch } from '@/components/ui/switch'
import { TimeField } from '@/components/ui/time-field'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { PillButton } from '@/components/ui/pill-button'
import { Proposed } from '@/components/ui/proposed'
import { Skeleton } from '@/components/ui/skeleton'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { HabitChecklist } from './habit-checklist'
import { HabitUnderstanding } from './habit-form-fields/habit-understanding'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'
import { SlipAlertSection } from './habit-form-fields/slip-alert-section'
import { TagEditorRow } from './habit-form-fields/tag-editor-row'
import { TagPickerField } from './habit-form-fields/tag-picker-field'
import { useExpandAdvancedSignal } from './habit-form-fields/use-expand-advanced-signal'

interface HabitFormFieldsProps extends HabitFormCommonProps<HabitFormHelpers, TagSelectionState, ReactNode> {
  titleInputRef?: RefObject<HTMLInputElement | null>
}

function renderSubHabitChildren(
  children: ReactNode | ((proposedItems: number) => ReactNode),
  proposedItems: number,
): ReactNode {
  return typeof children === 'function' ? children(proposedItems) : children
}

interface AstraFallbackProps {
  visible: boolean
  atLimit: boolean
  isSuggesting: boolean
  unresolved: string
  limitMessage: string
  readingLabel: string
  askLabel: string
  costLabel: string
  onAsk: () => void
}

function AstraFallback({
  visible,
  atLimit,
  isSuggesting,
  unresolved,
  limitMessage,
  readingLabel,
  askLabel,
  costLabel,
  onAsk,
}: Readonly<AstraFallbackProps>) {
  if (!visible) return null
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {atLimit ? (
        <CapacityNotice message={limitMessage} />
      ) : (
        <p className="rounded-[12px] bg-[var(--bg-well)] p-3 text-sm leading-[1.55] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)]">
          {unresolved}
        </p>
      )}
      {isSuggesting ? (
        <Skeleton variant="settings" label={readingLabel} />
      ) : (
        <div className="flex flex-col items-start" style={{ gap: 8 }}>
          <PillButton variant="secondary" disabled={atLimit} onClick={onAsk}>{askLabel}</PillButton>
          {!atLimit ? <p className="text-xs text-[var(--fg-3)]">{costLabel}</p> : null}
        </div>
      )}
    </div>
  )
}

interface ReminderEditorsProps {
  dueTime: string
  reminderEnabled: boolean
  reminderTimes: number[]
  scheduledReminders: { when: ScheduledReminderWhen; time: string }[]
  onReminderTimesChange: (times: number[]) => void
  onToggle: () => void
  onSetScheduledReminders: (items: { when: ScheduledReminderWhen; time: string }[]) => void
  onValidationError: (message: string) => void
  t: ReturnType<typeof useTranslations>
}

interface SubHabitSectionProps {
  canUseSubHabits: boolean
  proposed: boolean
  onUpgrade: () => void
  children?: ReactNode
  t: ReturnType<typeof useTranslations>
}

interface EndDateEditorProps {
  visible: boolean
  value: string
  onChange: (value: string) => void
  t: (key: string) => string
}

function EndDateEditor({ visible, value, onChange, t }: Readonly<EndDateEditorProps>) {
  if (!visible) return null
  return (
    <section>
      <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.endDate')}</SectionLabel>
      <DateField value={value} placeholder={t('habits.form.endDatePlaceholder')} onChange={onChange} />
    </section>
  )
}

interface SlipAlertEditorProps {
  visible: boolean
  hasProAccess: boolean
  slipAlertEnabled: boolean
  onToggle: () => void
  t: ReturnType<typeof useTranslations>
}

function SlipAlertEditor({
  visible,
  hasProAccess,
  slipAlertEnabled,
  onToggle,
  t,
}: Readonly<SlipAlertEditorProps>) {
  if (!visible) return null
  return (
    <section>
      <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.slipAlert')}</SectionLabel>
      <SlipAlertSection hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={onToggle} t={t} />
    </section>
  )
}

function SubHabitSection({
  canUseSubHabits,
  proposed,
  onUpgrade,
  children,
  t,
}: Readonly<SubHabitSectionProps>) {
  return (
    <section>
      <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.subHabits')}</SectionLabel>
      {canUseSubHabits ? (
        <Proposed proposed={proposed && !!children} scope="field" label={t('habits.form.proposed')}>
          {children}
        </Proposed>
      ) : (
        <ListRow title={t('common.upgrade')} value={t('common.proBadge')} onClick={onUpgrade} />
      )}
    </section>
  )
}

function ReminderEditors({
  dueTime,
  reminderEnabled,
  reminderTimes,
  scheduledReminders,
  onReminderTimesChange,
  onToggle,
  onSetScheduledReminders,
  onValidationError,
  t,
}: Readonly<ReminderEditorsProps>) {
  if (!dueTime) {
    return <ScheduledReminderSection reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={onToggle} onSetScheduledReminders={onSetScheduledReminders} onValidationError={onValidationError} t={t} />
  }
  return (
    <>
      <ReminderSection reminderEnabled={reminderEnabled} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} onToggleReminder={onToggle} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, (key) => t(key))} t={t} />
      <ScheduledReminderSection reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={onToggle} onSetScheduledReminders={onSetScheduledReminders} onValidationError={onValidationError} nested t={t} />
    </>
  )
}

export function HabitFormFields({
  formHelpers,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  reminderTimes,
  onReminderTimesChange,
  onReminderEnabledChange,
  onSlipAlertEnabledChange,
  onSuggestionContextChange,
  onResolveSubHabitProposalReady,
  expandAdvancedSignal = 0,
  onSuggestSetup,
  isSuggesting = false,
  readPhraseLocally = false,
  lockedGeneral = null,
  startDate,
  defaultExpanded = false,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const t = useTranslations()
  const router = useRouter()
  const locale = resolveSupportedLocale(useLocale())
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const hasProAccess = useHasProAccess()
  const { config } = useConfig()
  const { profile } = useProfile()
  const { form, daysList, showEndDate, toggleDay, setOneTime, setRecurring, setFlexible, setGeneral } = formHelpers
  const { watch, setValue, formState: { errors } } = form
  const title = coalesceFormText(watch('title'))
  const emoji = watch('emoji') ?? ''
  const watchedDays = watch('days')
  const days = useMemo(() => watchedDays ?? [], [watchedDays])
  const frequencyQuantity = watch('frequencyQuantity') ?? 3
  const intervalWeeks = watch('intervalWeeks') ?? 1
  const frequencyUnit = watch('frequencyUnit')
  const isFlexible = watch('isFlexible') ?? false
  const dueDate = watch('dueDate') ?? ''
  const dueTime = watch('dueTime') ?? ''
  const endDate = watch('endDate') ?? ''
  const description = watch('description') ?? ''
  const reminderEnabled = watch('reminderEnabled') ?? false
  const scheduledReminders = watch('scheduledReminders') ?? []
  const checklistItems = watch('checklistItems') ?? []
  const isBadHabit = watch('isBadHabit') ?? false
  const slipAlertEnabled = watch('slipAlertEnabled') ?? false
  const canUseSubHabits = isFeatureEnabled(config, 'habits.subHabits', habitFeaturePlan(hasProAccess))
  const displayedStartDate = resolveHabitStartDate(startDate, dueDate)
  const [detailsOpen, setDetailsOpen] = useState(defaultExpanded)
  const [detailsPresented, setDetailsPresented] = useState(defaultExpanded)
  const [proposal, setProposal] = useState(EMPTY_HABIT_FORM_PROPOSAL)
  const rendersGranularSubHabits = typeof children === 'function'
  const subHabitChildren = renderSubHabitChildren(children, proposal.subHabitItems)
  const [phraseOwnership, setPhraseOwnership] = useState({ cadence: false, dueTime: false })
  const lastLocallyReadTitleRef = useRef<string | null>(null)
  useExpandAdvancedSignal(expandAdvancedSignal, () => {
    setDetailsPresented(true)
    setDetailsOpen(true)
  })

  const { tags: availableTags = [] } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const tagMutationPending = createTag.isPending || updateTag.isPending || deleteTag.isPending
  const localRead = useMemo(() => readHabitPhrase(title, locale), [locale, title])

  useEffect(() => {
    if (!dueTime && form.getValues('dueEndTime')) {
      setValue('dueEndTime', '', { shouldDirty: true })
    }
  }, [dueTime, form, setValue])

  const sentence = useMemo(
    () => buildHabitUnderstandingSentence(days, daysList, isFlexible, frequencyUnit, frequencyQuantity, dueTime, locale, translate, intervalWeeks),
    [days, daysList, dueTime, frequencyQuantity, frequencyUnit, intervalWeeks, isFlexible, locale, translate],
  )
  const allowance = profile?.aiMessagesLimit ?? 5
  const atMessageLimit = isHabitAstraLimitReached(profile?.aiMessagesUsed ?? 0, allowance)
  const understandingLabels = useMemo(() => buildHabitUnderstandingLabels(translate), [translate])
  const astraFallbackCopy = useMemo(
    () => buildHabitAstraFallbackCopy(translate, allowance),
    [allowance, translate],
  )

  const controller = useMemo(() => createHabitFormController({
    action: onSuggestSetup,
    atLimit: atMessageLimit,
    lockedGeneral,
    onReminderEnabledChange,
    onSlipAlertEnabledChange,
    onSuggestionContextChange,
    target: {
      hasSchedule: () => isFlexible || Boolean(frequencyUnit),
      getOwnership: () => phraseOwnership,
      setOwnership: setPhraseOwnership,
      updateProposal: (update) => setProposal(update),
      setOneTime,
      setRecurring,
      setFlexible,
      setGeneral,
      setField: (field, value, validate = false) => setValue(
        field,
        value as never,
        validate ? { shouldDirty: true, shouldValidate: true } : { shouldDirty: true },
      ),
      toggleDay,
    },
  }), [atMessageLimit, frequencyUnit, isFlexible, lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange, onSuggestSetup, onSuggestionContextChange, phraseOwnership, setFlexible, setGeneral, setOneTime, setRecurring, setValue, toggleDay])

  useEffect(() => {
    if (lastLocallyReadTitleRef.current === title) return
    lastLocallyReadTitleRef.current = title
    controller.readPhrase(readPhraseLocally, localRead, emoji)
  }, [controller, emoji, localRead, readPhraseLocally, title])

  useEffect(() => {
    if (!onResolveSubHabitProposalReady) return
    // react-doctor-disable-next-line no-prop-callback-in-effect -- the modal owns this editor; registering its resolver preserves section-specific proposal state https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onResolveSubHabitProposalReady(controller.resolveSubHabitProposal)
    return () => onResolveSubHabitProposalReady(() => {})
  }, [controller, onResolveSubHabitProposalReady])

  async function createNewTag() {
    const validationError = validateTagForm(tags.newTagName, tags.newTagColor)
    if (validationError) {
      showError(translate(validationError))
      return
    }
    await tags.createAndSelectTag(async (name, color) => {
      try {
        return (await createTag.mutateAsync({ name, color })).id
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
        throw error
      }
    })
  }

  async function saveEditedTag() {
    await tags.saveEditTag(async (id, name, color) => {
      try {
        await updateTag.mutateAsync({ tagId: id, name, color })
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
        throw error
      }
    })
  }

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <HabitUnderstanding
        value={title}
        error={errors.title?.message}
        emoji={emoji}
        days={days}
        dayOptions={daysList}
        quantity={frequencyQuantity}
        mode={isFlexible ? 'flexible' : 'fixed'}
        intervalWeeks={intervalWeeks}
        sentence={sentence}
        consumed={localRead.consumed}
        proposed={proposal.setup}
        scheduleLocked={lockedGeneral === true}
        onValueChange={(value) => {
          controller.setTitle(value)
        }}
        onEmojiSelect={controller.setEmoji}
        onToggleDay={controller.toggleDay}
        onQuantityChange={controller.setQuantity}
        onModeChange={controller.setScheduleMode}
        onIntervalWeeksChange={controller.setIntervalWeeks}
        labels={understandingLabels}
      />

      <AstraFallback
        visible={shouldShowHabitAstraFallback(title, sentence, onSuggestSetup, proposal)}
        atLimit={atMessageLimit}
        isSuggesting={isSuggesting}
        {...astraFallbackCopy}
        onAsk={() => void controller.askAstra()}
      />

      <div className="flex flex-col" style={{ gap: 12 }}>
        <ListRow
          icon={detailsOpen ? 'chevron-down' : 'chevron-right'}
          title={t('habits.form.moreDetails')}
          chevron={false}
          onClick={() => {
            if (detailsOpen) {
              setDetailsOpen(false)
            } else {
              setDetailsPresented(true)
              setDetailsOpen(true)
            }
          }}
        />

        {detailsPresented ? (
          <div
            className="habit-form-disclosure flex flex-col px-4"
            data-open={detailsOpen}
            inert={!detailsOpen ? true : undefined}
            style={{ gap: 24 }}
            onTransitionEnd={(event) => {
              if (!detailsOpen && event.propertyName === 'opacity') setDetailsPresented(false)
            }}
          >
            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.exactTime')}</SectionLabel>
              <TimeField
                label={t('habits.form.exactTime')}
                hint={t('habits.form.anyTimeHint')}
                value={dueTime as Time24 | ''}
                onChange={controller.setDueTime}
                onClear={controller.clearDueTime}
              />
            </section>

            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.reminders')}</SectionLabel>
              <ReminderEditors
                dueTime={dueTime}
                reminderEnabled={reminderEnabled}
                reminderTimes={reminderTimes}
                scheduledReminders={scheduledReminders}
                onReminderTimesChange={onReminderTimesChange}
                onToggle={() => controller.setReminderEnabled(!reminderEnabled)}
                onSetScheduledReminders={(items) => setValue('scheduledReminders', items, { shouldDirty: true })}
                onValidationError={showError}
                t={t}
              />
            </section>

            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.checklist')}</SectionLabel>
              <HabitChecklist
                items={checklistItems}
                editable
                proposedItemCount={proposal.checklistItems}
                onItemsChange={controller.setChecklistItems}
              />
              <ChecklistTemplates
                items={checklistItems}
                onLoad={controller.setChecklistItems}
              />
            </section>

            <SubHabitSection canUseSubHabits={canUseSubHabits} proposed={proposal.subHabits && !rendersGranularSubHabits} onUpgrade={() => router.push('/upgrade')} t={t}>
              {subHabitChildren}
            </SubHabitSection>

            <section className="flex items-center justify-between" style={{ gap: 16 }}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] text-[var(--fg-1)]">{t('habits.form.habitTypeAvoid')}</p>
                <p className="truncate text-sm text-[var(--fg-3)]">{t('habits.form.habitTypeAvoidHint')}</p>
              </div>
              <Switch
                label={t('habits.form.habitTypeAvoid')}
                checked={isBadHabit}
                onChange={(checked) => setValue('isBadHabit', checked, { shouldDirty: true })}
              />
            </section>

            <SlipAlertEditor visible={isBadHabit} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={() => controller.setSlipAlertEnabled(!slipAlertEnabled)} t={t} />

            <section>
              <TagPickerField tags={availableTags} selectedIds={tags.selectedTagIds} atLimit={tags.atTagLimit} disabled={tagMutationPending} onToggle={tags.toggleTag} onCreate={() => tags.setShowNewTag(true)} onEdit={tags.startEditTag} onDelete={(id) => void tags.deleteTag(id, (tagId) => deleteTag.mutateAsync(tagId))} editLabel={t('habits.form.editTag')} deleteLabel={t('habits.form.deleteTag')} editor={tags.showNewTag ? (
                <TagEditorRow
                  value={tags.newTagName}
                  placeholder={t('habits.form.tagName')}
                  disabled={createTag.isPending}
                  inputAriaLabel={t('habits.form.tagName')}
                  cancelAriaLabel={t('common.cancel')}
                  actionLabel={t('common.add')}
                  onChange={tags.setNewTagName}
                  onCommit={() => void createNewTag()}
                  onCancel={() => tags.setShowNewTag(false)}
                />
              ) : tags.editingTagId ? (
                <TagEditorRow
                  value={tags.editTagName}
                  disabled={updateTag.isPending}
                  inputAriaLabel={t('habits.form.tagName')}
                  cancelAriaLabel={t('common.cancel')}
                  actionLabel={t('common.save')}
                  onChange={tags.setEditTagName}
                  onCommit={() => void saveEditedTag()}
                  onCancel={tags.cancelEditTag}
                />
              ) : undefined} />
              {tags.atTagLimit ? <p className="text-sm text-[var(--fg-3)]">{t('habits.form.tagLimit')}</p> : null}
            </section>

            <section>
              <GoalLinkingField
                selectedGoalIds={selectedGoalIds}
                atGoalLimit={atGoalLimit}
                onToggleGoal={onToggleGoal}
              />
            </section>

            <EndDateEditor visible={showEndDate} value={endDate} onChange={(value) => setValue('endDate', value, { shouldDirty: true })} t={t} />

            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.description')}</SectionLabel>
              <Input
                label={t('habits.form.description')}
                value={description}
                onChange={(value) => setValue('description', value, { shouldDirty: true })}
                placeholder={t('habits.form.descriptionPlaceholder')}
                multiline
                rows={3}
                maxLength={10000}
              />
            </section>
          </div>
        ) : null}
      </div>

      {displayedStartDate ? (
        <section className="flex flex-col" style={{ gap: 4 }}>
          <span className="text-xs text-[var(--fg-3)]">{t('habits.form.startDate')}</span>
          <span className="text-[17px] text-[var(--fg-1)]">{formatLocaleDate(displayedStartDate, locale)}</span>
          <span className="text-sm leading-[1.5] text-[var(--fg-3)]">{t('habits.form.startDateReason')}</span>
        </section>
      ) : null}
    </div>
  )
}
