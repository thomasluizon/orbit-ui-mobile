import { describe, expect, it, vi } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import {
  EMPTY_HABIT_FORM_PROPOSAL,
  HABIT_REMINDER_PRESETS,
  applyHabitDayCorrection,
  applyHabitPhraseRead,
  applyHabitQuantityCorrection,
  buildHabitAstraFallbackCopy,
  buildHabitDaysList,
  buildHabitFrequencyUnits,
  buildHabitUnderstandingLabels,
  buildHabitUnderstandingSentence,
  clearHabitFormProposalSection,
  createHabitFormController,
  createHabitFormSuggestionRevision,
  formatHabitReminderLabel,
  formatHabitTimeInput,
  getHabitFormFlags,
  habitFeaturePlan,
  hasHabitFormProposal,
  isHabitAstraLimitReached,
  isValidHabitTimeInput,
  normalizeHabitFormData,
  releaseHabitPhraseOwnership,
  requestHabitFormProposal,
  resolveHabitStartDate,
  shouldShowHabitAstraFallback,
  validateHabitFormInput,
} from '../utils/habit-form-helpers'
import {
  filterHabitEmojiCategories,
  HABIT_EMOJI_CATEGORIES,
  HABIT_EMOJI_OPTIONS,
} from '../utils/habit-emoji-options'

describe('habit form helpers', () => {
  it('normalizes missing habit form values', () => {
    expect(normalizeHabitFormData({ title: 'Exercise' })).toMatchObject({
      title: 'Exercise',
      description: '',
      emoji: '',
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      dueDate: '',
      dueTime: '',
      dueEndTime: '',
      endDate: '',
      reminderEnabled: false,
      scheduledReminders: [],
      slipAlertEnabled: false,
      checklistItems: [],
    })
  })

  it('filters habit emoji categories by habit-focused keywords', () => {
    const results = filterHabitEmojiCategories('run')
    const emojis = results.flatMap((category) => category.emojis)

    expect(HABIT_EMOJI_OPTIONS.length).toBeGreaterThan(100)
    expect(emojis).toContain('🏃')
    expect(emojis).toContain('🏃‍♀️')
  })

  it('filters habit emojis by Portuguese names without accents', () => {
    const runResults = filterHabitEmojiCategories('corrida')
    const dogResults = filterHabitEmojiCategories('cão')

    expect(runResults.flatMap((category) => category.emojis)).toContain('🏃')
    expect(dogResults.flatMap((category) => category.emojis)).toContain('🐶')
  })

  it('keeps animal emojis out of the nature category', () => {
    const natureCategory = HABIT_EMOJI_CATEGORIES.find((category) => category.id === 'nature')
    const animalsCategory = HABIT_EMOJI_CATEGORIES.find((category) => category.id === 'animals')

    expect(natureCategory?.emojis).not.toContain('🐶')
    expect(animalsCategory?.emojis).toContain('🐶')
  })

  it('derives display flags for one-time, recurring, and general habits', () => {
    expect(
      getHabitFormFlags(
        normalizeHabitFormData({
          title: 'One-time',
        }),
      ),
    ).toMatchObject({
      isOneTime: true,
      isRecurring: false,
      showDayPicker: false,
      showEndDate: false,
    })

    expect(
      getHabitFormFlags(
        normalizeHabitFormData({
          title: 'Recurring',
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
        }),
      ),
    ).toMatchObject({
      isOneTime: false,
      isRecurring: true,
      showDayPicker: true,
      showEndDate: true,
    })

    expect(
      getHabitFormFlags(
        normalizeHabitFormData({
          title: 'General',
          isGeneral: true,
          frequencyUnit: 'Week',
        }),
      ),
    ).toMatchObject({
      isGeneral: true,
      isRecurring: false,
      showEndDate: false,
    })
  })

  it('builds localized day lists and frequency units', () => {
    const translations = {
      monday: 'Mon',
      tuesday: 'Tue',
      wednesday: 'Wed',
      thursday: 'Thu',
      friday: 'Fri',
      saturday: 'Sat',
      sunday: 'Sun',
      mondayLong: 'Monday',
      tuesdayLong: 'Tuesday',
      wednesdayLong: 'Wednesday',
      thursdayLong: 'Thursday',
      fridayLong: 'Friday',
      saturdayLong: 'Saturday',
      sundayLong: 'Sunday',
      unitDay: 'Day',
      unitWeek: 'Week',
      unitMonth: 'Month',
      unitYear: 'Year',
    }

    expect(buildHabitDaysList(translations).map((day) => day.value)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
    expect(buildHabitDaysList(translations)[0]).toEqual({
      value: 'Monday',
      label: 'Mon',
      accessibleLabel: 'Monday',
    })
    expect(buildHabitDaysList({
      ...translations,
      monday: 'Seg',
      mondayLong: 'Segunda-feira',
    })[0]).toEqual({
      value: 'Monday',
      label: 'Seg',
      accessibleLabel: 'Segunda-feira',
    })
    expect(buildHabitDaysList(translations, 0).map((day) => day.value)).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ])
    expect(buildHabitFrequencyUnits(translations)).toEqual([
      { value: 'Day', label: 'Day' },
      { value: 'Week', label: 'Week' },
      { value: 'Month', label: 'Month' },
      { value: 'Year', label: 'Year' },
    ])
  })

  it('formats time input into hh:mm', () => {
    expect(formatHabitTimeInput('1234')).toBe('12:34')
    expect(formatHabitTimeInput('12a3b4')).toBe('12:34')
    expect(formatHabitTimeInput('12345')).toBe('12:34')
  })

  it('validates time input only when it is complete', () => {
    expect(isValidHabitTimeInput('')).toBe(true)
    expect(isValidHabitTimeInput('09:30')).toBe(true)
    expect(isValidHabitTimeInput('25:00')).toBe(false)
    expect(isValidHabitTimeInput('9:30')).toBe(false)
  })

  it('exports the expected reminder presets', () => {
    expect(HABIT_REMINDER_PRESETS[0]).toEqual({
      value: 0,
      key: 'habits.form.reminderAtTime',
    })
    expect(HABIT_REMINDER_PRESETS.at(-1)).toEqual({
      value: 1440,
      key: 'habits.form.reminder1day',
    })
  })

  it('applies a time-only phrase as a one-time schedule', () => {
    const calls: string[] = []
    const fields: Record<string, string | number | string[]> = {}

    const ownership = applyHabitPhraseRead(true, {
      cadence: null,
      days: [],
      frequencyQuantity: null,
      intervalWeeks: null,
      dueTime: '15:00',
      emoji: null,
      consumed: [],
    }, '', false, { cadence: false, dueTime: false }, {
      setOneTime: () => calls.push('one-time'),
      setRecurring: () => calls.push('recurring'),
      setFlexible: () => calls.push('flexible'),
      setGeneral: () => calls.push('general'),
      setField: (field, value) => { fields[field] = value },
    })

    expect(calls).toEqual([])
    expect(fields).toEqual({ dueTime: '15:00' })
    expect(ownership).toEqual({ cadence: false, dueTime: true })
  })

  it('preserves a locked General schedule during phrase application', () => {
    const calls: string[] = []
    const fields: Record<string, string | number | string[]> = {}

    const ownership = applyHabitPhraseRead(true, {
      cadence: 'fixed',
      days: ['Monday'],
      frequencyQuantity: null,
      intervalWeeks: null,
      dueTime: '08:00',
      emoji: '🏃',
      consumed: [],
    }, '', true, { cadence: false, dueTime: false }, {
      setOneTime: () => calls.push('one-time'),
      setRecurring: () => calls.push('recurring'),
      setFlexible: () => calls.push('flexible'),
      setGeneral: () => calls.push('general'),
      setField: (field, value) => { fields[field] = value },
    })

    expect(calls).toEqual(['general'])
    expect(fields).toEqual({})
    expect(ownership).toEqual({ cadence: true, dueTime: true })
  })

  it('builds truthful daily, fixed-day, flexible, and time-only summaries', () => {
    const translate = (key: string, values?: Record<string, string | number>) =>
      `${key}:${JSON.stringify(values ?? {})}`
    const days = [{ value: 'Monday', label: 'Monday' }]

    expect(buildHabitUnderstandingSentence([], days, false, 'Day', 1, '', 'en', translate))
      .toBe('habits.form.understoodDaily:{}')
    expect(buildHabitUnderstandingSentence(['Monday'], days, false, 'Day', 1, '08:00', 'en', translate))
      .toBe('habits.form.understoodDayAt:{"days":"Monday","time":"08:00"}')
    expect(buildHabitUnderstandingSentence([], days, true, 'Week', 3, '09:00', 'en', translate))
      .toBe('habits.form.understoodCountAt:{"count":3,"time":"09:00"}')
    expect(buildHabitUnderstandingSentence([], days, false, null, 3, '15:00', 'en', translate))
      .toBe('habits.form.understoodTime:{"time":"15:00"}')
  })

  it('formats singular and multi-day pt-BR schedules naturally', () => {
    const translations: Record<string, string> = {
      'habits.form.understoodDay': 'Toda {days}',
      'habits.form.understoodDayAt': 'Toda {days} às {time}',
      'habits.form.understoodDays': '{days}',
      'habits.form.understoodDaysAt': '{days} às {time}',
    }
    const translate = (key: string, values?: Record<string, string | number>) =>
      Object.entries(values ?? {}).reduce(
        (message, [name, value]) => message.replace(`{${name}}`, String(value)),
        translations[key] ?? key,
      )
    const days = [
      { value: 'Monday', label: 'Seg' },
      { value: 'Wednesday', label: 'Qua' },
      { value: 'Friday', label: 'Sex' },
    ]

    expect(buildHabitUnderstandingSentence(['Monday'], days, false, 'Day', 1, '', 'pt-BR', translate))
      .toBe('Toda Seg')
    expect(buildHabitUnderstandingSentence(['Monday'], days, false, 'Day', 1, '08:00', 'pt-BR', translate))
      .toBe('Toda Seg às 08:00')
    expect(buildHabitUnderstandingSentence(['Monday', 'Wednesday', 'Friday'], days, false, 'Day', 1, '', 'pt-BR', translate))
      .toBe('Seg, Qua e Sex')
    expect(buildHabitUnderstandingSentence(['Monday', 'Wednesday', 'Friday'], days, false, 'Day', 1, '08:00', 'pt-BR', translate))
      .toBe('Seg, Qua e Sex às 08:00')
  })

  it.each([
    {
      locale: 'en',
      messages: en.habits.form,
      month: 'Every month',
      monthAt: 'Every month at 08:00',
      year: 'Every year',
      yearAt: 'Every year at 08:00',
      pluralMonth: 'Every 2 months',
      pluralMonthAt: 'Every 2 months at 08:00',
      pluralYear: 'Every 2 years',
      pluralYearAt: 'Every 2 years at 08:00',
    },
    {
      locale: 'pt-BR',
      messages: ptBR.habits.form,
      month: 'Todo mês',
      monthAt: 'Todo mês às 08:00',
      year: 'Todo ano',
      yearAt: 'Todo ano às 08:00',
      pluralMonth: 'A cada 2 meses',
      pluralMonthAt: 'A cada 2 meses às 08:00',
      pluralYear: 'A cada 2 anos',
      pluralYearAt: 'A cada 2 anos às 08:00',
    },
  ])('formats recurring Month and Year intervals in $locale', ({
    locale,
    messages,
    month,
    monthAt,
    year,
    yearAt,
    pluralMonth,
    pluralMonthAt,
    pluralYear,
    pluralYearAt,
  }) => {
    const translate = (key: string, values?: Record<string, string | number>) => {
      const message = messages[key.replace('habits.form.', '') as keyof typeof messages]
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{${name}}`, String(value)),
        message,
      )
    }

    expect(buildHabitUnderstandingSentence([], [], false, 'Month', 1, '', locale, translate))
      .toBe(month)
    expect(buildHabitUnderstandingSentence([], [], false, 'Month', 1, '08:00', locale, translate))
      .toBe(monthAt)
    expect(buildHabitUnderstandingSentence([], [], false, 'Year', 1, '', locale, translate))
      .toBe(year)
    expect(buildHabitUnderstandingSentence([], [], false, 'Year', 1, '08:00', locale, translate))
      .toBe(yearAt)
    expect(buildHabitUnderstandingSentence([], [], false, 'Month', 2, '', locale, translate))
      .toBe(pluralMonth)
    expect(buildHabitUnderstandingSentence([], [], false, 'Month', 2, '08:00', locale, translate))
      .toBe(pluralMonthAt)
    expect(buildHabitUnderstandingSentence([], [], false, 'Year', 2, '', locale, translate))
      .toBe(pluralYear)
    expect(buildHabitUnderstandingSentence([], [], false, 'Year', 2, '08:00', locale, translate))
      .toBe(pluralYearAt)
  })

  it.each([
    {
      locale: 'en',
      messages: en.habits.form,
      month: 'Once a month',
      monthAt: 'Once a month at 08:00',
      pluralMonth: '2 times a month',
      year: 'Once a year',
      yearAt: 'Once a year at 08:00',
      pluralYear: '2 times a year',
    },
    {
      locale: 'pt-BR',
      messages: ptBR.habits.form,
      month: 'Uma vez por mês',
      monthAt: 'Uma vez por mês às 08:00',
      pluralMonth: '2 vezes por mês',
      year: 'Uma vez por ano',
      yearAt: 'Uma vez por ano às 08:00',
      pluralYear: '2 vezes por ano',
    },
  ])('formats flexible Month and Year targets in $locale', ({
    locale,
    messages,
    month,
    monthAt,
    pluralMonth,
    year,
    yearAt,
    pluralYear,
  }) => {
    const translate = (key: string, values?: Record<string, string | number>) => {
      const message = messages[key.replace('habits.form.', '') as keyof typeof messages]
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{${name}}`, String(value)),
        message,
      )
    }

    expect(buildHabitUnderstandingSentence([], [], true, 'Month', 1, '', locale, translate)).toBe(month)
    expect(buildHabitUnderstandingSentence([], [], true, 'Month', 1, '08:00', locale, translate)).toBe(monthAt)
    expect(buildHabitUnderstandingSentence([], [], true, 'Month', 2, '', locale, translate)).toBe(pluralMonth)
    expect(buildHabitUnderstandingSentence([], [], true, 'Year', 1, '', locale, translate)).toBe(year)
    expect(buildHabitUnderstandingSentence([], [], true, 'Year', 1, '08:00', locale, translate)).toBe(yearAt)
    expect(buildHabitUnderstandingSentence([], [], true, 'Year', 2, '', locale, translate)).toBe(pluralYear)
  })

  it('tracks proposal visibility, Astra limits, start dates, and reminder labels', () => {
    const proposal = { ...EMPTY_HABIT_FORM_PROPOSAL, checklist: true }
    const translate = (key: string) => key

    expect(hasHabitFormProposal(EMPTY_HABIT_FORM_PROPOSAL)).toBe(false)
    expect(hasHabitFormProposal(proposal)).toBe(true)
    expect(shouldShowHabitAstraFallback('Read', null, () => true, EMPTY_HABIT_FORM_PROPOSAL)).toBe(true)
    expect(shouldShowHabitAstraFallback('Read', null, () => true, proposal)).toBe(false)
    expect(isHabitAstraLimitReached(4, 5)).toBe(false)
    expect(isHabitAstraLimitReached(5, 5)).toBe(true)
    expect(resolveHabitStartDate(undefined, '2026-09-02')).toBe('2026-09-02')
    expect(resolveHabitStartDate(null, '2026-09-02')).toBeNull()
    expect(formatHabitReminderLabel(0, translate)).toBe('habits.form.reminderAtTime')
    expect(formatHabitReminderLabel(31, translate)).toBe('31 habits.form.reminderMinutes')
    expect(formatHabitReminderLabel(61, translate)).toBe('1 habits.form.reminderHour')
    expect(formatHabitReminderLabel(2880, translate)).toBe('2 habits.form.reminderDays')
  })

  it('centralizes proposal state and fallback copy', async () => {
    const proposal = { setup: true, checklist: true, subHabits: false, checklistItems: 2, subHabitItems: 0 }
    const translate = (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${JSON.stringify(values)}` : key
    const action = vi.fn(async () => proposal)

    expect(clearHabitFormProposalSection(proposal, 'setup')).toEqual({
      setup: false,
      checklist: true,
      subHabits: false,
      checklistItems: 2,
      subHabitItems: 0,
    })
    expect(clearHabitFormProposalSection(proposal, 'subHabits')).toBe(proposal)
    await expect(requestHabitFormProposal(action, false)).resolves.toBe(proposal)
    await expect(requestHabitFormProposal(action, true)).resolves.toBe(EMPTY_HABIT_FORM_PROPOSAL)
    await expect(requestHabitFormProposal(undefined, false)).resolves.toBe(EMPTY_HABIT_FORM_PROPOSAL)
    expect(action).toHaveBeenCalledOnce()
    expect(habitFeaturePlan(true)).toBe('pro')
    expect(habitFeaturePlan(false)).toBe('free')
    expect(buildHabitUnderstandingLabels(translate)).toMatchObject({
      field: 'habits.form.describe',
      proposed: 'habits.form.proposedByAstra',
    })
    expect(buildHabitAstraFallbackCopy(translate, 5)).toEqual({
      unresolved: 'habits.form.unresolved',
      limitMessage: 'habits.form.localReadLimit:{"allowance":5}',
      readingLabel: 'habits.form.astraReading',
      askLabel: 'habits.form.askAstra',
      costLabel: 'habits.form.askAstraCost:{"allowance":5}',
    })
  })

  it('centralizes day and quantity corrections', () => {
    const calls: string[] = []
    const fields: Record<string, unknown> = {}
    const target = {
      setRecurring: () => calls.push('recurring'),
      setFlexible: () => calls.push('flexible'),
      setGeneral: () => calls.push('general'),
      setField: (field: string, value: unknown) => { fields[field] = value },
    }

    expect(applyHabitDayCorrection(false, target)).toBe(true)
    expect(fields).toEqual({ frequencyUnit: 'Day', frequencyQuantity: 1 })
    expect(applyHabitQuantityCorrection(4, false, target)).toBe(true)
    expect(fields).toEqual({ frequencyUnit: 'Week', frequencyQuantity: 4 })
    expect(applyHabitDayCorrection(true, target)).toBe(false)
    expect(applyHabitQuantityCorrection(2, true, target)).toBe(false)
    expect(calls).toEqual(['recurring', 'flexible', 'general', 'general'])
  })

  it('releases only parser-owned fields', () => {
    const ownership = { cadence: true, dueTime: false }
    expect(releaseHabitPhraseOwnership(ownership, 'cadence')).toEqual({ cadence: false, dueTime: false })
    expect(releaseHabitPhraseOwnership(ownership, 'dueTime')).toBe(ownership)
  })

  it('keeps suggestion revisions monotonic and leaves obsolete proposal state untouched', async () => {
    const revision = createHabitFormSuggestionRevision()
    const requestRevision = revision.advance()
    expect(revision.isCurrent(requestRevision)).toBe(true)
    expect(revision.advance()).toBe(requestRevision + 1)
    expect(revision.isCurrent(requestRevision)).toBe(false)

    const updateProposal = vi.fn()
    const setOwnership = vi.fn()
    const controller = createHabitFormController({
      action: async () => null,
      atLimit: false,
      lockedGeneral: false,
      target: {
        getOwnership: () => ({ cadence: true, dueTime: true }),
        setOwnership,
        updateProposal,
        setOneTime: vi.fn(),
        setRecurring: vi.fn(),
        setFlexible: vi.fn(),
        setGeneral: vi.fn(),
        setField: vi.fn(),
        toggleDay: vi.fn(),
      },
    })

    await controller.askAstra()

    expect(setOwnership).not.toHaveBeenCalled()
    expect(updateProposal).not.toHaveBeenCalled()
  })

  it('coordinates form corrections and proposal ownership', async () => {
    const proposed = { setup: true, checklist: true, subHabits: true, checklistItems: 2, subHabitItems: 1 }
    let proposal = EMPTY_HABIT_FORM_PROPOSAL
    let ownership = { cadence: true, dueTime: true }
    const fields = new Map<string, { value: unknown; validate?: boolean }>()
    const setRecurring = vi.fn()
    const setFlexible = vi.fn()
    const setGeneral = vi.fn()
    const toggleDay = vi.fn()
    const controller = createHabitFormController({
      action: async () => proposed,
      atLimit: false,
      lockedGeneral: false,
      target: {
        getOwnership: () => ownership,
        setOwnership: (next) => { ownership = next },
        updateProposal: (update) => { proposal = update(proposal) },
        setOneTime: vi.fn(),
        setRecurring,
        setFlexible,
        setGeneral,
        setField: (field, value, validate) => fields.set(field, { value, validate }),
        toggleDay,
      },
    })

    await controller.askAstra()
    expect(proposal).toBe(proposed)
    expect(ownership).toEqual({ cadence: false, dueTime: false })

    ownership = { cadence: true, dueTime: true }
    controller.releaseDueTime()
    expect(ownership).toEqual({ cadence: true, dueTime: false })
    controller.readPhrase(true, {
      cadence: null,
      days: [],
      frequencyQuantity: null,
      intervalWeeks: null,
      dueTime: '15:00',
      emoji: null,
      consumed: [],
    }, '')
    expect(fields.get('dueTime')?.value).toBe('15:00')
    controller.setDueTime('16:00')
    expect(fields.get('dueTime')?.value).toBe('16:00')
    expect(fields.get('dueEndTime')?.value).toBe('')
    controller.clearDueTime()
    expect(fields.get('dueTime')?.value).toBe('')
    controller.toggleDay('Monday')
    expect(ownership.cadence).toBe(false)
    expect(setRecurring).toHaveBeenCalledOnce()
    expect(toggleDay).toHaveBeenCalledWith('Monday')
    expect(fields.get('frequencyUnit')?.value).toBe('Day')

    proposal = proposed
    controller.setQuantity(4)
    expect(setFlexible).toHaveBeenCalledOnce()
    expect(fields.get('frequencyUnit')?.value).toBe('Week')
    expect(fields.get('frequencyQuantity')?.value).toBe(4)
    expect(proposal.setup).toBe(false)

    proposal = proposed
    controller.setEmoji('🌱')
    expect(fields.get('emoji')?.value).toBe('🌱')
    expect(proposal).toEqual({
      setup: false,
      checklist: true,
      subHabits: true,
      checklistItems: 2,
      subHabitItems: 1,
    })
    controller.resolveChecklistProposal()
    controller.resolveSubHabitProposal()
    expect(proposal).toEqual(EMPTY_HABIT_FORM_PROPOSAL)
    proposal = proposed
    controller.setChecklistItems([{ text: 'Warm up', isChecked: false }])
    expect(fields.get('checklistItems')?.value).toEqual([
      { text: 'Warm up', isChecked: false },
    ])
    expect(proposal.checklist).toBe(false)

    proposal = proposed
    controller.resolveSetupProposal()
    expect(proposal.setup).toBe(false)
    controller.setTitle('Read')
    expect(proposal).toBe(EMPTY_HABIT_FORM_PROPOSAL)
    expect(fields.get('title')).toEqual({ value: 'Read', validate: true })
    controller.setReminderEnabled(true)
    controller.setSlipAlertEnabled(true)
    expect(fields.get('reminderEnabled')?.value).toBe(true)
    expect(fields.get('slipAlertEnabled')?.value).toBe(true)
    controller.clearProposal()
    expect(proposal).toBe(EMPTY_HABIT_FORM_PROPOSAL)
    expect(setGeneral).not.toHaveBeenCalled()
  })

  it('honors locked cadence and toggle overrides', async () => {
    let proposal = { setup: true, checklist: true, subHabits: true, checklistItems: 2, subHabitItems: 1 }
    const ownership = { cadence: false, dueTime: false }
    const action = vi.fn(async () => proposal)
    const onReminderEnabledChange = vi.fn()
    const onSlipAlertEnabledChange = vi.fn()
    const setGeneral = vi.fn()
    const setField = vi.fn()
    const toggleDay = vi.fn()
    const controller = createHabitFormController({
      action,
      atLimit: true,
      lockedGeneral: true,
      onReminderEnabledChange,
      onSlipAlertEnabledChange,
      target: {
        getOwnership: () => ownership,
        setOwnership: vi.fn(),
        updateProposal: (update) => { proposal = update(proposal) },
        setOneTime: vi.fn(),
        setRecurring: vi.fn(),
        setFlexible: vi.fn(),
        setGeneral,
        setField,
        toggleDay,
      },
    })

    await controller.askAstra()
    expect(action).not.toHaveBeenCalled()
    expect(proposal).toBe(EMPTY_HABIT_FORM_PROPOSAL)
    controller.toggleDay('Friday')
    controller.setQuantity(2)
    expect(setGeneral).toHaveBeenCalledTimes(2)
    expect(toggleDay).not.toHaveBeenCalled()
    controller.setReminderEnabled(true)
    controller.setSlipAlertEnabled(false)
    expect(onReminderEnabledChange).toHaveBeenCalledWith(true)
    expect(onSlipAlertEnabledChange).toHaveBeenCalledWith(false)
    expect(setField).not.toHaveBeenCalled()
  })

  it('validates reminder selection with due-time reminders', () => {
    expect(
      validateHabitFormInput(
        {
          title: 'Exercise',
          dueTime: '09:00',
          reminderEnabled: true,
        },
        {
          reminderTimes: [],
        },
      ),
    ).toBe('habits.form.reminderMinimumOne')
  })

  it('validates reminder selection with scheduled reminders', () => {
    expect(
      validateHabitFormInput({
        title: 'Exercise',
        reminderEnabled: true,
      }),
    ).toBe('habits.form.reminderMinimumOne')
  })

  it('validates linked goal limit', () => {
    expect(
      validateHabitFormInput(
        { title: 'Exercise' },
        {
          selectedGoalIds: Array.from({ length: 11 }, (_, index) => `goal-${index}`),
        },
      ),
    ).toBe('habits.form.goalLimit')
  })

  it('validates selected tag limit', () => {
    expect(
      validateHabitFormInput(
        { title: 'Exercise' },
        {
          selectedTagIds: Array.from({ length: 6 }, (_, index) => `tag-${index}`),
        },
      ),
    ).toBe('habits.form.tagLimit')
  })

  it('validates sub-habit titles from context', () => {
    expect(
      validateHabitFormInput(
        { title: 'Exercise' },
        {
          subHabits: [''],
        },
      ),
    ).toBe('habits.form.subHabitTitleRequired')
  })

  it('returns null when the habit form input is valid', () => {
    expect(
      validateHabitFormInput(
        {
          title: 'Exercise',
          frequencyUnit: 'Week',
          frequencyQuantity: 3,
          dueTime: '09:00',
          reminderEnabled: true,
        },
        {
          reminderTimes: [0],
          selectedGoalIds: ['goal-1'],
          selectedTagIds: ['tag-1'],
          subHabits: ['Warm-up'],
        },
      ),
    ).toBeNull()
  })
})
