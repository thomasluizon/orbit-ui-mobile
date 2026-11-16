import type { z } from 'zod'
import type { HabitPhraseReadRequest, HabitPhraseReadResponse } from '../types/habit'
import { getAccountDay } from '../utils/dates'
import { phraseLeavesWordsUnread, readPhraseCoverage, remainingHabitFlowSteps, resetCoveredAnswers, type HabitFlowAnswers, type HabitFlowStepId } from '../utils/habit-flow'
import { answerHabitReminder, answerHabitTime, answerHabitWhen, type HabitFlowFormPort, type HabitWhenChoice } from '../utils/habit-flow-answers'
import { guardHabitReadPatch, habitFlowFieldStep, readHabitWhenWords } from '../utils/habit-flow-details'
import {
  advanceHabitFlow,
  habitFlowPosition,
  openHabitFlowStep,
  retreatHabitFlow,
  settleHabitFlow,
  startHabitFlow,
  type HabitFlowDetailStep,
  type HabitFlowNavigation,
  type HabitFlowStepKey,
} from '../utils/habit-flow-navigation'
import {
  applyHabitEmojiSuggestion,
  buildHabitFormPatchFromSuggestion,
  createHabitFormController,
  type HabitFormController,
  type HabitFormSuggestionPatch,
  type HabitPhraseFormOwnership,
} from '../utils/habit-form-helpers'
import { readTypedHabitPhrase, type HabitPhraseRead } from '../utils/habit-phrase-parser'
import { resolveSupportedLocale } from '../utils/locale-format'
import type { habitFormSchema } from '../validation'
import type { StateHook } from './state-adapter'

const CORE_ORDER: readonly HabitFlowStepKey[] = ['what', 'when', 'time', 'reminder', 'summary']
const PHRASE_STEP: HabitFlowStepKey = 'what'

type HabitFormInput = z.input<typeof habitFormSchema>
type DeliberateType = 'task' | 'habit' | null
type FlowTarget = HabitFlowDetailStep | HabitFlowStepId

export interface GuidedHabitFlowAdapters {
  useState: StateHook
  useEffect: (effect: () => void | (() => void), dependencies?: readonly unknown[]) => void
  useMemo: <Value>(calculate: () => Value, dependencies: readonly unknown[]) => Value
  useCallback: <Callback extends (...args: never[]) => unknown>(callback: Callback, dependencies: readonly unknown[]) => Callback
  useRef: <Value>(initial: Value) => { current: Value }
}

/** The form writes and reads the flow needs. Each app builds it over its own form instance. */
export interface GuidedHabitFlowForm {
  getValues: () => Pick<HabitFormInput, 'title' | 'dueDate' | 'dueTime' | 'frequencyUnit' | 'isFlexible' | 'isGeneral' | 'itemType' | 'emoji'>
  setField: (field: keyof HabitFormInput, value: unknown) => void
}

/** The part of the form helpers the flow calls. The helpers of each app satisfy it as they are. */
export interface GuidedHabitFlowHelpers {
  isGeneral: boolean
  toggleDay: (day: string, daily?: boolean) => void
  chooseItemType: (type: 'task' | 'habit') => void
  setOneTime: () => void
  setRecurring: (restoreDraft?: boolean) => void
  setFlexible: (restoreDraft?: boolean) => void
  setGeneral: () => void
  backendFocusRequest: number
  backendFocusField: 'title' | 'description' | undefined
}

export interface GuidedHabitFlowOptions {
  mode: 'create' | 'edit'
  lockedGeneral: boolean | null
  onReminderEnabledChange?: (enabled: boolean) => void
  onSlipAlertEnabledChange?: (enabled: boolean) => void
  locale: string
  timeZone: string | null | undefined
  isOnline: boolean
  helpers: GuidedHabitFlowHelpers
  form: GuidedHabitFlowForm
  watched: Pick<HabitFormInput, 'title' | 'dueDate' | 'dueTime' | 'frequencyUnit' | 'isFlexible'>
  readPhrase: (request: HabitPhraseReadRequest) => Promise<HabitPhraseReadResponse | null>
  applySchedule: (patch: HabitFormSuggestionPatch) => boolean
}

/** The values the free read proposed. A proposal shows with the proposed state until the person changes it. */
export interface GuidedHabitProposals {
  schedule: boolean
  time: boolean
  emoji: boolean
}

/** What the flow gives its step views: the place in the flow, the answers it holds and the actions of each step. */
export interface GuidedHabitFlowState {
  answers: HabitFlowAnswers
  answerReminder: (remind: boolean) => void
  answerTime: (time: string | null) => void
  answerWhen: (choice: HabitWhenChoice) => void
  advance: (nextSteps?: readonly HabitFlowStepKey[], nextAnswers?: HabitFlowAnswers) => void
  back: () => boolean
  changeTitle: (value: string) => void
  chooseDate: (date: string) => void
  chooseEmoji: (emoji: string) => void
  controller: HabitFormController
  current: HabitFlowNavigation
  leavePhrase: () => Promise<void>
  localRead: HabitPhraseRead
  markTypeDeliberate: () => void
  mode: 'create' | 'edit'
  offline: boolean
  open: (target: HabitFlowDetailStep | HabitFlowStepId) => void
  position: ReturnType<typeof habitFlowPosition>
  proposals: GuidedHabitProposals
  reading: boolean
  readWhenWords: (text: string) => 'past' | 'unresolved' | null
  replace: (target: HabitFlowDetailStep) => void
  steps: HabitFlowStepId[]
  suggestEmoji: () => Promise<void>
  today: string
  usedAiRead: boolean
}

const NO_PROPOSALS: GuidedHabitProposals = { schedule: false, time: false, emoji: false }

interface LiveFlow {
  step: HabitFlowStepKey
  answers: HabitFlowAnswers
  deliberateType: DeliberateType
}

interface PhraseReadInput {
  options: Readonly<GuidedHabitFlowOptions>
  live: { current: LiveFlow }
  localRead: HabitPhraseRead
  proposals: GuidedHabitProposals
  setProposals: (update: GuidedHabitProposals | ((current: GuidedHabitProposals) => GuidedHabitProposals)) => void
  advance: (nextSteps?: readonly HabitFlowStepKey[], nextAnswers?: HabitFlowAnswers) => void
  stepsAfter: (nextAnswers: HabitFlowAnswers, aiGaveTime?: boolean) => HabitFlowStepId[]
}

function missedRead(): null {
  return null
}

/**
 * The state of the guided habit flow, shared by web and Android. It is a view over the form state the modal owns,
 * never a second form model: every answer writes the same fields the current form writes, so the request is the
 * same. Each app passes its React hooks, its form and its locale.
 */
export function createUseGuidedHabitFlow({ useState, useEffect, useMemo, useCallback, useRef }: GuidedHabitFlowAdapters) {
  function useFormController({ form, helpers, watched, lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange }: Readonly<GuidedHabitFlowOptions>): HabitFormController {
    const [ownership, setOwnership] = useState<HabitPhraseFormOwnership>({ cadence: false, dueTime: false })
    const frequencyUnit = watched.frequencyUnit
    const isFlexible = watched.isFlexible ?? false
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
        setOneTime: () => { if (form.getValues().itemType !== 'habit') helpers.setOneTime() },
        setRecurring: helpers.setRecurring,
        setFlexible: helpers.setFlexible,
        setGeneral: helpers.setGeneral,
        setField: (field, value) => form.setField(field, value),
        toggleDay: helpers.toggleDay,
      },
    }), [form, helpers, frequencyUnit, isFlexible, lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange, ownership])
  }

  function useOpeningRead(mode: 'create' | 'edit', applyRead: (read: HabitPhraseRead) => void, localRead: HabitPhraseRead) {
    const opened = useRef(false)
    useEffect(() => {
      if (opened.current) return
      opened.current = true
      if (mode === 'create') applyRead(localRead)
    }, [applyRead, localRead, mode])
  }

  function useNavigation(mode: 'create' | 'edit', steps: readonly HabitFlowStepId[], answers: HabitFlowAnswers) {
    const [navigation, setNavigation] = useState<HabitFlowNavigation>(() => startHabitFlow(mode))
    const current = settleHabitFlow(navigation, steps)
    const step = current.step
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
    const open = useCallback((target: FlowTarget) => setNavigation((value) => openHabitFlowStep(value, target)), [])
    const replace = useCallback((target: HabitFlowDetailStep) => setNavigation((value) => ({ ...value, step: target, direction: 1 })), [])
    return { current, position: habitFlowPosition(current, steps), advance, back, open, replace }
  }

  function useLiveFlow(step: HabitFlowStepKey, answers: HabitFlowAnswers, deliberateType: DeliberateType) {
    const live = useRef<LiveFlow>({ step, answers, deliberateType })
    useEffect(() => { live.current = { step, answers, deliberateType } }, [live, step, answers, deliberateType])
    return live
  }

  function usePhraseReads({ options, live, localRead, proposals, setProposals, advance, stepsAfter }: PhraseReadInput) {
    const { form, helpers, mode, isOnline, locale, readPhrase, applySchedule, watched } = options
    const [reading, setReading] = useState(false)
    const [usedAiRead, setUsedAiRead] = useState(false)
    const lastReadPhrase = useRef<string | null>(null)
    const leaving = useRef(false)
    const title = watched.title
    const hasDate = Boolean(watched.dueDate)

    const applyFreeRead = useCallback((response: HabitPhraseReadResponse) => {
      const { answers, deliberateType } = live.current
      const patch = guardHabitReadPatch(buildHabitFormPatchFromSuggestion(response), { deliberateType, timeAnswered: answers.time })
      const hadEmoji = Boolean(form.getValues().emoji)
      if (patch.mode !== 'oneTime' && deliberateType === null && form.getValues().itemType !== 'habit') helpers.chooseItemType('habit')
      const timeBefore = form.getValues().dueTime
      const applied = applySchedule(patch)
      const gaveTime = Boolean(patch.dueTime) && form.getValues().dueTime !== timeBefore
      setUsedAiRead(true)
      setProposals({ schedule: applied && patch.mode !== 'oneTime', time: gaveTime, emoji: !hadEmoji && Boolean(form.getValues().emoji) })
      return gaveTime
    }, [applySchedule, form, helpers, live, setProposals])

    const leavePhrase = useCallback(async () => {
      if (leaving.current) return
      const phrase = title.trim()
      const asksReader = mode === 'create' && isOnline && phrase !== lastReadPhrase.current && phraseLeavesWordsUnread(phrase, localRead, hasDate)
      if (!asksReader) { advance(stepsAfter(live.current.answers, proposals.time)); return }
      lastReadPhrase.current = phrase
      leaving.current = true
      setReading(true)
      const response = await readPhrase({ phrase, language: locale }).catch(missedRead)
      leaving.current = false
      setReading(false)
      if (form.getValues().title.trim() !== phrase || live.current.step !== PHRASE_STEP) return
      const aiGaveTime = response ? applyFreeRead(response) : false
      advance(stepsAfter(live.current.answers, aiGaveTime || proposals.time))
    }, [advance, applyFreeRead, form, hasDate, isOnline, live, locale, localRead, mode, proposals.time, readPhrase, stepsAfter, title])

    const suggestEmoji = useCallback(async () => {
      const phrase = title.trim()
      if (!phrase || !isOnline) return
      setReading(true)
      const response = await readPhrase({ phrase, language: locale }).catch(missedRead)
      setReading(false)
      if (form.getValues().title.trim() !== phrase) return
      const applied = applyHabitEmojiSuggestion(response?.emoji ?? null, form.getValues().emoji, (emoji) => form.setField('emoji', emoji))
      if (applied) setProposals((value) => ({ ...value, emoji: true }))
    }, [form, isOnline, locale, readPhrase, setProposals, title])

    return { leavePhrase, suggestEmoji, reading, usedAiRead }
  }

  function useFieldErrorSteps(helpers: GuidedHabitFlowHelpers, open: (step: FlowTarget) => void) {
    const seen = useRef(helpers.backendFocusRequest)
    useEffect(() => {
      if (helpers.backendFocusRequest === seen.current) return
      seen.current = helpers.backendFocusRequest
      const target = habitFlowFieldStep(helpers.backendFocusField)
      if (target !== 'summary') open(target)
    }, [helpers.backendFocusField, helpers.backendFocusRequest, open])
  }

  return function useGuidedHabitFlow(options: Readonly<GuidedHabitFlowOptions>): GuidedHabitFlowState {
    const { form, helpers, mode, lockedGeneral, locale, timeZone, isOnline, watched } = options
    const today = getAccountDay(new Date(), timeZone)
    const [answers, setAnswers] = useState<HabitFlowAnswers>({ when: false, time: false })
    const [proposals, setProposals] = useState<GuidedHabitProposals>(NO_PROPOSALS)
    const [deliberateType, setDeliberateType] = useState<DeliberateType>(null)
    const controller = useFormController(options)
    const isGeneral = helpers.isGeneral
    const supportedLocale = resolveSupportedLocale(locale)
    const localRead = useMemo(() => readTypedHabitPhrase(watched.title, supportedLocale, deliberateType, isGeneral), [deliberateType, isGeneral, supportedLocale, watched.title])

    const applyRead = useCallback((read: HabitPhraseRead) => {
      controller.readPhrase(true, read)
      if (deliberateType === null && read.cadence !== null && form.getValues().itemType !== 'habit') helpers.chooseItemType('habit')
    }, [controller, deliberateType, form, helpers])
    useOpeningRead(mode, applyRead, localRead)

    const changeTitle = useCallback((value: string) => {
      form.setField('title', value)
      if (mode === 'edit') return
      const read = readTypedHabitPhrase(value, supportedLocale, deliberateType, isGeneral)
      applyRead(read)
      setAnswers((current) => resetCoveredAnswers(current, readPhraseCoverage(read, false)))
    }, [applyRead, deliberateType, form, isGeneral, mode, supportedLocale])

    const steps = remainingHabitFlowSteps({
      mode,
      hasDateOrRepeat: Boolean(watched.dueDate) || Boolean(watched.frequencyUnit) || Boolean(watched.isFlexible) || isGeneral,
      hasTime: Boolean(watched.dueTime),
      phraseGaveTime: localRead.dueTime !== null || proposals.time,
      whenLocked: lockedGeneral === true,
      undated: isGeneral,
      answers,
    })
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
    const { current, position, advance, back, open, replace } = useNavigation(mode, steps, answers)
    const live = useLiveFlow(current.step, answers, deliberateType)

    const port: HabitFlowFormPort = useMemo(() => ({
      setField: (field, value) => form.setField(field, value),
      chooseItemType: helpers.chooseItemType,
      setOneTime: helpers.setOneTime,
      setRecurring: helpers.setRecurring,
      setGeneral: helpers.setGeneral,
      setReminderEnabled: (enabled) => controller.setReminderEnabled(enabled),
    }), [controller, form, helpers])

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
    const chooseDate = useCallback((date: string) => {
      port.chooseItemType('task')
      port.setOneTime()
      port.setField('datePhrase', '')
      port.setField('dateIssue', '')
      port.setField('dueDate', date)
      setProposals((value) => ({ ...value, schedule: false }))
      answerStep('when')
    }, [answerStep, port])
    const readWhenWords = useCallback((text: string): 'past' | 'unresolved' | null => {
      const words = readHabitWhenWords(text, { referenceDate: today, locale, timeZone, language: supportedLocale, allowPast: mode === 'edit' })
      if (words.kind === 'date') { chooseDate(words.date); return null }
      if (words.kind !== 'repeat') return words.kind
      controller.readPhrase(true, words.read)
      port.chooseItemType('habit')
      answerStep('when')
      return null
    }, [answerStep, chooseDate, controller, locale, mode, port, supportedLocale, timeZone, today])
    const answerTime = useCallback((time: string | null) => {
      answerHabitTime(port, time)
      setProposals((value) => ({ ...value, time: false }))
      answerStep('time')
    }, [answerStep, port])
    const answerReminder = useCallback((remind: boolean) => {
      answerHabitReminder(port, remind)
      advance()
    }, [advance, port])
    const markTypeDeliberate = useCallback(() => setDeliberateType(form.getValues().itemType ?? null), [form])
    const chooseEmoji = useCallback((emoji: string) => {
      controller.setEmoji(emoji)
      setProposals((value) => ({ ...value, emoji: false }))
    }, [controller])

    const { leavePhrase, suggestEmoji, reading, usedAiRead } = usePhraseReads({ options, live, localRead, proposals, setProposals, advance, stepsAfter })
    useFieldErrorSteps(helpers, open)

    return {
      answers, answerReminder, chooseDate, chooseEmoji, changeTitle, controller, markTypeDeliberate, readWhenWords, answerTime, answerWhen, advance, back, current, leavePhrase,
      localRead, mode, offline: !isOnline, open, position, proposals, reading, replace, steps, suggestEmoji, today, usedAiRead,
    }
  }
}
