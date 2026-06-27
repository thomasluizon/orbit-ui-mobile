'use client'

import { useState, useMemo, useCallback, useEffect, type ReactNode, type RefObject } from 'react'
import { X, Plus, TrendingUp, TrendingDown, ChevronDown, Sparkles, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { FrequencyUnit, SuggestedTag } from '@orbit/shared/types/habit'
import {
  HABIT_REMINDER_PRESETS,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import {
  MAX_HABIT_DESCRIPTION_LENGTH,
  MAX_HABIT_TITLE_LENGTH,
  validateTagForm,
} from '@orbit/shared/validation'
import { HabitChecklist } from './habit-checklist'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { ColorSwatches } from './habit-form-fields/color-swatches'
import { FrequencyTypeCards } from './habit-form-fields/frequency-type-cards'
import { HabitEmojiSelector } from './habit-form-fields/habit-emoji-selector'
import { HabitTagChip } from './habit-form-fields/habit-tag-chip'
import { PillToggleRow } from './habit-form-fields/pill-toggle-row'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'
import { SlipAlertSection } from './habit-form-fields/slip-alert-section'
import { TagEditorRow } from './habit-form-fields/tag-editor-row'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { AppTimePicker } from '@/components/ui/app-time-picker'
import { AppSelect } from '@/components/ui/app-select'
import { useAppToast } from '@/hooks/use-app-toast'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useHasProAccess } from '@/hooks/use-profile'
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/hooks/use-tags'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'

interface HabitFormFieldsProps {
  formHelpers: HabitFormHelpers
  titleInputRef?: RefObject<HTMLInputElement | null>
  tags: TagSelectionState
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
  /** Controlled reminderTimes state from parent modal */
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  onReminderEnabledChange?: (nextEnabled: boolean) => void
  /** When true, advanced fields are visible by default (used in edit modal) */
  defaultExpanded?: boolean
  /** Incrementing this opens the advanced section (used to reveal AI-applied checklist / sub-habits). */
  expandAdvancedSignal?: number
  /** When provided, renders the "Suggest with AI" affordance that requests a setup for the title. */
  onSuggestSetup?: () => void
  isSuggesting?: boolean
  children?: ReactNode
}

export function HabitFormFields({
  formHelpers,
  titleInputRef,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  reminderTimes,
  onReminderTimesChange,
  onReminderEnabledChange,
  defaultExpanded = false,
  expandAdvancedSignal = 0,
  onSuggestSetup,
  isSuggesting = false,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const hasProAccess = useHasProAccess()
  const { showError } = useAppToast()

  const {
    form,
    isOneTime,
    isGeneral,
    isFlexible,
    showDayPicker,
    showEndDate,
    daysList,
    frequencyUnits,
    setOneTime,
    setRecurring,
    setFlexible,
    setGeneral,
    toggleDay,
  } = formHelpers

  const { register, watch, setValue, formState: { errors } } = form
  const titleRegister = register('title')

  const watchedTitle = watch('title') ?? ''
  const watchedFrequencyUnit = watch('frequencyUnit') ?? null
  const watchedFrequencyQuantity = watch('frequencyQuantity') ?? null
  const watchedDays = watch('days') ?? []
  const watchedDueDate = watch('dueDate') ?? ''
  const watchedDueTime = watch('dueTime') ?? ''
  const watchedDueEndTime = watch('dueEndTime') ?? ''
  const watchedEndDate = watch('endDate') ?? ''
  const watchedIsBadHabit = watch('isBadHabit') ?? false
  const watchedReminderEnabled = watch('reminderEnabled') ?? false
  const watchedSlipAlertEnabled = watch('slipAlertEnabled') ?? false
  const watchedChecklistItemsRaw = watch('checklistItems')
  const watchedChecklistItems = useMemo(() => watchedChecklistItemsRaw ?? [], [watchedChecklistItemsRaw])
  const watchedScheduledReminders = watch('scheduledReminders') ?? []
  const { tags: availableTags = [] } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const isTagMutationPending = createTag.isPending || updateTag.isPending || deleteTag.isPending

  function reminderLabel(minutes: number): string {
    const preset = HABIT_REMINDER_PRESETS.find((p) => p.value === minutes)
    if (preset) return t(preset.key as Parameters<typeof t>[0])
    if (minutes < 60) return `${minutes} ${t('habits.form.reminderMinutes')}`
    if (minutes < 1440) {
      const h = Math.floor(minutes / 60)
      return `${h} ${t((h === 1 ? 'habits.form.reminderHour' : 'habits.form.reminderHours') as Parameters<typeof t>[0])}`
    }
    const d = Math.floor(minutes / 1440)
    return `${d} ${t((d === 1 ? 'habits.form.reminderDay' : 'habits.form.reminderDays') as Parameters<typeof t>[0])}`
  }

  useEffect(() => {
    if (!watchedDueTime && watchedDueEndTime) {
      setValue('dueEndTime', '', { shouldDirty: true })
    }
  }, [watchedDueTime, watchedDueEndTime, setValue])

  const handleReminderEnabledChange = useCallback((nextEnabled: boolean) => {
    if (onReminderEnabledChange) {
      onReminderEnabledChange(nextEnabled)
      return
    }

    setValue('reminderEnabled', nextEnabled, { shouldDirty: true })
  }, [onReminderEnabledChange, setValue])

  const [showAdvanced, setShowAdvanced] = useState(defaultExpanded)
  const [prevExpandSignal, setPrevExpandSignal] = useState(expandAdvancedSignal)
  if (expandAdvancedSignal !== prevExpandSignal) {
    setPrevExpandSignal(expandAdvancedSignal)
    if (expandAdvancedSignal > 0) setShowAdvanced(true)
  }

  const watchedDescription = watch('description') ?? ''
  const watchedEmoji = watch('emoji') ?? ''
  const advancedFieldCount = useMemo(() => {
    return [
      watchedDescription.length > 0,
      watchedChecklistItems.length > 0,
      watchedEndDate.length > 0,
      watchedReminderEnabled,
      selectedGoalIds.length > 0,
      watchedIsBadHabit,
    ].filter(Boolean).length
  }, [watchedDescription, watchedChecklistItems, watchedEndDate, watchedReminderEnabled, selectedGoalIds, watchedIsBadHabit])

  const [justToggledTagId, setJustToggledTagId] = useState('')

  function handleTagToggle(tagId: string) {
    if (!tags.selectedTagIds.includes(tagId)) {
      setJustToggledTagId(tagId)
      setTimeout(() => setJustToggledTagId(''), 200)
    }
    tags.toggleTag(tagId)
  }

  function handleAcceptSuggestion(suggestion: SuggestedTag) {
    void tags.acceptSuggestedTag(suggestion, async (name, color) => {
      try {
        const result = await createTag.mutateAsync({ name, color })
        return result.id
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
        throw error
      }
    })
  }

  const tagSuggestions = useTagSuggestions(watchedTitle, watchedDescription, tags.atTagLimit)

  async function handleSuggestTags() {
    try {
      await tagSuggestions.suggest()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'habits.form.suggestTagsError', 'generic'))
    }
  }

  return (
    <>
      <div className="space-y-2">
        <label htmlFor="habit-form-title" className="form-label">
          {t('habits.form.title')}
        </label>
        <div className="flex items-end" style={{ gap: 12 }}>
          <HabitEmojiSelector
            selectedEmoji={watchedEmoji}
            onSelect={(emoji) => setValue('emoji', emoji, { shouldDirty: true })}
          />
          <div className="relative flex-1 min-w-0">
            <input
              id="habit-form-title"
              type="text"
              maxLength={MAX_HABIT_TITLE_LENGTH}
              placeholder={t('habits.form.titlePlaceholder')}
              className="form-input w-full"
              style={onSuggestSetup ? { paddingRight: 52 } : undefined}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'habit-form-title-error' : undefined}
              {...titleRegister}
              ref={(element) => {
                titleRegister.ref(element)
                if (titleInputRef) {
                  titleInputRef.current = element
                }
              }}
            />
            {onSuggestSetup && (
              <button
                type="button"
                data-testid="habit-suggest-setup"
                className="ai-spark-btn"
                aria-busy={isSuggesting || undefined}
                aria-label={isSuggesting ? t('habits.form.aiSuggesting') : t('habits.form.aiSuggest')}
                title={t('habits.form.aiSuggest')}
                disabled={isSuggesting || watchedTitle.trim().length === 0}
                onClick={onSuggestSetup}
              >
                {isSuggesting ? (
                  <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles size={18} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
        {errors.title && (
          <p id="habit-form-title-error" className="text-xs text-[var(--status-bad)] mt-1" role="alert">
            {errors.title.message}
          </p>
        )}
      </div>

      <FrequencyTypeCards
        isOneTime={isOneTime}
        isGeneral={isGeneral}
        isFlexible={isFlexible}
        onSetOneTime={setOneTime}
        onSetRecurring={setRecurring}
        onSetFlexible={setFlexible}
        onSetGeneral={setGeneral}
        t={t}
      />

      {isFlexible && (
        <p className="text-[13px] text-[var(--fg-3)]">
          {t('habits.form.flexibleDescription', {
            n: watchedFrequencyQuantity ?? 3,
            unit: watchedFrequencyUnit
              ? t(`habits.form.unit${watchedFrequencyUnit}` as Parameters<typeof t>[0])
              : '',
          })}
        </p>
      )}

      {!isOneTime && !isGeneral && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor="habit-form-frequency-qty" className="form-label">
              {isFlexible
                ? t('habits.form.timesPerUnit')
                : t('habits.form.every')}
            </label>
            <input
              id="habit-form-frequency-qty"
              type="number"
              min={1}
              required
              className="form-input"
              {...register('frequencyQuantity', { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <span id="habit-form-unit-label" className="form-label">
              {t('habits.form.unit')}
            </span>
            <AppSelect
              value={watchedFrequencyUnit ?? ''}
              options={frequencyUnits.map((u) => ({
                value: u.value,
                label: u.label,
              }))}
              label={t('habits.form.unit')}
              onChange={(val) =>
                setValue('frequencyUnit', val as FrequencyUnit, {
                  shouldDirty: true,
                })
              }
            />
          </div>
        </div>
      )}

      {showDayPicker && !isGeneral && (
        <div className="space-y-2" role="group" aria-labelledby="habit-form-active-days-label">
          <span id="habit-form-active-days-label" className="form-label">
            {t('habits.form.activeDays')}
          </span>
          <PillToggleRow
            containerClassName="flex gap-2"
            buttonClassName="flex-1 inline-flex h-[42px] items-center justify-center rounded-[12px] text-[14px] font-medium transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.96]"
            activeClassName="bg-[var(--primary)] text-[var(--fg-on-primary)]"
            inactiveClassName="bg-[var(--bg-field)] text-[var(--fg-3)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg-1)]"
            options={daysList.map((day) => ({
              key: day.value,
              label: day.label,
              active: watchedDays?.includes(day.value) ?? false,
              onClick: () => toggleDay(day.value),
            }))}
          />
        </div>
      )}

      {!isGeneral && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <span id="habit-form-due-date-label" className="form-label">
              {t('habits.form.dueDate')}
            </span>
            <AppDatePicker
              value={watchedDueDate}
              onChange={(val) => setValue('dueDate', val, { shouldDirty: true })}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="habit-form-due-time" className="form-label">
              {t('habits.form.dueTime')}
            </label>
            <AppTimePicker
              id="habit-form-due-time"
              placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
              value={watchedDueTime}
              ariaLabel={t('habits.form.dueTime')}
              onChange={(nextValue) => setValue('dueTime', nextValue, { shouldDirty: true })}
              onClear={() => {
                setValue('dueTime', '', { shouldDirty: true })
                setValue('dueEndTime', '', { shouldDirty: true })
              }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2" role="group" aria-labelledby="habit-form-tags-label">
        <span id="habit-form-tags-label" className="form-label">
          {t('habits.form.tags')}
        </span>
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => (
            <HabitTagChip
              key={tag.id}
              tag={tag}
              selected={tags.selectedTagIds.includes(tag.id)}
              atLimit={!tags.selectedTagIds.includes(tag.id) && tags.atTagLimit}
              animationClassName={justToggledTagId === tag.id ? 'animate-tag-pop' : ''}
              disabled={isTagMutationPending}
              onToggle={() => handleTagToggle(tag.id)}
              editAriaLabel={t('habits.form.editTag')}
              deleteAriaLabel={t('habits.form.deleteTag')}
              onEdit={() => {
                tags.startEditTag(tag)
              }}
              onDelete={() => {
                void tags.deleteTag(tag.id, async (id) => {
                  try {
                    await deleteTag.mutateAsync(id)
                  } catch (error: unknown) {
                    showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
                    throw error
                  }
                })
              }}
            />
          ))}
          {!tags.showNewTag && !tags.atTagLimit && (
            <button
              type="button"
              className="chip"
              disabled={isTagMutationPending}
              onClick={() => tags.setShowNewTag(true)}
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              {t('habits.form.newTag')}
            </button>
          )}
          <button
            type="button"
            className="chip chip-ai"
            disabled={!tagSuggestions.canSuggest}
            aria-busy={tagSuggestions.isPending || undefined}
            onClick={handleSuggestTags}
          >
            {tagSuggestions.isPending ? (
              <Loader2 className="size-[14px] animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
            )}
            {tagSuggestions.isPending
              ? t('habits.form.suggestingTags')
              : t('habits.form.suggestTags')}
          </button>
        </div>
        {tagSuggestions.suggestions.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs text-[var(--fg-3)]">
              {t('habits.form.suggestedTagsLabel')}
            </span>
            <div className="flex flex-wrap gap-2">
              {tagSuggestions.suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.name}-${suggestion.id ?? 'new'}`}
                  type="button"
                  className="chip"
                  disabled={tags.atTagLimit}
                  onClick={() => {
                    handleAcceptSuggestion(suggestion)
                    tagSuggestions.dismiss(suggestion)
                  }}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: suggestion.color }}
                    aria-hidden="true"
                  />
                  {suggestion.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {tagSuggestions.noResults && !tagSuggestions.isPending && (
          <p className="text-xs text-[var(--fg-3)]">{t('habits.form.noTagSuggestions')}</p>
        )}
        {tags.editingTagId && (
          <div className="space-y-2">
            <ColorSwatches
              colors={tags.tagColors}
              activeColor={tags.editTagColor}
              onSelect={tags.setEditTagColor}
              ariaLabel={(color) => t('habits.form.selectColor', { color })}
            />
            <TagEditorRow
              value={tags.editTagName}
              disabled={isTagMutationPending}
              inputAriaLabel={t('habits.form.tagName')}
              cancelAriaLabel={t('common.cancel')}
              actionLabel={t('common.save')}
              onChange={tags.setEditTagName}
              onCommit={() => {
                const validationErrorKey = validateTagForm(tags.editTagName, tags.editTagColor)
                if (validationErrorKey) {
                  showError(translate(validationErrorKey))
                  return
                }
                void tags.saveEditTag(async (id, name, color) => {
                  try {
                    await updateTag.mutateAsync({ tagId: id, name, color })
                  } catch (error: unknown) {
                    showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
                    throw error
                  }
                })
              }}
              onCancel={tags.cancelEditTag}
            />
          </div>
        )}
        {tags.showNewTag && (
          <div className="space-y-2">
            <ColorSwatches
              colors={tags.tagColors}
              activeColor={tags.newTagColor}
              onSelect={tags.setNewTagColor}
              ariaLabel={(color) => t('habits.form.selectColor', { color })}
            />
            <TagEditorRow
              value={tags.newTagName}
              placeholder={t('habits.form.tagName')}
              disabled={isTagMutationPending}
              inputAriaLabel={t('habits.form.tagName')}
              cancelAriaLabel={t('common.cancel')}
              actionLabel={t('common.add')}
              onChange={tags.setNewTagName}
              onCommit={() => {
                const validationErrorKey = validateTagForm(tags.newTagName, tags.newTagColor)
                if (validationErrorKey) {
                  showError(translate(validationErrorKey))
                  return
                }
                void tags.createAndSelectTag(async (name, color) => {
                  try {
                    const result = await createTag.mutateAsync({ name, color })
                    return result.id
                  } catch (error: unknown) {
                    showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
                    throw error
                  }
                })
              }}
              onCancel={() => tags.setShowNewTag(false)}
            />
          </div>
        )}
      </div>

      <div className="border-t border-[var(--hairline)] pt-4 mt-2">
        <button
          type="button"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-medium text-[var(--fg-2)] hover:text-[var(--fg-1)] transition-colors w-full py-3"
        >
          <ChevronDown className={`size-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
          {t('habits.form.moreOptions' as Parameters<typeof t>[0])}
          {advancedFieldCount > 0 && (
            <span className="text-xs text-[var(--primary)]">{t('habits.form.moreOptionsCount' as Parameters<typeof t>[0], { count: advancedFieldCount })}</span>
          )}
        </button>
      </div>

      <div className={`collapsible ${showAdvanced ? 'is-open' : ''}`}>
        <div className="space-y-6 pt-2">
          <div className="space-y-2">
            <label htmlFor="habit-form-description" className="form-label">
              {t('habits.form.description')}
            </label>
            <textarea
              id="habit-form-description"
              placeholder={t('habits.form.descriptionPlaceholder')}
              rows={2}
              maxLength={MAX_HABIT_DESCRIPTION_LENGTH}
              className="form-input resize-none"
              {...register('description')}
            />
          </div>

          <div className="space-y-2" role="group" aria-labelledby="habit-form-checklist-label">
            <span id="habit-form-checklist-label" className="form-label">
              {t('habits.form.checklist')}
            </span>
            <HabitChecklist
              items={watchedChecklistItems ?? []}
              editable
              onItemsChange={(items) => setValue('checklistItems', items, { shouldDirty: true })}
            />
            <div className="mt-4">
              <ChecklistTemplates
                items={watchedChecklistItems ?? []}
                onLoad={(items) => setValue('checklistItems', items, { shouldDirty: true })}
              />
            </div>
          </div>

          {watchedDueTime && !isGeneral && (
            <div className="space-y-2">
              <label htmlFor="habit-form-due-end-time" className="form-label">
                {t('habits.form.dueEndTime')}
              </label>
              <AppTimePicker
                id="habit-form-due-end-time"
                placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
                value={watchedDueEndTime}
                ariaLabel={t('habits.form.dueEndTime')}
                onChange={(nextValue) => setValue('dueEndTime', nextValue, { shouldDirty: true })}
                onClear={() => setValue('dueEndTime', '', { shouldDirty: true })}
              />
            </div>
          )}

          {showEndDate && (
            <div className="space-y-1.5">
              {watchedEndDate ? (
                <div className="space-y-2">
                  <span id="habit-form-end-date-label" className="form-label">
                    {t('habits.form.endDate')}
                  </span>
                  <div className="flex items-center gap-2">
                    <AppDatePicker
                      value={watchedEndDate}
                      onChange={(val) =>
                        setValue('endDate', val, { shouldDirty: true })
                      }
                    />
                    <button
                      type="button"
                      aria-label={t('habits.form.removeEndDate')}
                      className="shrink-0 p-2 text-[var(--fg-3)] hover:text-[var(--status-bad)] hover:bg-[var(--status-bad)]/10 transition-colors rounded-full"
                      onClick={() => setValue('endDate', '', { shouldDirty: true })}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--fg-3)]">{t('habits.form.endDateHint')}</p>
                </div>
              ) : (
                <button
                  type="button"
                  className="chip"
                  onClick={() =>
                    setValue('endDate', watchedDueDate || '', {
                      shouldDirty: true,
                    })
                  }
                >
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                  {t('habits.form.addEndDate')}
                </button>
              )}
            </div>
          )}

          {watchedDueTime && !isGeneral && (
            <ReminderSection
              reminderEnabled={watchedReminderEnabled}
              reminderTimes={reminderTimes}
              onReminderTimesChange={onReminderTimesChange}
              onToggleReminder={() => handleReminderEnabledChange(!watchedReminderEnabled)}
              reminderLabel={reminderLabel}
              t={t}
            />
          )}

          {!watchedDueTime && !isGeneral && (
            <ScheduledReminderSection
              reminderEnabled={watchedReminderEnabled}
              scheduledReminders={watchedScheduledReminders}
              onToggleReminder={() => handleReminderEnabledChange(!watchedReminderEnabled)}
              onSetScheduledReminders={(reminders) => setValue('scheduledReminders', reminders, { shouldDirty: true })}
              onValidationError={showError}
              t={t}
            />
          )}

          {hasProAccess && (
            <GoalLinkingField
              selectedGoalIds={selectedGoalIds}
              atGoalLimit={atGoalLimit}
              onToggleGoal={onToggleGoal}
            />
          )}

          {!isGeneral && (
            <div className="space-y-2" role="radiogroup" aria-label={t('habits.form.habitType')}>
              <span className="form-label">{t('habits.form.habitType')}</span>
              <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-[var(--bg-field)] p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!watchedIsBadHabit}
                  onClick={() => setValue('isBadHabit', false, { shouldDirty: true })}
                  className={`inline-flex h-[42px] items-center justify-center gap-2 rounded-[10px] text-[14px] font-medium transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.97] ${
                    watchedIsBadHabit
                      ? 'text-[var(--fg-3)] hover:text-[var(--fg-1)]'
                      : 'bg-[rgba(var(--primary-rgb),0.14)] text-[var(--primary)]'
                  }`}
                >
                  <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
                  {t('habits.form.habitTypeBuild')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={watchedIsBadHabit}
                  onClick={() => setValue('isBadHabit', true, { shouldDirty: true })}
                  className={`inline-flex h-[42px] items-center justify-center gap-2 rounded-[10px] text-[14px] font-medium transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.97] ${
                    watchedIsBadHabit
                      ? 'bg-[rgba(var(--primary-rgb),0.14)] text-[var(--primary)]'
                      : 'text-[var(--fg-3)] hover:text-[var(--fg-1)]'
                  }`}
                >
                  <TrendingDown size={16} strokeWidth={2} aria-hidden="true" />
                  {t('habits.form.habitTypeAvoid')}
                </button>
              </div>
              <p className="text-[13px] text-[var(--fg-3)]">
                {watchedIsBadHabit
                  ? t('habits.form.habitTypeAvoidHint')
                  : t('habits.form.habitTypeBuildHint')}
              </p>
            </div>
          )}

          {watchedIsBadHabit && (
            <SlipAlertSection
              hasProAccess={hasProAccess}
              slipAlertEnabled={watchedSlipAlertEnabled}
              onToggle={() => setValue('slipAlertEnabled', !watchedSlipAlertEnabled, { shouldDirty: true })}
              t={t}
            />
          )}

          {children}
        </div>
      </div>
    </>
  )
}
