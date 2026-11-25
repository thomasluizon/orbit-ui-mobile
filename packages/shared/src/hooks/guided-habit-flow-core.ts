import type { z } from 'zod'
import type { HabitPhraseReadRequest, HabitPhraseReadResponse } from '../types/habit'
import type { SupportedLocale } from '../types/profile'
import { getAccountDay } from '../utils/dates'
import { phraseLeavesWordsUnread, readPhraseCoverage, remainingHabitFlowSteps, resetCoveredAnswers, type HabitFlowAnswers, type HabitFlowStepId } from '../utils/habit-flow'
import { answerHabitReminder, answerHabitTime, answerHabitWhen, formHoldsTimelessReminder, habitRepeatLacksStart, type HabitFlowFormPort, type HabitWhenChoice } from '../utils/habit-flow-answers'
import { guardHabitReadPatch, habitFlowFieldStep, readHabitPhraseDate, readHabitPhraseValues, readHabitWhenWords, type HabitPhraseDate } from '../utils/habit-flow-details'
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
import { habitPhraseRepeats, readTypedHabitPhrase, type HabitPhraseRead, type HabitPhraseSpan } from '../utils/habit-phrase-parser'
import { resolveSupportedLocale } from '../utils/locale-format'
import type { habitFormSchema } from '../validation'
import type { StateHook, StateSetter } from './state-adapter'

const CORE_ORDER: readonly HabitFlowStepKey[] = ['what', 'when', 'time', 'reminder', 'summary']
const PHRASE_STEP: HabitFlowStepKey = 'what'

type HabitFormInput = z.input<typeof habitFormSchema>
type DeliberateType = 'task' | 'habit' | null
type FlowTarget = HabitFlowDetailStep | HabitFlowStepId
const TIME_ANSWER_FIELDS = ['dueTime', 'dueEndTime', 'reminderEnabled', 'scheduledReminders', 'repeatReminder'] as const
const SCHEDULE_FIELDS = ['itemType', 'frequencyUnit', 'frequencyQuantity', 'isFlexible', 'days', 'monthDays', 'intervalWeeks'] as const
type ScheduleField = (typeof SCHEDULE_FIELDS)[number]

export interface GuidedHabitFlowAdapters {
  useState: StateHook
  useEffect: (effect: () => void | (() => void), dependencies?: readonly unknown[]) => void
  useMemo: <Value>(calculate: () => Value, dependencies: readonly unknown[]) => Value
  useCallback: <Callback extends (...args: never[]) => unknown>(callback: Callback, dependencies: readonly unknown[]) => Callback
  useRef: <Value>(initial: Value) => { current: Value }
}

/** The form writes and reads the flow needs. Each app builds it over its own form instance. */
export interface GuidedHabitFlowForm {
  getValues: () => Pick<HabitFormInput, 'title' | 'dueDate' | 'dueTime' | 'dueEndTime' | 'isGeneral' | 'emoji' | 'reminderEnabled' | 'scheduledReminders' | 'repeatReminder' | ScheduleField>
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

type GuidedHabitModeSwitches = Pick<GuidedHabitFlowHelpers, 'chooseItemType' | 'setOneTime' | 'setRecurring' | 'setFlexible' | 'setGeneral'>

export interface GuidedHabitFlowOptions {
  mode: 'create' | 'edit'
  lockedGeneral: boolean | null
  onReminderEnabledChange?: (enabled: boolean) => void
  onSlipAlertEnabledChange?: (enabled: boolean) => void
  /** The words of the phrase the form applied. The modal removes them from the title it saves, as the full form does. */
  onPhraseOwnershipChange?: (ownership: HabitPhraseFormOwnership) => void
  locale: string
  timeZone: string | null | undefined
  isOnline: boolean
  helpers: GuidedHabitFlowHelpers
  form: GuidedHabitFlowForm
  watched: Pick<HabitFormInput, 'title' | 'itemType' | 'dueDate' | 'dueTime' | 'frequencyUnit' | 'isFlexible'>
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
  /** Keeps the proposed repeat as the answer of the When step. */
  keepProposedWhen: () => void
  advance: (nextSteps?: readonly HabitFlowStepKey[], nextAnswers?: HabitFlowAnswers) => void
  back: () => boolean
  changeTitle: (value: string) => void
  chooseItemType: GuidedHabitModeSwitches['chooseItemType']
  chooseDate: (date: string) => void
  chooseEmoji: (emoji: string) => void
  controller: HabitFormController
  current: HabitFlowNavigation
  leavePhrase: () => Promise<void>
  localRead: HabitPhraseRead
  markTypeDeliberate: (type: 'task' | 'habit') => void
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
  switches: GuidedHabitModeSwitches
  live: { current: LiveFlow }
  localRead: HabitPhraseRead
  typedDate: HabitPhraseDate | null
  setProposals: StateSetter<GuidedHabitProposals>
  emojiChosen: { current: boolean }
  advance: (nextSteps?: readonly HabitFlowStepKey[], nextAnswers?: HabitFlowAnswers) => void
  stepsAfter: (nextAnswers: HabitFlowAnswers) => HabitFlowStepId[]
  startRepeat: () => void
}

interface FlowAnswerInput {
  options: Readonly<GuidedHabitFlowOptions>
  controller: HabitFormController
  port: HabitFlowFormPort
  today: string
  supportedLocale: ReturnType<typeof resolveSupportedLocale>
  readAnswers: () => HabitFlowAnswers
  setAnswers: StateSetter<HabitFlowAnswers>
  setProposals: StateSetter<GuidedHabitProposals>
  advance: (nextSteps?: readonly HabitFlowStepKey[], nextAnswers?: HabitFlowAnswers) => void
  stepsAfter: (nextAnswers: HabitFlowAnswers) => HabitFlowStepId[]
  startRepeat: () => void
  releasePhraseDate: () => void
}

function missedRead(): null {
  return null
}

function readSchedule(form: GuidedHabitFlowForm): string {
  const values = form.getValues()
  return JSON.stringify(SCHEDULE_FIELDS.map((field) => values[field] ?? null))
}

function clearTypedProposals(proposals: GuidedHabitProposals, read: HabitPhraseRead, typedDate: boolean): GuidedHabitProposals {
  const time = proposals.time && read.dueTime === null
  const schedule = proposals.schedule && !habitPhraseRepeats(read) && !typedDate
  return time === proposals.time && schedule === proposals.schedule ? proposals : { ...proposals, time, schedule }
}

/**
 * The state of the guided habit flow, shared by web and Android. It is a view over the form state the modal owns,
 * never a second form model: every answer writes the same fields the current form writes, so the request is the
 * same. Each app passes its React hooks, its form and its locale. A date typed in the phrase makes a task on that day
 * until a step sets the When. When the phrase loses the date, the date the flow opened with comes back.
 */
export function createUseGuidedHabitFlow({ useState, useEffect, useMemo, useCallback, useRef }: GuidedHabitFlowAdapters) {
  function useFormController({ form, helpers, watched, lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange, onPhraseOwnershipChange }: Readonly<GuidedHabitFlowOptions>, switches: GuidedHabitModeSwitches, deliberateType: DeliberateType, readAnswers: () => HabitFlowAnswers) {
    const ownership = useRef<HabitPhraseFormOwnership>({ cadence: false, dueTime: false })
    const frequencyUnit = watched.frequencyUnit
    const isFlexible = watched.isFlexible ?? false
    const ownPhraseDate = useCallback((span: HabitPhraseSpan | null) => {
      const held = ownership.current.date ?? null
      if (held?.start === span?.start && held?.end === span?.end) return
      ownership.current = { ...ownership.current, date: span }
      onPhraseOwnershipChange?.(ownership.current)
    }, [onPhraseOwnershipChange])
    const controller = useMemo(() => createHabitFormController({
      action: undefined,
      atLimit: false,
      lockedGeneral,
      onReminderEnabledChange,
      onSlipAlertEnabledChange,
      readsBareInterval: true,
      target: {
        hasSchedule: () => isFlexible || Boolean(frequencyUnit),
        getOwnership: () => ownership.current,
        setOwnership: (next) => {
          ownership.current = next
          onPhraseOwnershipChange?.(next)
        },
        updateProposal: () => {},
        setOneTime: () => {
          if (deliberateType === 'habit' || readAnswers().when) return
          if (form.getValues().itemType === 'habit') switches.chooseItemType('task')
          switches.setOneTime()
        },
        setRecurring: switches.setRecurring,
        setFlexible: switches.setFlexible,
        setGeneral: switches.setGeneral,
        setField: (field, value) => form.setField(field, value),
        toggleDay: helpers.toggleDay,
      },
    }), [deliberateType, form, helpers, readAnswers, switches, frequencyUnit, isFlexible, lockedGeneral, onPhraseOwnershipChange, onReminderEnabledChange, onSlipAlertEnabledChange])
    return { controller, ownPhraseDate }
  }

  function useLatestState<State>(initial: State): [State, StateSetter<State>, () => State] {
    const [state, setState] = useState<State>(initial)
    const latest = useRef(state)
    const read = useCallback(() => latest.current, [])
    const set: StateSetter<State> = useCallback((update) => {
      latest.current = typeof update === 'function' ? (update as (current: State) => State)(latest.current) : update
      setState(latest.current)
    }, [])
    return [state, set, read]
  }

  function useModeSwitches(form: GuidedHabitFlowForm, helpers: GuidedHabitFlowHelpers, setAnswers: StateSetter<HabitFlowAnswers>, readProposals: () => GuidedHabitProposals): GuidedHabitModeSwitches {
    return useMemo(() => {
      const hold = <Args extends unknown[]>(switchMode: (...args: Args) => void) => (...args: Args) => {
        const before = form.getValues()
        const held = TIME_ANSWER_FIELDS.map((field) => [field, before[field]] as const)
        const droppedTime = Boolean(before.dueTime)
        const wasGeneral = Boolean(before.isGeneral)
        const timeIsProposal = readProposals().time
        switchMode(...args)
        const after = form.getValues()
        if (wasGeneral || after.isGeneral) {
          if (droppedTime && !after.dueTime) setAnswers((value) => (value.time ? { ...value, time: false } : value))
          return
        }
        if (timeIsProposal) return
        for (const [field, value] of held) if (JSON.stringify(value ?? null) !== JSON.stringify(after[field] ?? null)) form.setField(field, value)
      }
      return {
        chooseItemType: hold(helpers.chooseItemType),
        setOneTime: hold(helpers.setOneTime),
        setRecurring: hold(helpers.setRecurring),
        setFlexible: hold(helpers.setFlexible),
        setGeneral: hold(helpers.setGeneral),
      }
    }, [form, helpers, readProposals, setAnswers])
  }

  function usePhraseDate(form: GuidedHabitFlowForm, port: HabitFlowFormPort, ownPhraseDate: (span: HabitPhraseSpan | null) => void) {
    const held = useRef<{ date: string; before: string } | null>(null)
    const holdPhraseDate = useCallback((found: HabitPhraseDate | null) => {
      const current = held.current
      if (found === null) {
        if (current === null) return
        held.current = null
        ownPhraseDate(null)
        if (form.getValues().dueDate === current.date) port.setField('dueDate', current.before)
        return
      }
      ownPhraseDate(found.span)
      if (current?.date === found.date) return
      held.current = { date: found.date, before: current ? current.before : form.getValues().dueDate ?? '' }
      port.chooseItemType('task')
      port.setOneTime()
      port.setField('datePhrase', '')
      port.setField('dateIssue', '')
      port.setField('dueDate', found.date)
    }, [form, ownPhraseDate, port])
    const releasePhraseDate = useCallback(() => {
      if (held.current === null) return
      held.current = null
      ownPhraseDate(null)
    }, [ownPhraseDate])
    return { holdPhraseDate, releasePhraseDate }
  }

  function useAnsweredScheduleController(controller: HabitFormController, setProposals: StateSetter<GuidedHabitProposals>, setAnswers: StateSetter<HabitFlowAnswers>, releasePhraseDate: () => void): HabitFormController {
    return useMemo(() => {
      const answered = () => {
        releasePhraseDate()
        setProposals((value) => (value.schedule ? { ...value, schedule: false } : value))
        setAnswers((value) => (value.when ? value : { ...value, when: true }))
      }
      return {
        ...controller,
        setScheduleMode: (flexible) => { answered(); controller.setScheduleMode(flexible) },
        setSchedule: (unit, quantity, flexible) => { answered(); controller.setSchedule(unit, quantity, flexible) },
        setRecurrence: (schedule) => { answered(); controller.setRecurrence(schedule) },
        toggleDay: (day, daily, selectedDays) => { answered(); controller.toggleDay(day, daily, selectedDays) },
        toggleMonthDay: (day, anchorDay, selectedMonthDays) => { answered(); controller.toggleMonthDay(day, anchorDay, selectedMonthDays) },
        setQuantity: (quantity) => { answered(); controller.setQuantity(quantity) },
        setIntervalWeeks: (intervalWeeks) => { answered(); controller.setIntervalWeeks(intervalWeeks) },
      }
    }, [controller, releasePhraseDate, setAnswers, setProposals])
  }

  function usePhraseOwnershipSync(controller: HabitFormController, title: string, itemType: HabitFormInput['itemType'], isGeneral: boolean, locale: SupportedLocale) {
    const last = useRef({ title, itemType, isGeneral })
    useEffect(() => {
      const previous = last.current
      last.current = { title, itemType, isGeneral }
      const stoppedRepeating = (itemType === 'task' && previous.itemType !== 'task') || (isGeneral && !previous.isGeneral)
      if (previous.title !== title || !stoppedRepeating) return
      controller.reconcilePhraseOwnership(readTypedHabitPhrase(title, locale, itemType, isGeneral))
    }, [controller, isGeneral, itemType, locale, title])
  }

  function useOpeningRead(mode: 'create' | 'edit', applyRead: (read: HabitPhraseRead, date: HabitPhraseDate | null) => void, localRead: HabitPhraseRead, typedDate: HabitPhraseDate | null) {
    const opened = useRef(false)
    useEffect(() => {
      if (opened.current) return
      opened.current = true
      if (mode === 'create') applyRead(localRead, typedDate)
    }, [applyRead, localRead, mode, typedDate])
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

  function useFlowAnswers({ options, controller, port, today, supportedLocale, readAnswers, setAnswers, setProposals, advance, stepsAfter, startRepeat, releasePhraseDate }: FlowAnswerInput) {
    const { form, mode, locale, timeZone } = options
    const answerStep = useCallback((answered: keyof HabitFlowAnswers, withTime = false) => {
      if (answered === 'when') releasePhraseDate()
      const nextAnswers = { ...readAnswers(), [answered]: true, ...(withTime ? { time: true } : {}) }
      setAnswers(nextAnswers)
      advance(stepsAfter(nextAnswers), nextAnswers)
    }, [advance, readAnswers, releasePhraseDate, setAnswers, stepsAfter])
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
      const phraseTime = form.getValues().dueTime
      controller.readPhrase(true, { ...words.read, dueTime: null })
      if (words.read.dueTime) controller.setDueTime(words.read.dueTime)
      else port.setField('dueTime', phraseTime ?? '')
      setProposals((value) => ({ ...value, schedule: false, time: words.read.dueTime ? false : value.time }))
      port.chooseItemType('habit')
      startRepeat()
      answerStep('when', words.read.dueTime !== null)
      return null
    }, [answerStep, chooseDate, controller, form, locale, mode, port, startRepeat, supportedLocale, timeZone, today])
    const keepProposedWhen = useCallback(() => {
      setProposals((value) => ({ ...value, schedule: false }))
      answerStep('when')
    }, [answerStep, setProposals])
    const answerTime = useCallback((time: string | null) => {
      controller.releaseDueTime()
      answerHabitTime(port, time, formHoldsTimelessReminder(form.getValues()))
      setProposals((value) => ({ ...value, time: false }))
      answerStep('time')
    }, [answerStep, controller, form, port])
    const answerReminder = useCallback((remind: boolean) => {
      answerHabitReminder(port, remind)
      advance()
    }, [advance, port])
    return { answerWhen, keepProposedWhen, chooseDate, readWhenWords, answerTime, answerReminder }
  }

  function useLiveFlow(step: HabitFlowStepKey, answers: HabitFlowAnswers, deliberateType: DeliberateType) {
    const live = useRef<LiveFlow>({ step, answers, deliberateType })
    useEffect(() => { live.current = { step, answers, deliberateType } }, [live, step, answers, deliberateType])
    return live
  }

  function usePhraseReads({ options, switches, live, localRead, typedDate, setProposals, emojiChosen, advance, stepsAfter, startRepeat }: PhraseReadInput) {
    const { form, mode, lockedGeneral, isOnline, locale, readPhrase, applySchedule, watched } = options
    const [reading, setReading] = useState(false)
    const [usedAiRead, setUsedAiRead] = useState(false)
    const lastReadPhrase = useRef<string | null>(null)
    const leaving = useRef(false)
    const title = watched.title
    const hasDate = Boolean(watched.dueDate)

    const applyFreeRead = useCallback((response: HabitPhraseReadResponse, typed: ReturnType<typeof readHabitPhraseValues>) => {
      const { answers, deliberateType } = live.current
      const { dueTime: timeBefore, dueEndTime, emoji: emojiBefore, isGeneral } = form.getValues()
      const patch = guardHabitReadPatch(buildHabitFormPatchFromSuggestion(response), {
        deliberateType,
        whenSet: answers.when,
        timeSet: answers.time || Boolean(dueEndTime),
        emojiSet: emojiChosen.current,
        typed,
        undated: lockedGeneral === true || isGeneral === true,
      })
      const scheduleBefore = readSchedule(form)
      if (patch.mode !== 'oneTime' && deliberateType === null && form.getValues().itemType !== 'habit') switches.chooseItemType('habit')
      applySchedule(patch)
      const { dueTime: timeAfter, emoji: emojiAfter } = form.getValues()
      const gaveSchedule = patch.mode !== 'oneTime' && readSchedule(form) !== scheduleBefore
      const gaveTime = Boolean(timeAfter) && timeAfter !== timeBefore
      const gaveEmoji = Boolean(emojiAfter) && emojiAfter !== emojiBefore
      setUsedAiRead(true)
      setProposals((value) => ({
        schedule: gaveSchedule || value.schedule,
        time: gaveTime || (value.time && timeAfter === timeBefore),
        emoji: gaveEmoji || (value.emoji && emojiAfter === emojiBefore),
      }))
    }, [applySchedule, emojiChosen, form, live, lockedGeneral, setProposals, switches])

    const leavePhrase = useCallback(async () => {
      if (leaving.current) return
      const phrase = title.trim()
      const asksReader = mode === 'create' && isOnline && phrase !== lastReadPhrase.current && phraseLeavesWordsUnread(phrase, localRead, hasDate)
      if (!asksReader) { startRepeat(); advance(stepsAfter(live.current.answers)); return }
      lastReadPhrase.current = phrase
      leaving.current = true
      setReading(true)
      const response = await readPhrase({ phrase, language: locale }).catch(missedRead)
      leaving.current = false
      setReading(false)
      if (form.getValues().title.trim() !== phrase || live.current.step !== PHRASE_STEP) return
      if (response) applyFreeRead(response, readHabitPhraseValues(phrase, localRead, typedDate))
      startRepeat()
      advance(stepsAfter(live.current.answers))
    }, [advance, applyFreeRead, form, hasDate, isOnline, live, locale, localRead, mode, readPhrase, startRepeat, stepsAfter, title, typedDate])

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
    const [answers, setAnswers, readAnswers] = useLatestState<HabitFlowAnswers>({ when: false, time: false })
    const [proposals, setProposals, readProposals] = useLatestState<GuidedHabitProposals>(NO_PROPOSALS)
    const [deliberateType, setDeliberateType] = useState<DeliberateType>(null)
    const switches = useModeSwitches(form, helpers, setAnswers, readProposals)
    const { controller, ownPhraseDate } = useFormController(options, switches, deliberateType, readAnswers)
    const isGeneral = helpers.isGeneral
    const supportedLocale = resolveSupportedLocale(locale)
    const localRead = useMemo(() => readTypedHabitPhrase(watched.title, supportedLocale, deliberateType, isGeneral), [deliberateType, isGeneral, supportedLocale, watched.title])
    const readDate = useCallback((title: string, read: HabitPhraseRead) => {
      const dated = mode === 'create' && deliberateType !== 'habit' && !isGeneral && lockedGeneral !== true
      return dated ? readHabitPhraseDate(title, read, { referenceDate: today, locale, timeZone }) : null
    }, [deliberateType, isGeneral, locale, lockedGeneral, mode, timeZone, today])
    const typedDate = useMemo(() => readDate(watched.title, localRead), [localRead, readDate, watched.title])

    const port: HabitFlowFormPort = useMemo(() => ({
      setField: (field, value) => form.setField(field, value),
      chooseItemType: switches.chooseItemType,
      setOneTime: switches.setOneTime,
      setRecurring: switches.setRecurring,
      setGeneral: switches.setGeneral,
      setReminderEnabled: (enabled) => controller.setReminderEnabled(enabled),
    }), [controller, form, switches])
    const { holdPhraseDate, releasePhraseDate } = usePhraseDate(form, port, ownPhraseDate)

    const applyRead = useCallback((read: HabitPhraseRead, date: HabitPhraseDate | null) => {
      controller.readPhrase(true, read)
      if (deliberateType === null && habitPhraseRepeats(read) && form.getValues().itemType !== 'habit') switches.chooseItemType('habit')
      holdPhraseDate(date)
    }, [controller, deliberateType, form, holdPhraseDate, switches])
    useOpeningRead(mode, applyRead, localRead, typedDate)
    usePhraseOwnershipSync(controller, watched.title, watched.itemType, isGeneral, supportedLocale)

    const changeTitle = useCallback((value: string) => {
      form.setField('title', value)
      if (mode === 'edit') return
      const read = readTypedHabitPhrase(value, supportedLocale, deliberateType, isGeneral)
      const date = readDate(value, read)
      applyRead(read, date)
      setAnswers((current) => resetCoveredAnswers(current, readPhraseCoverage(read, date !== null)))
      setProposals((current) => clearTypedProposals(current, read, date !== null))
    }, [applyRead, deliberateType, form, isGeneral, mode, readDate, supportedLocale])

    const steps = remainingHabitFlowSteps({
      mode,
      hasDateOrRepeat: isGeneral || readPhraseCoverage(localRead, typedDate !== null).coversDateOrRepeat,
      hasTime: Boolean(watched.dueTime) && !proposals.time,
      phraseGaveTime: localRead.dueTime !== null,
      whenLocked: lockedGeneral === true,
      undated: isGeneral,
      answers,
    })
    const stepsAfter = useCallback((nextAnswers: HabitFlowAnswers) => {
      const values = form.getValues()
      const guessed = readProposals()
      const read = readTypedHabitPhrase(values.title, supportedLocale, deliberateType, Boolean(values.isGeneral))
      return remainingHabitFlowSteps({
        mode,
        hasDateOrRepeat: Boolean(values.isGeneral) || readPhraseCoverage(read, readDate(values.title, read) !== null).coversDateOrRepeat,
        hasTime: Boolean(values.dueTime) && !guessed.time,
        phraseGaveTime: read.dueTime !== null,
        whenLocked: lockedGeneral === true,
        undated: Boolean(values.isGeneral),
        answers: nextAnswers,
      })
    }, [deliberateType, form, lockedGeneral, mode, readDate, readProposals, supportedLocale])
    const { current, position, advance, back, open, replace } = useNavigation(mode, steps, answers)
    const live = useLiveFlow(current.step, answers, deliberateType)

    const startRepeat = useCallback(() => {
      if (habitRepeatLacksStart(form.getValues())) form.setField('dueDate', today)
    }, [form, today])
    const { answerWhen, keepProposedWhen, chooseDate, readWhenWords, answerTime, answerReminder } = useFlowAnswers({ options, controller, port, today, supportedLocale, readAnswers, setAnswers, setProposals, advance, stepsAfter, startRepeat, releasePhraseDate })
    const markTypeDeliberate = useCallback((type: 'task' | 'habit') => {
      if (form.getValues().itemType !== type) setProposals((value) => (value.schedule ? { ...value, schedule: false } : value))
      setDeliberateType(type)
    }, [form])
    const emojiChosen = useRef(false)
    const chooseEmoji = useCallback((emoji: string) => {
      emojiChosen.current = true
      controller.setEmoji(emoji)
      setProposals((value) => ({ ...value, emoji: false }))
    }, [controller])

    const { leavePhrase, suggestEmoji, reading, usedAiRead } = usePhraseReads({ options, switches, live, localRead, typedDate, setProposals, emojiChosen, advance, stepsAfter, startRepeat })
    useFieldErrorSteps(helpers, open)
    const answeredController = useAnsweredScheduleController(controller, setProposals, setAnswers, releasePhraseDate)
    const shownProposals = useMemo(() => (proposals.time && !watched.dueTime ? { ...proposals, time: false } : proposals), [proposals, watched.dueTime])

    return {
      answers, answerReminder, keepProposedWhen, chooseDate, chooseEmoji, chooseItemType: switches.chooseItemType, changeTitle, controller: answeredController, markTypeDeliberate, readWhenWords, answerTime, answerWhen, advance, back, current, leavePhrase,
      localRead, mode, offline: !isOnline, open, position, proposals: shownProposals, reading, replace, steps, suggestEmoji, today, usedAiRead,
    }
  }
}
