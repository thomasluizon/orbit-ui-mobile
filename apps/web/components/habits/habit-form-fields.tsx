'use client'

import { useState, useCallback, useMemo, type ReactNode } from 'react'
import { X, Plus, Bell, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import type { UseFormReturn } from 'react-hook-form'
import type { HabitFormData } from '@orbit/shared/validation'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { tagKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { HabitChecklist } from './habit-checklist'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { AppSelect } from '@/components/ui/app-select'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitFormFieldsProps {
  formHelpers: HabitFormHelpers
  tags: TagSelectionState
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
  children?: ReactNode
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitFormFields({
  formHelpers,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  children,
}: HabitFormFieldsProps) {
  const t = useTranslations()
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
    formatTimeInput,
    formatEndTimeInput,
  } = formHelpers

  const { register, watch, setValue, getValues } = form

  const watchedTitle = watch('title')
  const watchedDescription = watch('description')
  const watchedFrequencyUnit = watch('frequencyUnit')
  const watchedFrequencyQuantity = watch('frequencyQuantity')
  const watchedDays = watch('days')
  const watchedDueDate = watch('dueDate')
  const watchedDueTime = watch('dueTime')
  const watchedDueEndTime = watch('dueEndTime')
  const watchedEndDate = watch('endDate')
  const watchedIsBadHabit = watch('isBadHabit')
  const watchedReminderEnabled = watch('reminderEnabled')
  const watchedSlipAlertEnabled = watch('slipAlertEnabled')
  const watchedChecklistItems = watch('checklistItems')
  const watchedScheduledReminders = watch('scheduledReminders')

  // Fetch tags
  const { data: tagsData } = useQuery({
    queryKey: tagKeys.lists(),
    queryFn: async () => {
      const res = await fetch(API.tags.list)
      if (!res.ok) throw new Error('Failed to fetch tags')
      return res.json() as Promise<Array<{ id: string; name: string; color: string }>>
    },
    staleTime: QUERY_STALE_TIMES.tags,
  })

  const availableTags = tagsData ?? []

  // Time validation
  function isValidTime(time: string): boolean {
    if (time.length !== 5) return true
    const [hStr, mStr] = time.split(':')
    const h = Number.parseInt(hStr!, 10)
    const m = Number.parseInt(mStr!, 10)
    return !Number.isNaN(h) && !Number.isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59
  }

  return (
    <>
      {/* Title */}
      <div className="space-y-1.5">
        <label htmlFor="habit-form-title" className="form-label">
          {t('habits.form.title')}
        </label>
        <input
          id="habit-form-title"
          type="text"
          maxLength={200}
          placeholder={t('habits.form.titlePlaceholder')}
          className="form-input"
          {...register('title')}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="habit-form-description" className="form-label">
          {t('habits.form.description')}
        </label>
        <textarea
          id="habit-form-description"
          placeholder={t('habits.form.descriptionPlaceholder')}
          rows={2}
          className="form-input resize-none"
          {...register('description')}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-1.5">
        <span className="form-label" aria-hidden="true">
          {t('habits.form.checklist')}
        </span>
        <HabitChecklist
          items={watchedChecklistItems ?? []}
          editable
          onItemsChange={(items) => setValue('checklistItems', items, { shouldDirty: true })}
        />
        <ChecklistTemplates
          items={watchedChecklistItems ?? []}
          onLoad={(items) => setValue('checklistItems', items, { shouldDirty: true })}
        />
      </div>

      {/* Frequency toggle */}
      <div className="space-y-1.5">
        <span className="form-label" aria-hidden="true">
          {t('habits.form.frequency')}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isOneTime
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
            onClick={setOneTime}
          >
            {t('habits.form.oneTimeTask')}
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              !isOneTime && !isGeneral && !isFlexible
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
            onClick={setRecurring}
          >
            {t('habits.form.recurring')}
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isFlexible
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
            onClick={setFlexible}
          >
            {t('habits.form.flexible')}
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isGeneral
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
            onClick={setGeneral}
          >
            {t('habits.form.general')}
          </button>
        </div>
      </div>

      {/* Flexible description */}
      {isFlexible && (
        <p className="text-xs text-text-muted -mt-1">
          {t('habits.form.flexibleDescription', {
            n: watchedFrequencyQuantity ?? 3,
            unit: watchedFrequencyUnit
              ? t(`habits.form.unit${watchedFrequencyUnit}` as any)
              : '',
          })}
        </p>
      )}

      {/* Frequency picker */}
      {!isOneTime && !isGeneral && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
            <span className="form-label" aria-hidden="true">
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

      {/* Day picker */}
      {showDayPicker && !isGeneral && (
        <div className="space-y-1.5">
          <span className="form-label" aria-hidden="true">
            {t('habits.form.activeDays')}
          </span>
          <div className="flex flex-wrap gap-2">
            {daysList.map((day) => (
              <button
                key={day.value}
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  watchedDays?.includes(day.value)
                    ? 'bg-primary text-white'
                    : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => toggleDay(day.value)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Due date */}
      {!isGeneral && (
        <div className="space-y-1.5">
          <span className="form-label" aria-hidden="true">
            {t('habits.form.dueDate')}
          </span>
          <AppDatePicker
            value={watchedDueDate}
            onChange={(val) => setValue('dueDate', val, { shouldDirty: true })}
          />
        </div>
      )}

      {/* Due time */}
      {!isGeneral && (
        <div className="space-y-1.5">
          <label htmlFor="habit-form-due-time" className="form-label">
            {t('habits.form.dueTime')}
          </label>
          <input
            id="habit-form-due-time"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{2}:[0-9]{2}"
            placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
            maxLength={5}
            className="form-input"
            value={watchedDueTime}
            onChange={(e) => {
              const formatted = formatTimeInput(e.target.value)
              setValue('dueTime', formatted, { shouldDirty: true })
            }}
          />
          {watchedDueTime.length === 5 && !isValidTime(watchedDueTime) && (
            <p className="text-xs text-red-400 font-medium">
              {t('habits.form.invalidTime')}
            </p>
          )}
        </div>
      )}

      {/* End time */}
      {watchedDueTime && !isGeneral && (
        <div className="space-y-1.5">
          <label htmlFor="habit-form-due-end-time" className="form-label">
            {t('habits.form.dueEndTime')}
          </label>
          <input
            id="habit-form-due-end-time"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{2}:[0-9]{2}"
            placeholder={t('habits.form.scheduledReminderTimePlaceholder')}
            maxLength={5}
            className="form-input"
            value={watchedDueEndTime}
            onChange={(e) => {
              const formatted = formatEndTimeInput(e.target.value)
              setValue('dueEndTime', formatted, { shouldDirty: true })
            }}
          />
          {watchedDueEndTime.length === 5 &&
            !isValidTime(watchedDueEndTime) && (
              <p className="text-xs text-red-400 font-medium">
                {t('habits.form.invalidEndTime')}
              </p>
            )}
          {watchedDueEndTime &&
            watchedDueTime &&
            watchedDueEndTime <= watchedDueTime && (
              <p className="text-xs text-red-400 font-medium">
                {t('habits.form.endTimeBeforeStartTime')}
              </p>
            )}
        </div>
      )}

      {/* End date (recurring only) */}
      {showEndDate && (
        <div className="space-y-1.5">
          {watchedEndDate ? (
            <div className="space-y-1.5">
              <span className="form-label" aria-hidden="true">
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
                  className="shrink-0 p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors rounded-full"
                  onClick={() => setValue('endDate', '', { shouldDirty: true })}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              onClick={() =>
                setValue('endDate', watchedDueDate || '', {
                  shouldDirty: true,
                })
              }
            >
              <Plus className="size-3.5" />
              {t('habits.form.addEndDate')}
            </button>
          )}
        </div>
      )}

      {/* Reminder toggle */}
      {!isGeneral && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="form-label">
              <Bell className="size-3.5 inline mr-1" />
              {t('habits.form.reminder')}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={watchedReminderEnabled}
                onChange={(e) =>
                  setValue('reminderEnabled', e.target.checked, {
                    shouldDirty: true,
                  })
                }
              />
              <div className="w-9 h-5 bg-surface-elevated peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>
        </div>
      )}

      {/* Bad habit toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="form-label">
            <AlertTriangle className="size-3.5 inline mr-1" />
            {t('habits.form.badHabitLabel')}
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={watchedIsBadHabit}
              onChange={(e) =>
                setValue('isBadHabit', e.target.checked, {
                  shouldDirty: true,
                })
              }
            />
            <div className="w-9 h-5 bg-surface-elevated peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500" />
          </label>
        </div>
      </div>

      {/* Slip alert (bad habits only) */}
      {watchedIsBadHabit && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="form-label">{t('habits.form.slipAlert')}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={watchedSlipAlertEnabled}
                onChange={(e) =>
                  setValue('slipAlertEnabled', e.target.checked, {
                    shouldDirty: true,
                  })
                }
              />
              <div className="w-9 h-5 bg-surface-elevated peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="space-y-2">
        <span className="form-label" aria-hidden="true">
          {t('habits.form.tags')}
        </span>
        {availableTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  tags.selectedTagIds.includes(tag.id)
                    ? 'text-white'
                    : 'bg-surface border border-border-muted text-text-secondary hover:text-text-primary'
                } ${
                  !tags.selectedTagIds.includes(tag.id) && tags.atTagLimit
                    ? 'opacity-30 pointer-events-none'
                    : ''
                }`}
                style={
                  tags.selectedTagIds.includes(tag.id)
                    ? { backgroundColor: tag.color }
                    : undefined
                }
                onClick={() => tags.toggleTag(tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
        {/* New tag form */}
        {!tags.showNewTag ? (
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            onClick={() => tags.setShowNewTag(true)}
          >
            <Plus className="size-3.5" />
            {t('habits.form.newTag')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={tags.newTagName}
              type="text"
              placeholder={t('habits.form.tagName')}
              className="flex-1 min-w-0 bg-surface text-text-primary placeholder-text-muted rounded-xl py-2 px-3 text-xs border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              onChange={(e) => tags.setNewTagName(e.target.value)}
            />
            <div className="flex gap-1">
              {tags.tagColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`size-5 rounded-full transition-all ${
                    tags.newTagColor === color
                      ? 'ring-2 ring-offset-2 ring-offset-background'
                      : ''
                  }`}
                  style={{
                    backgroundColor: color,
                    ...(tags.newTagColor === color
                      ? { boxShadow: `0 0 0 2px ${color}` }
                      : {}),
                  }}
                  onClick={() => tags.setNewTagColor(color)}
                />
              ))}
            </div>
            <button
              type="button"
              className="shrink-0 p-2 text-text-muted hover:text-text-primary transition-all duration-150"
              onClick={() => tags.setShowNewTag(false)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Goals */}
      <GoalLinkingField
        selectedGoalIds={selectedGoalIds}
        atGoalLimit={atGoalLimit}
        onToggleGoal={onToggleGoal}
      />

      {/* Slot for extra fields (e.g. sub-habits) */}
      {children}
    </>
  )
}
