import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
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
  HabitModeDrafts,
  readHabitRecurrencePhrase,
  applyHabitFormMode,
  buildHabitDaysList,
  buildHabitFrequencyUnits,
  formatHabitTimeInput,
  getHabitFormFlags,
  toggleHabitDaySelection,
  normalizeHabitFormData,
  translateErrorKey,
  validateHabitFormInput,
} from '@orbit/shared/utils'
import type { HabitDayOption, HabitFormValidationContext } from '@orbit/shared/utils'
import { useBackendFieldErrors } from './use-backend-field-errors'
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
  daysList: HabitDayOption[]
  toggleDay: (day: string, daily?: boolean) => void
  frequencyUnits: { value: FrequencyUnit; label: string }[]
  registerDateValidation: (validate: () => void, onTypeChange?: () => void) => () => void
  resetModeDrafts: () => void
  chooseItemType: (type: 'task' | 'habit') => void
  validationFocusRequest: number
  retiredCadenceTitle?: string
  setOneTime: () => void
  setRecurring: (restoreDraft?: boolean) => void
  setFlexible: () => void
  setGeneral: () => void
  formatTimeInput: (value: string) => string
  formatEndTimeInput: (value: string) => string
  backendFieldErrors: Partial<Record<'title' | 'description', string>>
  backendFocusRequest: number
  backendFocusField: 'title' | 'description' | undefined
  clearBackendErrors: () => void
  reportBackendErrors: (error: unknown) => boolean
  validateAll: (context?: HabitFormValidationContext) => string | null
}

type HabitFormInput = z.input<typeof habitFormSchema>

export function useHabitForm(options: HabitFormOptions = {}): HabitFormHelpers {
  const { initialData, weekStartDay = 1 } = options
  const { t } = useTranslation()

  const dateValidation = useRef<(() => void) | null>(null)
  const dateTypeChange = useRef<(() => void) | undefined>(undefined)
  const registerDateValidation = useCallback((validate: () => void, onTypeChange?: () => void) => {
    dateValidation.current = validate
    dateTypeChange.current = onTypeChange
    return () => { if (dateValidation.current === validate) { dateValidation.current = null; dateTypeChange.current = undefined } }
  }, [])
  const [modeDrafts] = useState(() => new HabitModeDrafts())
  const [retiredCadenceTitle, setRetiredCadenceTitle] = useState<string | undefined>(() => readHabitRecurrencePhrase(initialData?.datePhrase ?? '') ? initialData?.title : undefined)
  const [validationFocusRequest, setValidationFocusRequest] = useState(0)
  const form = useForm<HabitFormInput, unknown, HabitFormData>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: {
      title: '',
      description: '',
      emoji: '',
      frequencyUnit: null,
      frequencyQuantity: null,
      intervalWeeks: 1,
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

  const watchedValues = normalizeHabitFormData(
    useWatch({ control: form.control }) as HabitFormInput,
  )
  const backendErrors = useBackendFieldErrors({ title: watchedValues.title, description: watchedValues.description }, { title: 'Title', description: 'Description' })
  const [backendFocusRequest, setBackendFocusRequest] = useState(0)
  const [backendFocusField, setBackendFocusField] = useState<'title' | 'description' | undefined>()
  useEffect(() => {
    if (backendFocusRequest && backendFocusField === 'title') form.setFocus('title')
  }, [backendFocusRequest, backendFocusField, form])
  function clearBackendErrors() {
    backendErrors.clearBackendErrors()
    setBackendFocusField(undefined)
    setBackendFocusRequest(0)
  }
  function reportBackendErrors(error: unknown): boolean {
    const { field, handled } = backendErrors.reportBackendErrors(error)
    if (field) {
      setBackendFocusField(field)
      setBackendFocusRequest((request) => request + 1)
    }
    return handled
  }
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
          mondayLong: t('dates.daysLong.monday'),
          tuesdayLong: t('dates.daysLong.tuesday'),
          wednesdayLong: t('dates.daysLong.wednesday'),
          thursdayLong: t('dates.daysLong.thursday'),
          fridayLong: t('dates.daysLong.friday'),
          saturdayLong: t('dates.daysLong.saturday'),
          sundayLong: t('dates.daysLong.sunday'),
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
    (day: string, daily = false) => {
      const current = form.getValues('days') ?? []
      form.setValue('days', toggleHabitDaySelection(current, day, daysList.map((option) => option.value), daily), { shouldDirty: true })
    },
    [daysList, form],
  )

  const setOneTime = useCallback(() => {
    const draft = modeDrafts.switch(normalizeHabitFormData(form.getValues()), 'oneTime')
    form.setValue('isGeneral', false)
    form.setValue('isFlexible', false)
    form.setValue('frequencyUnit', null)
    form.setValue('frequencyQuantity', null)
    form.setValue('days', [])
    form.setValue('endDate', '')
    if (draft) for (const [field, value] of Object.entries(draft)) form.setValue(field as keyof HabitFormInput, value, { shouldDirty: true })
  }, [form, modeDrafts])

  const setRecurring = useCallback((restoreDraft = true) => {
    if (!restoreDraft) setRetiredCadenceTitle(form.getValues('title'))
    const draft = modeDrafts.switch(normalizeHabitFormData(form.getValues()), 'recurring')
    form.setValue('isGeneral', false)
    form.setValue('isFlexible', false)
    if (!form.getValues('frequencyUnit')) {
      form.setValue('frequencyUnit', 'Day')
    }
    const quantity = form.getValues('frequencyQuantity')
    if (!quantity || quantity < 1) {
      form.setValue('frequencyQuantity', 1)
    }
    if (restoreDraft && draft) for (const [field, value] of Object.entries(draft)) form.setValue(field as keyof HabitFormInput, value, { shouldDirty: true })
  }, [form, modeDrafts])

  const setFlexible = useCallback(() => {
    const draft = modeDrafts.switch(normalizeHabitFormData(form.getValues()), 'flexible')
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
    if (draft) for (const [field, value] of Object.entries(draft)) form.setValue(field as keyof HabitFormInput, value, { shouldDirty: true })
  }, [form, modeDrafts])

  const setGeneral = useCallback(() => {
    const draft = modeDrafts.switch(normalizeHabitFormData(form.getValues()), 'general')
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
    if (draft) for (const [field, value] of Object.entries(draft)) form.setValue(field as keyof HabitFormInput, value, { shouldDirty: true })
  }, [form, modeDrafts])

  const chooseItemType = useCallback((type: 'task' | 'habit') => {
    const phrase = form.getValues('datePhrase') ?? ''
    const date = form.getValues('dueDate') ?? ''
    if (type === 'task') setOneTime()
    else applyHabitFormMode(modeDrafts.habitMode, { setOneTime, setRecurring, setFlexible, setGeneral })
    if (type === 'habit' && readHabitRecurrencePhrase(phrase)) {
      form.setValue('datePhrase', phrase, { shouldDirty: true })
      form.setValue('dueDate', date, { shouldDirty: true })
    }
    form.setValue('itemType', type, { shouldDirty: true })
    form.clearErrors('itemType')
    dateTypeChange.current?.()
  }, [form, modeDrafts, setOneTime, setRecurring, setFlexible, setGeneral])

  const formatTimeInput = useCallback((value: string) => formatHabitTimeInput(value), [])
  const formatEndTimeInput = useCallback((value: string) => formatHabitTimeInput(value), [])

  const validateAll = useCallback(
    (context?: HabitFormValidationContext) => {
      dateValidation.current?.()
      const values = form.getValues()
      const dateIssue = !values.isGeneral || values.dateIssue === 'errors.api.generalMismatchWithParent' ? values.dateIssue : null
      const key = !values.itemType ? 'habits.form.typeRequired' : dateIssue ? dateIssue : !values.isGeneral && !values.dueDate ? 'habits.form.dateStale' : null
      if (key) {
        form.setError(!values.itemType ? 'itemType' : 'datePhrase', { message: key })
        setValidationFocusRequest((request) => request + 1)
        return t(key)
      }
      return translateErrorKey(t, validateHabitFormInput(values, context))
    },
    [form, t],
  )

  return {
    chooseItemType,
    registerDateValidation,
    resetModeDrafts: () => { modeDrafts.clear(); setRetiredCadenceTitle(undefined) },
    retiredCadenceTitle,
    validationFocusRequest,
    backendFieldErrors: backendErrors.fieldErrors,
    backendFocusField,
    backendFocusRequest,
    reportBackendErrors,
    clearBackendErrors,
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
