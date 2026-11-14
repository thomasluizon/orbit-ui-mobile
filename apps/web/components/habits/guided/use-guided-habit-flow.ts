'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import {
  advanceHabitFlow,
  answerHabitReminder,
  answerHabitTime,
  answerHabitWhen,
  applyHabitEmojiSuggestion,
  buildHabitFormPatchFromSuggestion,
  createHabitFormController,
  getAccountDay,
  guardHabitReadPatch,
  habitFlowFieldStep,
  habitFlowPosition,
  openHabitFlowStep,
  phraseLeavesWordsUnread,
  readHabitWhenWords,
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
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useHabitPhraseRead } from '@/hooks/use-habit-phrase-read'
import { useOffline } from '@/hooks/use-offline'
import { useProfile } from '@/hooks/use-profile'
import { applySuggestionSchedule } from '../create-habit-modal/apply-suggestion'

const CORE_ORDER: readonly HabitFlowStepKey[] = ['what', 'when', 'time', 'reminder', 'summary']

interface GuidedHabitFlowOptions {
  formHelpers: HabitFormHelpers
  lockedGeneral: boolean | null
  mode: 'create' | 'edit'
  onReminderEnabledChange?: (enabled: boolean) => void
  onSlipAlertEnabledChange?: (enabled: boolean) => void
}

/** The values the free read proposed. A proposal shows with the proposed state until the person changes it. */
export interface GuidedHabitProposals {
  schedule: boolean
  time: boolean
  emoji: boolean
}

const NO_PROPOSALS: GuidedHabitProposals = { schedule: false, time: false, emoji: false }

function useFormController(formHelpers: HabitFormHelpers, options: Pick<GuidedHabitFlowOptions, 'lockedGeneral' | 'onReminderEnabledChange' | 'onSlipAlertEnabledChange'>) {
  const { form } = formHelpers
  const [ownership, setOwnership] = useState<HabitPhraseFormOwnership>({ cadence: false, dueTime: false })
  const frequencyUnit = form.watch('frequencyUnit')
  const isFlexible = form.watch('isFlexible') ?? false
  const { lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange } = options
  return useMemo(() => createHabitFormController({
    action: undefined,
    atLimit: false,
    lockedGeneral,
    onReminderEnabledChange,
    onSlipAlertEnabledChange,
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
  }), [form, formHelpers, frequencyUnit, isFlexible, lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange, ownership])
}

/**
 * The state of the guided habit flow. It is a view over the form state the modal owns, never a second
 * form model: every answer writes the same fields the current form writes, so the request is the same.
 */
// react-doctor-disable-next-line no-giant-component -- one state owner for every step of the flow; each step reads it through the returned actions https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function useGuidedHabitFlow({ formHelpers, lockedGeneral, mode, onReminderEnabledChange, onSlipAlertEnabledChange }: Readonly<GuidedHabitFlowOptions>) {
  const { form } = formHelpers
  const locale = useLocale()
  const { profile } = useProfile()
  const { isOnline } = useOffline()
  const today = getAccountDay(new Date(), profile?.timeZone)
  const [navigation, setNavigation] = useState<HabitFlowNavigation>(() => startHabitFlow(mode))
  const [answers, setAnswers] = useState<HabitFlowAnswers>({ when: false, time: false })
  const [usedAiRead, setUsedAiRead] = useState(false)
  const [proposals, setProposals] = useState<GuidedHabitProposals>(NO_PROPOSALS)
  /** The type is a result. It stays open until the person sets it on the summary, so the phrase can make a habit. */
  const [deliberateType, setDeliberateType] = useState<'task' | 'habit' | null>(null)
  const phraseRead = useHabitPhraseRead()
  const controller = useFormController(formHelpers, { lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange })

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

  const applyRead = useCallback((read: typeof localRead) => {
    controller.readPhrase(true, read)
    if (deliberateType === null && read.cadence !== null && form.getValues('itemType') !== 'habit') formHelpers.chooseItemType('habit')
  }, [controller, deliberateType, form, formHelpers])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the phrase that opens a create is read once, then every change reads through changeTitle; an edit keeps its stored values https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => { if (mode === 'create') applyRead(localRead) }, [])

  /** The person types the phrase. A create reads it at once, on the device, and the answers it covers reset. An edit only renames. */
  const changeTitle = useCallback((value: string) => {
    form.setValue('title', value, { shouldDirty: true })
    if (mode === 'edit') return
    const read = readTypedHabitPhrase(value, supportedLocale, deliberateType, isGeneral)
    applyRead(read)
    setAnswers((current) => resetCoveredAnswers(current, readPhraseCoverage(read, false)))
  }, [applyRead, deliberateType, form, isGeneral, mode, supportedLocale])

  const steps: HabitFlowStepId[] = remainingHabitFlowSteps({
    mode,
    hasDateOrRepeat: Boolean(dueDate) || Boolean(frequencyUnit) || isFlexible || isGeneral,
    hasTime: Boolean(dueTime),
    phraseGaveTime: localRead.dueTime !== null || proposals.time,
    whenLocked: lockedGeneral === true,
    undated: isGeneral,
    answers,
  })
  /** The steps an answer leads to. The form writes land at once, so the list reads them before the next render. */
  const stepsAfter = useCallback((nextAnswers: HabitFlowAnswers, aiGaveTime = proposals.time) => {
    const values = form.getValues()
    return remainingHabitFlowSteps({
      mode,
      hasDateOrRepeat: Boolean(values.dueDate) || Boolean(values.frequencyUnit) || Boolean(values.isFlexible) || Boolean(values.isGeneral),
      hasTime: Boolean(values.dueTime),
      phraseGaveTime: readTypedHabitPhrase(values.title, supportedLocale, deliberateType, Boolean(values.isGeneral)).dueTime !== null || aiGaveTime,
      whenLocked: lockedGeneral === true,
      undated: Boolean(values.isGeneral),
      answers: nextAnswers,
    })
  }, [deliberateType, form, lockedGeneral, mode, proposals.time, supportedLocale])
  const current = settleHabitFlow(navigation, steps)
  const position = habitFlowPosition(current, steps)
  const step = current.step

  /**
   * The answer has just written the form and the next render has not run yet, so `nextSteps` is the list the
   * answer leads to. A step whose answer the flow holds is passed over: the flow never asks for a value it holds.
   * A double press answers one step only: the second press carries a step that has moved on.
   */
  const advance = useCallback((nextSteps: readonly HabitFlowStepKey[] = steps, nextAnswers: HabitFlowAnswers = answers) => setNavigation((value) => {
    const settled = settleHabitFlow(value, steps)
    if (settled.step !== step) return settled
    if (settled.trail.length > 0) return advanceHabitFlow(settled, steps)
    const holds = (candidate: HabitFlowStepKey) => (candidate === 'when' || candidate === 'time') && nextAnswers[candidate]
    const after = CORE_ORDER.slice(CORE_ORDER.indexOf(step) + 1).find((candidate) => nextSteps.includes(candidate) && !holds(candidate))
    return after ? { step: after, trail: [], direction: 1 } : settled
  }), [answers, steps, step])
  const back = useCallback(() => {
    const previous = retreatHabitFlow(settleHabitFlow(navigation, steps), steps)
    if (previous) setNavigation(previous)
    return previous !== null
  }, [navigation, steps])
  const open = useCallback((target: HabitFlowDetailStep | HabitFlowStepId) => setNavigation((value) => openHabitFlowStep(value, target)), [])
  /** A follow-up question takes the place of the one that led to it, so its answer returns to the same place. */
  const replace = useCallback((target: HabitFlowDetailStep) => setNavigation((value) => ({ ...value, step: target, direction: 1 })), [])

  const port = useMemo(() => ({
    setField: (field: Parameters<typeof form.setValue>[0], value: string | number | null) => form.setValue(field, value, { shouldDirty: true }),
    chooseItemType: formHelpers.chooseItemType,
    setOneTime: formHelpers.setOneTime,
    setRecurring: formHelpers.setRecurring,
    setGeneral: formHelpers.setGeneral,
    setReminderEnabled: (enabled: boolean) => controller.setReminderEnabled(enabled),
  }), [controller, form, formHelpers])

  const answerStep = useCallback((answered: keyof HabitFlowAnswers) => {
    const nextAnswers = { ...answers, [answered]: true }
    setAnswers(nextAnswers)
    advance(stepsAfter(nextAnswers), nextAnswers)
  }, [advance, answers, stepsAfter])
  const answerWhen = useCallback((choice: HabitWhenChoice) => {
    answerHabitWhen(port, choice, today)
    setProposals((value) => ({ ...value, schedule: false }))
    answerStep('when')
  }, [answerStep, port, today])
  /** A date from the calendar or the free path makes a one-time task on that day. */
  const chooseDate = useCallback((date: string) => {
    port.chooseItemType('task')
    port.setOneTime()
    port.setField('datePhrase', '')
    port.setField('dateIssue', '')
    port.setField('dueDate', date)
    setProposals((value) => ({ ...value, schedule: false }))
    answerStep('when')
  }, [answerStep, port])
  /** The person's own words on the date question: a repeat, a day, a past day for a new task, or words the device cannot read. */
  const readWhenWords = useCallback((text: string): 'past' | 'unresolved' | null => {
    const words = readHabitWhenWords(text, { referenceDate: today, locale, timeZone: profile?.timeZone, language: supportedLocale, allowPast: mode === 'edit' })
    if (words.kind === 'date') { chooseDate(words.date); return null }
    if (words.kind !== 'repeat') return words.kind
    controller.readPhrase(true, words.read)
    port.chooseItemType('habit')
    answerStep('when')
    return null
  }, [answerStep, chooseDate, controller, locale, mode, port, profile?.timeZone, supportedLocale, today])
  const answerTime = useCallback((time: string | null) => {
    answerHabitTime(port, time)
    setProposals((value) => ({ ...value, time: false }))
    answerStep('time')
  }, [answerStep, port])
  const answerReminder = useCallback((remind: boolean) => {
    answerHabitReminder(port, remind)
    advance()
  }, [advance, port])
  /** The person set the type on the summary. No later read changes it. */
  const markTypeDeliberate = useCallback(() => setDeliberateType(form.getValues('itemType') ?? null), [form])

  const applyFreeRead = useCallback((response: HabitSetupSuggestion) => {
    const patch = guardHabitReadPatch(buildHabitFormPatchFromSuggestion(response), { deliberateType, timeAnswered: answers.time })
    const hadEmoji = Boolean(form.getValues('emoji'))
    if (patch.mode !== 'oneTime' && deliberateType === null && form.getValues('itemType') !== 'habit') formHelpers.chooseItemType('habit')
    const timeBefore = form.getValues('dueTime')
    const applied = applySuggestionSchedule(patch, formHelpers)
    const gaveTime = Boolean(patch.dueTime) && form.getValues('dueTime') !== timeBefore
    setUsedAiRead(true)
    setProposals({ schedule: applied && patch.mode !== 'oneTime', time: gaveTime, emoji: !hadEmoji && Boolean(form.getValues('emoji')) })
    return gaveTime
  }, [answers.time, deliberateType, form, formHelpers])

  /** Leaving step 1 asks the free reader once, online, and only when the device left cadence, date or time words unread. */
  const leavePhrase = useCallback(async () => {
    const phrase = title.trim()
    let aiGaveTime = proposals.time
    if (mode === 'create' && isOnline && phrase.length > 0 && phraseLeavesWordsUnread(phrase, localRead, Boolean(dueDate))) {
      try {
        const response = await phraseRead.mutateAsync({ phrase, language: locale })
        if (response) aiGaveTime = applyFreeRead(response) || aiGaveTime
      } catch {
        /** A miss, a cap, the kill switch and a provider failure all lead to the remaining questions with no error text. */
      }
    }
    advance(stepsAfter(answers, aiGaveTime))
  }, [advance, answers, applyFreeRead, dueDate, isOnline, locale, localRead, mode, phraseRead, proposals.time, stepsAfter, title])

  /** The emoji suggestion uses the free read: it fills an empty emoji as a proposal and spends no message. */
  const suggestEmoji = useCallback(async () => {
    const phrase = title.trim()
    if (!phrase || !isOnline) return
    try {
      const response = await phraseRead.mutateAsync({ phrase, language: locale })
      const applied = applyHabitEmojiSuggestion(response?.emoji ?? null, form.getValues('emoji'), (emoji) => form.setValue('emoji', emoji, { shouldDirty: true }))
      if (applied) setProposals((value) => ({ ...value, emoji: true }))
    } catch {
      /** A miss keeps the emoji the person has, with no error text. */
    }
  }, [form, isOnline, locale, phraseRead, title])
  const chooseEmoji = useCallback((emoji: string) => {
    controller.setEmoji(emoji)
    setProposals((value) => ({ ...value, emoji: false }))
  }, [controller])

  useFieldErrorSteps(formHelpers, open)

  return {
    answers, answerReminder, chooseDate, chooseEmoji, changeTitle, controller, markTypeDeliberate, readWhenWords, answerTime, answerWhen, advance, back, current, leavePhrase,
    localRead, mode, offline: !isOnline, open, position, proposals, reading: phraseRead.isPending, replace, steps, suggestEmoji, today, usedAiRead,
  }
}

/** A server field error opens the step that owns the field, and the field there takes focus. */
function useFieldErrorSteps(formHelpers: HabitFormHelpers, open: (step: HabitFlowDetailStep | HabitFlowStepId) => void) {
  const seen = useRef(formHelpers.backendFocusRequest)
  useEffect(() => {
    if (formHelpers.backendFocusRequest === seen.current) return
    seen.current = formHelpers.backendFocusRequest
    const target = habitFlowFieldStep(formHelpers.backendFocusField)
    if (target !== 'summary') open(target)
  }, [formHelpers.backendFocusField, formHelpers.backendFocusRequest, open])
}
