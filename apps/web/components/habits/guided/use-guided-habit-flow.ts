'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale } from 'next-intl'
import {
  advanceHabitFlow,
  answerHabitReminder,
  answerHabitTime,
  answerHabitWhen,
  buildHabitFormPatchFromSuggestion,
  createHabitFormController,
  getAccountDay,
  habitFlowPosition,
  openHabitFlowStep,
  phraseLeavesWordsUnread,
  readPhraseCoverage,
  readTypedHabitPhrase,
  remainingHabitFlowSteps,
  resetCoveredAnswers,
  resolveSupportedLocale,
  retreatHabitFlow,
  settleHabitFlow,
  startHabitFlow,
  type HabitFlowAnswers,
  type HabitFlowDetailStep,
  type HabitFlowNavigation,
  type HabitFlowStepId,
  type HabitFlowStepKey,
  type HabitPhraseFormOwnership,
  type HabitWhenChoice,
} from '@orbit/shared/utils'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useHabitPhraseRead } from '@/hooks/use-habit-phrase-read'
import { useProfile } from '@/hooks/use-profile'
import { applySuggestionSchedule } from '../create-habit-modal/apply-suggestion'

const CORE_ORDER: readonly HabitFlowStepKey[] = ['what', 'when', 'time', 'reminder', 'summary']

interface GuidedHabitFlowOptions {
  formHelpers: HabitFormHelpers
  lockedGeneral: boolean | null
}

/**
 * The state of the guided habit flow. It is a view over the form state the modal owns, never a second
 * form model: every answer writes the same fields the current form writes, so the request is the same.
 */
export function useGuidedHabitFlow({ formHelpers, lockedGeneral }: Readonly<GuidedHabitFlowOptions>) {
  const { form } = formHelpers
  const locale = useLocale()
  const { profile } = useProfile()
  const today = getAccountDay(new Date(), profile?.timeZone)
  const [navigation, setNavigation] = useState<HabitFlowNavigation>(() => startHabitFlow('create'))
  const [answers, setAnswers] = useState<HabitFlowAnswers>({ when: false, time: false })
  const [ownership, setOwnership] = useState<HabitPhraseFormOwnership>({ cadence: false, dueTime: false })
  const [usedAiRead, setUsedAiRead] = useState(false)
  /** The type is a result. It stays open until the person sets it on the summary, so the phrase can make a habit. */
  const [deliberateType, setDeliberateType] = useState<'task' | 'habit' | null>(null)
  const phraseRead = useHabitPhraseRead()

  const title = form.watch('title')
  const dueDate = form.watch('dueDate') ?? ''
  const dueTime = form.watch('dueTime') ?? ''
  const frequencyUnit = form.watch('frequencyUnit')
  const isFlexible = form.watch('isFlexible') ?? false
  const isGeneral = formHelpers.isGeneral
  const supportedLocale = resolveSupportedLocale(locale)
  const localRead = useMemo(
    () => readTypedHabitPhrase(title, supportedLocale, deliberateType, isGeneral),
    [deliberateType, isGeneral, supportedLocale, title],
  )

  const controller = useMemo(() => createHabitFormController({
    action: undefined,
    atLimit: false,
    lockedGeneral,
    target: {
      hasSchedule: () => isFlexible || Boolean(frequencyUnit),
      getOwnership: () => ownership,
      setOwnership,
      updateProposal: () => {},
      setOneTime: () => { if (form.getValues('itemType') !== 'habit') formHelpers.setOneTime() },
      setRecurring: formHelpers.setRecurring,
      setFlexible: formHelpers.setFlexible,
      setGeneral: formHelpers.setGeneral,
      setField: (field, value) => form.setValue(field, value as never, { shouldDirty: true }),
      toggleDay: formHelpers.toggleDay,
    },
  }), [form, formHelpers, frequencyUnit, isFlexible, lockedGeneral, ownership])

  const applyRead = useCallback((read: typeof localRead) => {
    controller.readPhrase(true, read)
    if (deliberateType === null && read.cadence !== null && form.getValues('itemType') !== 'habit') formHelpers.chooseItemType('habit')
  }, [controller, deliberateType, form, formHelpers])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the phrase that opens the flow is read once, then every change reads through changeTitle https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => { applyRead(localRead) }, [])

  /** The person types the phrase. The local read answers at once, on the device, and the answers it covers reset. */
  const changeTitle = useCallback((value: string) => {
    form.setValue('title', value, { shouldDirty: true })
    const read = readTypedHabitPhrase(value, supportedLocale, deliberateType, isGeneral)
    applyRead(read)
    setAnswers((current) => resetCoveredAnswers(current, readPhraseCoverage(read, false)))
  }, [applyRead, deliberateType, form, isGeneral, supportedLocale])

  const stepInput = useMemo(() => ({
    mode: 'create' as const,
    hasDateOrRepeat: Boolean(dueDate) || Boolean(frequencyUnit) || isFlexible || isGeneral,
    hasTime: Boolean(dueTime),
    phraseGaveTime: localRead.dueTime !== null,
    whenLocked: lockedGeneral === true,
    answers,
  }), [answers, dueDate, dueTime, frequencyUnit, isFlexible, isGeneral, localRead.dueTime, lockedGeneral])
  const steps: HabitFlowStepId[] = remainingHabitFlowSteps(stepInput)
  const current = settleHabitFlow(navigation, steps)
  const position = habitFlowPosition(current, steps)
  const step = current.step

  /**
   * The answer has just written the form and the next render has not run yet, so `nextSteps` is the list the
   * answer leads to. A double press answers one step only: the second press carries a step that has moved on.
   */
  const advance = useCallback((nextSteps: readonly HabitFlowStepKey[] = steps) => setNavigation((value) => {
    const settled = settleHabitFlow(value, steps)
    if (settled.step !== step) return settled
    if (settled.trail.length > 0) return advanceHabitFlow(settled, steps)
    const after = CORE_ORDER.slice(CORE_ORDER.indexOf(step) + 1).find((candidate) => nextSteps.includes(candidate))
    return after ? { step: after, trail: [], direction: 1 } : settled
  }), [steps, step])
  const back = useCallback(() => {
    const previous = retreatHabitFlow(settleHabitFlow(navigation, steps), steps)
    if (previous) setNavigation(previous)
    return previous !== null
  }, [navigation, steps])
  const open = useCallback((target: HabitFlowDetailStep | HabitFlowStepId) => setNavigation((value) => openHabitFlowStep(value, target)), [])

  const port = useMemo(() => ({
    setField: (field: Parameters<typeof form.setValue>[0], value: string | number | null) => form.setValue(field, value, { shouldDirty: true }),
    chooseItemType: formHelpers.chooseItemType,
    setOneTime: formHelpers.setOneTime,
    setRecurring: formHelpers.setRecurring,
    setGeneral: formHelpers.setGeneral,
    setReminderEnabled: (enabled: boolean) => form.setValue('reminderEnabled', enabled, { shouldDirty: true }),
  }), [form, formHelpers])

  const leadsTo = useCallback((overrides: Partial<typeof stepInput>) => remainingHabitFlowSteps({ ...stepInput, ...overrides }), [stepInput])
  const answerWhen = useCallback((choice: HabitWhenChoice) => {
    answerHabitWhen(port, choice, today)
    setAnswers((value) => ({ ...value, when: true }))
    advance(leadsTo({ answers: { ...answers, when: true }, hasDateOrRepeat: true }))
  }, [advance, answers, leadsTo, port, today])
  /** A date from the calendar or the free path makes a one-time task on that day. */
  const chooseDate = useCallback((date: string) => {
    port.chooseItemType('task')
    port.setOneTime()
    port.setField('datePhrase', '')
    port.setField('dateIssue', '')
    port.setField('dueDate', date)
    setAnswers((value) => ({ ...value, when: true }))
    advance(leadsTo({ answers: { ...answers, when: true }, hasDateOrRepeat: true }))
  }, [advance, answers, leadsTo, port])
  /** The person's own words for a repeat, such as "toda segunda". The same local reader answers. */
  const readWhenPhrase = useCallback((text: string): boolean => {
    const read = readTypedHabitPhrase(text, supportedLocale, null, false)
    if (read.cadence === null) return false
    controller.readPhrase(true, read)
    port.chooseItemType('habit')
    setAnswers((value) => ({ ...value, when: true }))
    advance(leadsTo({ answers: { ...answers, when: true }, hasDateOrRepeat: true, hasTime: stepInput.hasTime || read.dueTime !== null }))
    return true
  }, [advance, answers, controller, leadsTo, port, stepInput.hasTime, supportedLocale])
  const answerTime = useCallback((time: string | null) => {
    answerHabitTime(port, time)
    setAnswers((value) => ({ ...value, time: true }))
    advance(leadsTo({ answers: { ...answers, time: true }, hasTime: time !== null }))
  }, [advance, answers, leadsTo, port])
  const answerReminder = useCallback((remind: boolean) => {
    answerHabitReminder(port, remind)
    advance()
  }, [advance, port])
  /** The person set the type on the summary. No later read changes it. */
  const markTypeDeliberate = useCallback(() => setDeliberateType(form.getValues('itemType') ?? null), [form])

  /** Leaving step 1 asks the free reader once, and only when the device left cadence, date or time words unread. */
  const leavePhrase = useCallback(async () => {
    const phrase = title.trim()
    if (phrase.length > 0 && phraseLeavesWordsUnread(phrase, localRead, Boolean(dueDate))) {
      try {
        const response = await phraseRead.mutateAsync({ phrase, language: locale })
        if (response) {
          setUsedAiRead(true)
          applySuggestionSchedule(buildHabitFormPatchFromSuggestion(response), formHelpers)
        }
      } catch {
        /** A miss, a cap, the kill switch and a provider failure all lead to the remaining questions with no error text. */
      }
    }
    advance(leadsTo({}))
  }, [advance, dueDate, formHelpers, leadsTo, locale, localRead, phraseRead, title])

  return {
    answers, answerReminder, chooseDate, changeTitle, markTypeDeliberate, readWhenPhrase, answerTime, answerWhen, advance, back, current, leavePhrase,
    localRead, open, position, reading: phraseRead.isPending, steps, today, usedAiRead,
  }
}
