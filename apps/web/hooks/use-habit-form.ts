'use client'

import { useMemo, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import type { UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import {
  habitFormSchema,
  type HabitFormData,
  validateEndDate,
  validateEndTime,
  validateTime,
  validateFrequency,
  validateScheduledReminders,
  validateHabitForm,
} from '@orbit/shared/validation'
import type { FrequencyUnit, ChecklistItem, ScheduledReminderTime } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HabitFormOptions {
  /** Initial data for editing an existing habit */
  initialData?: Partial<HabitFormData>
  /** Week start day from profile: 0 = Sunday, 1 = Monday (default) */
  weekStartDay?: number
}

export interface HabitFormHelpers {
  form: UseFormReturn<HabitFormData>

  // Computed flags
  isOneTime: boolean
  isGeneral: boolean
  isFlexible: boolean
  isRecurring: boolean
  showDayPicker: boolean
  showEndDate: boolean

  // Day picker
  daysList: { value: string; label: string }[]
  toggleDay: (day: string) => void

  // Frequency units list
  frequencyUnits: { value: FrequencyUnit; label: string }[]

  // Mode switchers
  setOneTime: () => void
  setRecurring: () => void
  setFlexible: () => void
  setGeneral: () => void

  // Time formatting
  formatTimeInput: (value: string) => string
  formatEndTimeInput: (value: string) => string

  // Cross-field validation (returns i18n key or null)
  validateAll: () => string | null
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHabitForm(options: HabitFormOptions = {}): HabitFormHelpers {
  const { initialData, weekStartDay = 1 } = options
  const t = useTranslations()

  const form = useForm<HabitFormData>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: {
      title: '',
      description: '',
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      dueDate: '',
      dueTime: '',
      dueEndTime: '',
      endDate: '',
      reminderEnabled: false,
      scheduledReminders: [],
      slipAlertEnabled: false,
      checklistItems: [],
      ...initialData,
    },
  })

  const watchedValues = form.watch()

  // -- Computed flags --
  const isGeneral = watchedValues.isGeneral
  const isFlexible = watchedValues.isFlexible
  const frequencyUnit = watchedValues.frequencyUnit
  const frequencyQuantity = watchedValues.frequencyQuantity
  const isOneTime = !frequencyUnit && !isGeneral && !isFlexible
  const isRecurring = !!frequencyUnit && !isGeneral && !isFlexible
  const showDayPicker = !isFlexible && frequencyUnit === 'Day' && frequencyQuantity === 1
  const showEndDate = !!frequencyUnit && !isGeneral

  // -- Day picker list --
  const daysList = useMemo(() => {
    const mondayFirst = [
      { value: 'Monday', label: t('dates.daysShort.monday') },
      { value: 'Tuesday', label: t('dates.daysShort.tuesday') },
      { value: 'Wednesday', label: t('dates.daysShort.wednesday') },
      { value: 'Thursday', label: t('dates.daysShort.thursday') },
      { value: 'Friday', label: t('dates.daysShort.friday') },
      { value: 'Saturday', label: t('dates.daysShort.saturday') },
      { value: 'Sunday', label: t('dates.daysShort.sunday') },
    ]
    // weekStartDay === 0 means Sunday-first
    if (weekStartDay === 0) {
      return [mondayFirst[6]!, ...mondayFirst.slice(0, 6)]
    }
    return mondayFirst
  }, [t, weekStartDay])

  // -- Frequency units list --
  const frequencyUnits = useMemo(
    () =>
      [
        { value: 'Day' as const, label: t('habits.form.unitDay') },
        { value: 'Week' as const, label: t('habits.form.unitWeek') },
        { value: 'Month' as const, label: t('habits.form.unitMonth') },
        { value: 'Year' as const, label: t('habits.form.unitYear') },
      ],
    [t],
  )

  // -- Toggle a day in the days array --
  const toggleDay = useCallback(
    (day: string) => {
      const current = form.getValues('days')
      const idx = current.indexOf(day)
      if (idx >= 0) {
        form.setValue(
          'days',
          current.filter((_, i) => i !== idx),
          { shouldDirty: true },
        )
      } else {
        form.setValue('days', [...current, day], { shouldDirty: true })
      }
    },
    [form],
  )

  // -- Mode switchers --
  const setOneTime = useCallback(() => {
    form.setValue('isGeneral', false)
    form.setValue('isFlexible', false)
    form.setValue('frequencyUnit', null)
    form.setValue('frequencyQuantity', null)
    form.setValue('days', [])
    form.setValue('endDate', '')
  }, [form])

  const setRecurring = useCallback(() => {
    form.setValue('isGeneral', false)
    form.setValue('isFlexible', false)
    if (!form.getValues('frequencyUnit')) {
      form.setValue('frequencyUnit', 'Day')
    }
    const qty = form.getValues('frequencyQuantity')
    if (!qty || qty < 1) {
      form.setValue('frequencyQuantity', 1)
    }
  }, [form])

  const setFlexible = useCallback(() => {
    form.setValue('isGeneral', false)
    form.setValue('isFlexible', true)
    form.setValue('days', [])
    if (!form.getValues('frequencyUnit')) {
      form.setValue('frequencyUnit', 'Week')
    }
    const qty = form.getValues('frequencyQuantity')
    if (!qty || qty < 1) {
      form.setValue('frequencyQuantity', 3)
    }
  }, [form])

  const setGeneral = useCallback(() => {
    form.setValue('isGeneral', true)
    form.setValue('isFlexible', false)
    form.setValue('isBadHabit', false)
    form.setValue('frequencyUnit', null)
    form.setValue('frequencyQuantity', null)
    form.setValue('days', [])
    form.setValue('dueTime', '')
    form.setValue('dueEndTime', '')
    form.setValue('endDate', '')
    form.setValue('reminderEnabled', false)
    form.setValue('scheduledReminders', [])
  }, [form])

  // -- Time formatting helpers --
  const formatTimeInput = useCallback((value: string): string => {
    let v = value.replaceAll(/\D/g, '')
    if (v.length > 4) v = v.slice(0, 4)
    if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2)
    return v
  }, [])

  const formatEndTimeInput = useCallback((value: string): string => {
    let v = value.replaceAll(/\D/g, '')
    if (v.length > 4) v = v.slice(0, 4)
    if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2)
    return v
  }, [])

  // -- Cross-field validation --
  const validateAll = useCallback((): string | null => {
    const data = form.getValues()
    return validateHabitForm(data)
  }, [form])

  return {
    form,
    isOneTime,
    isGeneral,
    isFlexible,
    isRecurring,
    showDayPicker,
    showEndDate,
    daysList,
    toggleDay,
    frequencyUnits,
    setOneTime,
    setRecurring,
    setFlexible,
    setGeneral,
    formatTimeInput,
    formatEndTimeInput,
    validateAll,
  }
}
