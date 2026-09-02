'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Time24 } from '@orbit/shared/contracts/forms'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import type { HabitPhraseRead } from '@orbit/shared/utils'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import {
  coalesceFormText,
  formatLocaleDate,
  getFriendlyErrorMessage,
  HABIT_REMINDER_PRESETS,
  readHabitPhrase,
  resolveSupportedLocale,
} from '@orbit/shared/utils'
import { validateTagForm } from '@orbit/shared/validation'
import { useAppToast } from '@/hooks/use-app-toast'
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
import { Skeleton } from '@/components/ui/skeleton'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { HabitChecklist } from './habit-checklist'
import { HabitUnderstanding } from './habit-form-fields/habit-understanding'
import { HabitTagChip } from './habit-form-fields/habit-tag-chip'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'
import { SlipAlertSection } from './habit-form-fields/slip-alert-section'
import { TagEditorRow } from './habit-form-fields/tag-editor-row'
import { useExpandAdvancedSignal } from './habit-form-fields/use-expand-advanced-signal'

interface HabitFormFieldsProps {
  formHelpers: HabitFormHelpers
  titleInputRef?: RefObject<HTMLInputElement | null>
  tags: TagSelectionState
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  onReminderEnabledChange?: (nextEnabled: boolean) => void
  onSlipAlertEnabledChange?: (nextEnabled: boolean) => void
  hasScheduledReminders?: boolean
  defaultExpanded?: boolean
  lockedGeneral?: boolean | null
  expandAdvancedSignal?: number
  onSuggestSetup?: () => boolean | Promise<boolean>
  isSuggesting?: boolean
  readPhraseLocally?: boolean
  children?: ReactNode
}

function applyLocalRead(
  enabled: boolean,
  read: HabitPhraseRead,
  emoji: string,
  setFlexible: HabitFormHelpers['setFlexible'],
  setRecurring: HabitFormHelpers['setRecurring'],
  setValue: HabitFormHelpers['form']['setValue'],
) {
  if (!enabled || !read.cadence) return
  if (read.cadence === 'flexible') {
    setFlexible()
    setValue('frequencyUnit', 'Week', { shouldDirty: true })
    setValue('frequencyQuantity', read.frequencyQuantity, { shouldDirty: true })
    setValue('days', [], { shouldDirty: true })
  } else {
    setRecurring()
    setValue('frequencyUnit', 'Day', { shouldDirty: true })
    setValue('frequencyQuantity', 1, { shouldDirty: true })
    setValue('days', read.days, { shouldDirty: true })
  }
  if (read.dueTime) setValue('dueTime', read.dueTime, { shouldDirty: true })
  if (read.emoji && !emoji) setValue('emoji', read.emoji, { shouldDirty: true })
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

function shouldShowAstraFallback(title: string, sentence: string | null, action: unknown): boolean {
  return title.trim().length > 0 && sentence === null && typeof action === 'function'
}

async function askAstra(
  action: HabitFormFieldsProps['onSuggestSetup'],
  atLimit: boolean,
): Promise<boolean> {
  if (!action || atLimit) return false
  return action()
}

function isAtMessageLimit(hasProAccess: boolean, used: number, allowance: number): boolean {
  return !hasProAccess && used >= allowance
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

function reminderLabel(minutes: number, t: ReturnType<typeof useTranslations>): string {
  const preset = HABIT_REMINDER_PRESETS.find((item) => item.value === minutes)
  if (preset) return t(preset.key as Parameters<typeof t>[0])
  if (minutes < 60) return `${minutes} ${t('habits.form.reminderMinutes')}`
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60)
    return `${hours} ${t((hours === 1 ? 'habits.form.reminderHour' : 'habits.form.reminderHours') as Parameters<typeof t>[0])}`
  }
  const days = Math.floor(minutes / 1440)
  return `${days} ${t((days === 1 ? 'habits.form.reminderDay' : 'habits.form.reminderDays') as Parameters<typeof t>[0])}`
}

function buildUnderstandingSentence(
  days: string[],
  dayOptions: { value: string; label: string }[],
  isFlexible: boolean,
  hasFrequencyUnit: boolean,
  quantity: number,
  translate: (key: string, values?: Record<string, string | number | Date>) => string,
): string | null {
  if (days.length > 0) {
    const selectedDays = dayOptions
      .filter((day) => days.includes(day.value))
      .map((day) => day.label)
      .join(', ')
    return translate('habits.form.understoodDays', { days: selectedDays })
  }
  if (isFlexible || hasFrequencyUnit) {
    return translate('habits.form.understoodCount', { count: quantity })
  }
  return null
}

interface ReminderEditorsProps {
  dueTime: string
  hasScheduledReminders: boolean
  reminderEnabled: boolean
  reminderTimes: number[]
  scheduledReminders: { when: ScheduledReminderWhen; time: string }[]
  onReminderTimesChange: (times: number[]) => void
  onToggle: () => void
  onSetScheduledReminders: (items: { when: ScheduledReminderWhen; time: string }[]) => void
  onValidationError: (message: string) => void
  t: ReturnType<typeof useTranslations>
}

function ReminderEditors({
  dueTime,
  hasScheduledReminders,
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
      <ReminderSection reminderEnabled={reminderEnabled} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} onToggleReminder={onToggle} reminderLabel={(minutes) => reminderLabel(minutes, t)} t={t} />
      {hasScheduledReminders ? <ScheduledReminderSection reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={onToggle} onSetScheduledReminders={onSetScheduledReminders} onValidationError={onValidationError} nested t={t} /> : null}
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
  hasScheduledReminders = false,
  expandAdvancedSignal = 0,
  onSuggestSetup,
  isSuggesting = false,
  readPhraseLocally = false,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const t = useTranslations()
  const locale = resolveSupportedLocale(useLocale())
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const hasProAccess = useHasProAccess()
  const { profile } = useProfile()
  const { form, daysList, toggleDay, setRecurring, setFlexible } = formHelpers
  const { watch, setValue, formState: { errors } } = form
  const title = coalesceFormText(watch('title'))
  const emoji = watch('emoji') ?? ''
  const watchedDays = watch('days')
  const days = useMemo(() => watchedDays ?? [], [watchedDays])
  const frequencyQuantity = watch('frequencyQuantity') ?? 3
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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [proposed, setProposed] = useState(false)
  useExpandAdvancedSignal(expandAdvancedSignal, () => setDetailsOpen(true))

  const { tags: availableTags = [] } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const [justToggledTagId, setJustToggledTagId] = useState('')
  const selectedTagIdSet = useMemo(() => new Set(tags.selectedTagIds), [tags.selectedTagIds])
  const localRead = useMemo(() => readHabitPhrase(title, locale), [locale, title])

  useEffect(() => {
    applyLocalRead(readPhraseLocally, localRead, emoji, setFlexible, setRecurring, setValue)
  }, [emoji, localRead, readPhraseLocally, setFlexible, setRecurring, setValue])

  useEffect(() => {
    if (!dueTime && form.getValues('dueEndTime')) {
      setValue('dueEndTime', '', { shouldDirty: true })
    }
  }, [dueTime, form, setValue])

  const sentence = useMemo(
    () => buildUnderstandingSentence(days, daysList, isFlexible, !!frequencyUnit, frequencyQuantity, translate),
    [days, daysList, frequencyQuantity, frequencyUnit, isFlexible, translate],
  )
  const allowance = profile?.aiMessagesLimit ?? 5
  const atMessageLimit = isAtMessageLimit(hasProAccess, profile?.aiMessagesUsed ?? 0, allowance)

  const handleAskAstra = useCallback(async () => {
    setProposed(await askAstra(onSuggestSetup, atMessageLimit))
  }, [atMessageLimit, onSuggestSetup])

  const handleToggleDay = useCallback((day: string) => {
    setProposed(false)
    setRecurring()
    setValue('frequencyUnit', 'Day', { shouldDirty: true })
    setValue('frequencyQuantity', 1, { shouldDirty: true })
    toggleDay(day)
  }, [setRecurring, setValue, toggleDay])

  const handleQuantityChange = useCallback((quantity: number) => {
    setProposed(false)
    setFlexible()
    setValue('frequencyUnit', 'Week', { shouldDirty: true })
    setValue('frequencyQuantity', quantity, { shouldDirty: true })
  }, [setFlexible, setValue])

  const handleReminderEnabledChange = useCallback((nextEnabled: boolean) => {
    if (onReminderEnabledChange) onReminderEnabledChange(nextEnabled)
    else setValue('reminderEnabled', nextEnabled, { shouldDirty: true })
  }, [onReminderEnabledChange, setValue])

  const handleSlipAlertEnabledChange = useCallback((nextEnabled: boolean) => {
    if (onSlipAlertEnabledChange) onSlipAlertEnabledChange(nextEnabled)
    else setValue('slipAlertEnabled', nextEnabled, { shouldDirty: true })
  }, [onSlipAlertEnabledChange, setValue])

  function toggleTag(tagId: string) {
    if (!tags.selectedTagIds.includes(tagId)) {
      setJustToggledTagId(tagId)
      window.setTimeout(() => setJustToggledTagId(''), 160)
    }
    tags.toggleTag(tagId)
  }

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
        sentence={sentence}
        consumed={localRead.consumed}
        proposed={proposed}
        onValueChange={(value) => setValue('title', value, { shouldDirty: true, shouldValidate: true })}
        onEmojiSelect={(value) => {
          setProposed(false)
          setValue('emoji', value, { shouldDirty: true })
        }}
        onToggleDay={handleToggleDay}
        onQuantityChange={handleQuantityChange}
        labels={{
          field: t('habits.form.describe'),
          placeholder: t('habits.form.describePlaceholder'),
          understood: t('habits.form.understood'),
          understoodAstra: t('habits.form.understoodAstra'),
          unresolved: t('habits.form.unresolved'),
          days: t('habits.form.activeDays'),
          less: t('habits.form.lessOften'),
          more: t('habits.form.moreOften'),
          count: t('habits.form.timesAWeek'),
          proposed: t('habits.form.proposedByAstra'),
        }}
      />

      <AstraFallback
        visible={shouldShowAstraFallback(title, sentence, onSuggestSetup)}
        atLimit={atMessageLimit}
        isSuggesting={isSuggesting}
        unresolved={t('habits.form.unresolved')}
        limitMessage={t('habits.form.localReadLimit', { allowance })}
        readingLabel={t('habits.form.astraReading')}
        askLabel={t('habits.form.askAstra')}
        costLabel={t('habits.form.askAstraCost', { allowance })}
        onAsk={() => void handleAskAstra()}
      />

      <div className="flex flex-col" style={{ gap: 12 }}>
        <ListRow
          icon={detailsOpen ? 'chevron-down' : 'chevron-right'}
          title={t('habits.form.moreDetails')}
          chevron={false}
          onClick={() => setDetailsOpen((open) => !open)}
        />

        {detailsOpen ? (
          <div className="flex flex-col px-4" style={{ gap: 24 }}>
            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.exactTime')}</SectionLabel>
              <TimeField
                label={t('habits.form.exactTime')}
                hint={t('habits.form.anyTimeHint')}
                value={dueTime as Time24 | ''}
                onChange={(value) => setValue('dueTime', value, { shouldDirty: true })}
                onClear={() => setValue('dueTime', '', { shouldDirty: true })}
              />
            </section>

            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.reminders')}</SectionLabel>
              <ReminderEditors
                dueTime={dueTime}
                hasScheduledReminders={hasScheduledReminders}
                reminderEnabled={reminderEnabled}
                reminderTimes={reminderTimes}
                scheduledReminders={scheduledReminders}
                onReminderTimesChange={onReminderTimesChange}
                onToggle={() => handleReminderEnabledChange(!reminderEnabled)}
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
                onItemsChange={(items) => setValue('checklistItems', items, { shouldDirty: true })}
              />
              <ChecklistTemplates
                items={checklistItems}
                onLoad={(items) => setValue('checklistItems', items, { shouldDirty: true })}
              />
            </section>

            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.subHabits')}</SectionLabel>
              {children}
            </section>

            <section className="flex flex-col" style={{ gap: 8 }}>
              <SectionLabel inset={false} top={0} bottom={0}>{t('habits.form.habitTypeAvoid')}</SectionLabel>
              <Switch
                label={t('habits.form.habitTypeAvoid')}
                checked={isBadHabit}
                onChange={(checked) => setValue('isBadHabit', checked, { shouldDirty: true })}
              />
              <p className="text-sm text-[var(--fg-3)]">{t('habits.form.habitTypeAvoidHint')}</p>
            </section>

            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.slipAlert')}</SectionLabel>
              <SlipAlertSection
                hasProAccess={hasProAccess}
                slipAlertEnabled={slipAlertEnabled}
                onToggle={() => handleSlipAlertEnabledChange(!slipAlertEnabled)}
                t={t}
              />
            </section>

            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.tags')}</SectionLabel>
              <div className="flex flex-wrap" style={{ gap: 8 }}>
                {availableTags.map((tag) => (
                  <HabitTagChip
                    key={tag.id}
                    tag={tag}
                    selected={selectedTagIdSet.has(tag.id)}
                    atLimit={!selectedTagIdSet.has(tag.id) && tags.atTagLimit}
                    animationClassName={justToggledTagId === tag.id ? 'animate-tag-pop' : ''}
                    disabled={deleteTag.isPending || createTag.isPending || updateTag.isPending}
                    onToggle={() => toggleTag(tag.id)}
                    onEdit={() => tags.startEditTag(tag)}
                    onDelete={() => void tags.deleteTag(tag.id, (id) => deleteTag.mutateAsync(id))}
                    editAriaLabel={t('habits.form.editTag')}
                    deleteAriaLabel={t('habits.form.deleteTag')}
                  />
                ))}
                {!tags.showNewTag && !tags.atTagLimit ? (
                  <button type="button" className="chip" onClick={() => tags.setShowNewTag(true)}>
                    {t('habits.form.newTag')}
                  </button>
                ) : null}
              </div>
              {tags.atTagLimit ? <p className="text-sm text-[var(--fg-3)]">{t('habits.form.tagLimit')}</p> : null}
              {tags.showNewTag ? (
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
              ) : null}
              {tags.editingTagId ? (
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
              ) : null}
            </section>

            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.goals')}</SectionLabel>
              <GoalLinkingField
                selectedGoalIds={selectedGoalIds}
                atGoalLimit={atGoalLimit}
                onToggleGoal={onToggleGoal}
              />
            </section>

            <section>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.endDate')}</SectionLabel>
              <DateField
                value={endDate}
                placeholder={t('habits.form.endDatePlaceholder')}
                onChange={(value) => setValue('endDate', value, { shouldDirty: true })}
              />
            </section>

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

      {dueDate ? (
        <section className="flex flex-col" style={{ gap: 4 }}>
          <span className="text-xs text-[var(--fg-3)]">{t('habits.form.startDate')}</span>
          <span className="text-[17px] text-[var(--fg-1)]">{formatLocaleDate(dueDate)}</span>
          <span className="text-sm leading-[1.5] text-[var(--fg-3)]">{t('habits.form.startDateReason')}</span>
        </section>
      ) : null}
    </div>
  )
}
