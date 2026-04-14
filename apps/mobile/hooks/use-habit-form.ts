import { useMemo, useCallback } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import {
  habitFormSchema,
  type HabitFormData,
} from '@orbit/shared/validation'
import {
  buildHabitDaysList,
  buildHabitFrequencyUnits,
  formatHabitTimeInput,
  getHabitFormFlags,
  normalizeHabitFormData,
  translateErrorKey,
  validateHabitFormInput,
  toggleSelectedId,
} from '@orbit/shared/utils'
import type { HabitFormValidationContext } from '@orbit/shared/utils'
import type { FrequencyUnit } from '@orbit/shared/types/habit'

export interface HabitFormOptions {
  initialData?: Partial<HabitFormInput>
  weekStartDay?: number
}

export interface HabitFormHelpers {
  form: UseFormReturn<HabitFormInput, unknown, HabitFormData>
  isOneTime: boolean
  isGeneral: boolean
  isFlexible: boolean
  isRecurring: boolean
  showDayPicker: boolean
  showEndDate: boolean
  daysList: { value: string; label: string }[]
  toggleDay: (day: string) => void
  frequencyUnits: { value: FrequencyUnit; label: string }[]
  setOneTime: () => void
  setRecurring: () => void
  setFlexible: () => void
  setGeneral: () => void
  formatTimeInput: (value: string) => string
  formatEndTimeInput: (value: string) => string
  validateAll: (context?: HabitFormValidationContext) => string | null
}

type HabitFormInput = z.input<typeof habitFormSchema>

export function useHabitForm(options: HabitFormOptions = {}): HabitFormHelpers {
  const { initialData, weekStartDay = 1 } = options
  const { t } = useTranslation()

  const form = useForm<HabitFormInput, unknown, HabitFormData>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: {
      title: '',
      description: '',
      icon: null,
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

  const watchedFrequencyUnit = useWatch({ control: form.control, name: 'frequencyUnit' })
  const watchedFrequencyQuantity = useWatch({
    control: form.control,
    name: 'frequencyQuantity',
  })
  const watchedDays = useWatch({ control: form.control, name: 'days' })
  const watchedIsGeneral = useWatch({ control: form.control, name: 'isGeneral' })
  const watchedIsFlexible = useWatch({ control: form.control, name: 'isFlexible' })
  const watchedDueTime = useWatch({ control: form.control, name: 'dueTime' })
  const watchedEndDate = useWatch({ control: form.control, name: 'endDate' })

  const watchedValues = normalizeHabitFormData({
    frequencyUnit: watchedFrequencyUnit,
    frequencyQuantity: watchedFrequencyQuantity,
    days: watchedDays,
    isGeneral: watchedIsGeneral,
    isFlexible: watchedIsFlexible,
    dueTime: watchedDueTime,
    endDate: watchedEndDate,
  })
  const { isOneTime, isGeneral, isFlexible, isRecurring, showDayPicker, showEndDate } =
    getHabitFormFlags(watchedValues)

  const daysList = useMemo(
    () =>
      buildHabitDaysList(
        {
          monday: t('dates.daysShort.monday'),
          tuesday: t('dates.daysShort.tuesday'),
          wednesday: t('dates.daysShort.wednesday'),
          thursday: t('dates.daysShort.thursday'),
          friday: t('dates.daysShort.friday'),
          saturday: t('dates.daysShort.saturday'),
          sunday: t('dates.daysShort.sunday'),
          unitDay: t('habits.form.unitDay'),
          unitWeek: t('habits.form.unitWeek'),
          unitMonth: t('habits.form.unitMonth'),
          unitYear: t('habits.form.unitYear'),
        },
        weekStartDay,
      ),
    [t, weekStartDay],
  )

  const frequencyUnits = useMemo(
    () =>
      buildHabitFrequencyUnits({
        unitDay: t('habits.form.unitDay'),
        unitWeek: t('habits.form.unitWeek'),
        unitMonth: t('habits.form.unitMonth'),
        unitYear: t('habits.form.unitYear'),
      }),
    [t],
  )

  const toggleDay = useCallback(
    (day: string) => {
      const current = form.getValues('days') ?? []
      form.setValue('days', toggleSelectedId(current, day), { shouldDirty: true })
    },
    [form],
  )

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
    const quantity = form.getValues('frequencyQuantity')
    if (!quantity || quantity < 1) {
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
    const quantity = form.getValues('frequencyQuantity')
    if (!quantity || quantity < 1) {
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

  const formatTimeInput = useCallback((value: string) => formatHabitTimeInput(value), [])
  const formatEndTimeInput = useCallback((value: string) => formatHabitTimeInput(value), [])

  const validateAll = useCallback(
    (context?: HabitFormValidationContext) =>
      translateErrorKey(t, validateHabitFormInput(form.getValues(), context)),
    [form, t],
  )

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
