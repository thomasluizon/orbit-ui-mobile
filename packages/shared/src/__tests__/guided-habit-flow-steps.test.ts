import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUseGuidedHabitFlow, type GuidedHabitFlowForm, type GuidedHabitFlowHelpers, type GuidedHabitFlowOptions } from '../hooks/guided-habit-flow-core'
import type { HabitPhraseReadResponse } from '../types/habit'
import type { HabitPhraseFormOwnership } from '../utils/habit-form-helpers'
import { getHabitPhraseTitle } from '../utils/habit-phrase-title'

const useGuidedHabitFlow = createUseGuidedHabitFlow({ useState, useEffect, useMemo, useCallback, useRef })
const TODAY = '2026-11-13'
const TOMORROW = '2026-11-14'
const NO_READ: HabitPhraseReadResponse = { read: false, emoji: null, frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] }

type Values = Record<string, unknown> & ReturnType<GuidedHabitFlowForm['getValues']>
interface Setup {
  mode?: 'create' | 'edit'
  lockedGeneral?: boolean | null
  online?: boolean
  values?: Partial<Values>
  readPhrase?: GuidedHabitFlowOptions['readPhrase']
}

function mountFlow({ mode = 'create', lockedGeneral = null, online = true, values: initial = {}, readPhrase = vi.fn(async () => NO_READ) }: Setup = {}) {
  const values: Values = { title: '', dueDate: '', dueTime: '', frequencyUnit: undefined, isFlexible: false, isGeneral: false, itemType: 'task', emoji: '', ...initial }
  const backend: { request: number; field: 'title' | 'description' | undefined } = { request: 0, field: undefined }
  const reminder = vi.fn<(enabled: boolean) => void>()
  const ownership = vi.fn<(next: HabitPhraseFormOwnership) => void>()
  let render = () => {}
  const write = (change: Partial<Values>) => { Object.assign(values, change); render() }
  const form: GuidedHabitFlowForm = { getValues: () => values, setField: (field, value) => write({ [field]: value }) }
  const helpers: GuidedHabitFlowHelpers = {
    get isGeneral() { return values.isGeneral === true },
    get backendFocusRequest() { return backend.request },
    get backendFocusField() { return backend.field },
    toggleDay: () => {},
    chooseItemType: (itemType) => write({ itemType }),
    setOneTime: () => write({ isGeneral: false, isFlexible: false, frequencyUnit: null, frequencyQuantity: null }),
    setRecurring: () => write({ isGeneral: false, isFlexible: false, frequencyUnit: values.frequencyUnit ?? 'Day' }),
    setFlexible: () => write({ isGeneral: false, isFlexible: true, frequencyUnit: values.frequencyUnit ?? 'Week' }),
    setGeneral: () => write({ isGeneral: true, isFlexible: false, frequencyUnit: null, dueTime: '', dueDate: '' }),
  }
  const applySchedule: GuidedHabitFlowOptions['applySchedule'] = (patch) => {
    const before = JSON.stringify(values)
    if (patch.mode !== 'oneTime') write({ frequencyUnit: patch.frequencyUnit ?? undefined, frequencyQuantity: patch.frequencyQuantity, isFlexible: patch.mode === 'flexible' })
    const days = (values.days ?? []) as string[]
    const sameDays = days.length === patch.days.length && patch.days.every((day) => days.includes(day))
    if (patch.mode === 'recurring' && !sameDays) write({ days: patch.days })
    if (patch.dueTime) write({ dueTime: patch.dueTime })
    if (patch.emoji) write({ emoji: patch.emoji })
    return JSON.stringify(values) !== before
  }
  let flow!: ReturnType<typeof useGuidedHabitFlow>
  function FlowProbe() {
    const [, setVersion] = useState(0)
    render = () => setVersion((version) => version + 1)
    flow = useGuidedHabitFlow({
      mode, lockedGeneral, locale: 'en', timeZone: 'UTC', isOnline: online, helpers: { ...helpers, isGeneral: helpers.isGeneral, backendFocusRequest: backend.request, backendFocusField: backend.field },
      form, readPhrase, applySchedule, onReminderEnabledChange: reminder, onPhraseOwnershipChange: ownership,
      watched: { title: values.title, itemType: values.itemType, dueDate: values.dueDate, dueTime: values.dueTime, frequencyUnit: values.frequencyUnit, isFlexible: values.isFlexible },
    })
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(FlowProbe)) })
  return {
    values, reminder, ownership, readPhrase,
    get flow() { return flow },
    chooseTypeOnTheTypeStep: (itemType: 'task' | 'habit') => { void act(() => { flow.markTypeDeliberate(itemType); helpers.chooseItemType(itemType) }) },
    clearTime: () => { void act(() => write({ dueTime: '' })) },
    setDurationOnTheDurationStep: (dueEndTime: string) => { void act(() => write({ dueEndTime })) },
    refuseField: (field: 'title' | 'description') => { void act(() => { backend.request += 1; backend.field = field; render() }) },
    unmount: () => { void act(() => tree.unmount()) },
  }
}

type Mounted = ReturnType<typeof mountFlow>
const run = (step: () => void) => { void act(step) }
async function leavePhraseWith(mounted: Mounted, phrase: string) {
  run(() => mounted.flow.changeTitle(phrase))
  await act(async () => { await mounted.flow.leavePhrase() })
}

describe('the steps of the shared guided habit flow', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${TODAY}T12:00:00Z`) })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('starts a repeat the phrase gave on the account day, skips the date and the time questions and reports the words the form applied', async () => {
    const mounted = mountFlow()
    await leavePhraseWith(mounted, 'call John every day at 8am')
    expect(mounted.readPhrase).not.toHaveBeenCalled()
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '08:00', dueDate: TODAY })
    expect(mounted.flow.steps).toEqual(['what', 'reminder', 'summary'])
    expect(mounted.flow.current.step).toBe('reminder')
    expect(mounted.flow.position).toEqual({ position: 2, total: 3 })
    expect(mounted.ownership).toHaveBeenLastCalledWith({ cadence: true, dueTime: true })
    mounted.unmount()
  })

  it('keeps the date the flow opened with when the phrase gives a repeat', async () => {
    const mounted = mountFlow({ values: { dueDate: '2026-12-01' } })
    await leavePhraseWith(mounted, 'call John every day')
    expect(mounted.values).toMatchObject({ frequencyUnit: 'Day', dueDate: '2026-12-01' })
    mounted.unmount()
  })

  it('starts a repeat the free read gave on the account day, and marks the schedule and the time as proposals', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00', emoji: '🪴' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    expect(readPhrase).toHaveBeenCalledExactlyOnceWith({ phrase: 'water the plants', language: 'en' })
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueTime: '07:00', dueDate: TODAY, emoji: '🪴' })
    expect(mounted.flow.proposals).toEqual({ schedule: true, time: true, emoji: true })
    expect(mounted.flow.usedAiRead).toBe(true)
    expect(mounted.flow.current.step).toBe('reminder')
    mounted.unmount()
  })

  it('asks the questions that remain, with no error, when the free read fails', async () => {
    const mounted = mountFlow({ readPhrase: vi.fn(async () => { throw new Error('offline') }) })
    await leavePhraseWith(mounted, 'water the plants')
    expect(mounted.flow.reading).toBe(false)
    expect(mounted.flow.usedAiRead).toBe(false)
    expect(mounted.flow.current.step).toBe('when')
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '' })
    mounted.unmount()
  })

  it('never asks the reader offline, and says the flow is offline', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'water the plants')
    await act(async () => { await mounted.flow.suggestEmoji() })
    expect(mounted.readPhrase).not.toHaveBeenCalled()
    expect(mounted.flow.offline).toBe(true)
    expect(mounted.flow.current.step).toBe('when')
    mounted.unmount()
  })

  it.each([
    ['today', { itemType: 'task', dueDate: TODAY, frequencyUnit: null }],
    ['tomorrow', { itemType: 'task', dueDate: TOMORROW, frequencyUnit: null }],
    ['everyDay', { itemType: 'habit', dueDate: TODAY, frequencyUnit: 'Day', frequencyQuantity: 1 }],
  ] as const)('writes the %s answer of the date question and moves to the time question', async (choice, written) => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    run(() => mounted.flow.answerWhen(choice))
    expect(mounted.values).toMatchObject(written)
    expect(mounted.flow.answers).toEqual({ when: true, time: false })
    expect(mounted.flow.current.step).toBe('time')
    mounted.unmount()
  })

  it('keeps an item with no date in General, with no time question after it', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    run(() => mounted.flow.answerWhen('noDate'))
    expect(mounted.values).toMatchObject({ itemType: 'task', isGeneral: true, dueDate: '' })
    expect(mounted.flow.steps).toEqual(['what', 'when', 'summary'])
    expect(mounted.flow.current.step).toBe('summary')
    mounted.unmount()
  })

  it('makes a task for the day the words of the date question name', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    let outcome: ReturnType<Mounted['flow']['readWhenWords']> = 'unresolved'
    run(() => { outcome = mounted.flow.readWhenWords('tomorrow') })
    expect(outcome).toBeNull()
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: TOMORROW, datePhrase: '', dateIssue: '' })
    expect(mounted.flow.answers.when).toBe(true)
    expect(mounted.flow.current.step).toBe('time')
    mounted.unmount()
  })

  it('gives the repeat of the date question its start day', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    let outcome: ReturnType<Mounted['flow']['readWhenWords']> = 'unresolved'
    run(() => { outcome = mounted.flow.readWhenWords('every day') })
    expect(outcome).toBeNull()
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: TODAY })
    expect(mounted.flow.current.step).toBe('time')
    mounted.unmount()
  })

  it('keeps the time of the phrase when the repeat of the date question carries no time', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John at 8am')
    expect(mounted.flow.current.step).toBe('when')
    run(() => { mounted.flow.readWhenWords('every day') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueDate: TODAY, dueTime: '08:00' })
    expect(mounted.ownership).toHaveBeenLastCalledWith({ cadence: true, dueTime: true })
    mounted.unmount()
  })

  it('takes the time of the date words as a time answer and releases the time words of the phrase', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John at 8am')
    run(() => { mounted.flow.readWhenWords('every day at 9am') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueDate: TODAY, dueTime: '09:00' })
    expect(mounted.ownership).toHaveBeenLastCalledWith({ cadence: true, dueTime: false })
    mounted.unmount()
  })

  it('takes the time of the date words over a time the free read proposed, and stops marking that time as a proposal', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, dueTime: '07:00' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    expect(mounted.flow.current.step).toBe('when')
    expect(mounted.flow.proposals.time).toBe(true)
    run(() => { mounted.flow.readWhenWords('every day at 9am') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueTime: '09:00' })
    expect(mounted.flow.proposals.time).toBe(false)
    mounted.unmount()
  })

  it('keeps a time the free read proposed as a proposal when the date words carry no time, and stops marking the repeat as a proposal', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    expect(mounted.flow.proposals).toMatchObject({ schedule: true, time: true })
    run(() => mounted.flow.open('when'))
    run(() => { mounted.flow.readWhenWords('every monday') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', days: ['Monday'], dueTime: '07:00' })
    expect(mounted.flow.proposals).toMatchObject({ schedule: false, time: true })
    mounted.unmount()
  })

  it('stops marking a repeat the free read proposed as a proposal when the person changes it on the repeat step', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    expect(mounted.flow.proposals).toMatchObject({ schedule: true, time: true })
    run(() => mounted.flow.open('repeat'))
    run(() => mounted.flow.controller.setSchedule('Week', 1, false))
    expect(mounted.values).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1 })
    expect(mounted.flow.proposals).toMatchObject({ schedule: false, time: true })
    run(() => mounted.flow.controller.setScheduleMode(true))
    expect(mounted.flow.proposals).toMatchObject({ schedule: false, time: true })
    mounted.unmount()
  })

  it('never marks an empty time as a proposal, as when a change to a one-time task clears the time the free read proposed', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    expect(mounted.flow.proposals).toMatchObject({ schedule: true, time: true })
    mounted.clearTime()
    expect(mounted.flow.proposals).toMatchObject({ schedule: true, time: false })
    mounted.unmount()
  })

  it('stops marking a time the free read proposed when the person types a time in the title on the summary, and keeps the repeat mark', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    expect(mounted.flow.proposals).toMatchObject({ schedule: true, time: true })
    run(() => mounted.flow.open('what'))
    await leavePhraseWith(mounted, 'water the plants at 9am')
    expect(readPhrase).toHaveBeenCalledTimes(1)
    expect(mounted.values.dueTime).toBe('09:00')
    expect(mounted.flow.proposals).toMatchObject({ schedule: true, time: false })
    mounted.unmount()
  })

  it('stops marking a time and a repeat the free read proposed when the person types both in the title on the summary', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    run(() => mounted.flow.open('what'))
    await leavePhraseWith(mounted, 'water the plants every monday at 9am')
    expect(readPhrase).toHaveBeenCalledTimes(1)
    expect(mounted.values).toMatchObject({ frequencyUnit: 'Day', days: ['Monday'], dueTime: '09:00' })
    expect(mounted.flow.proposals).toMatchObject({ schedule: false, time: false })
    mounted.unmount()
  })

  it('never brings back the time mark for a time the person types after a change to a one-time task cleared the proposed time', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    mounted.clearTime()
    expect(mounted.flow.proposals.time).toBe(false)
    run(() => mounted.flow.open('what'))
    await leavePhraseWith(mounted, 'water the plants at 9am')
    expect(mounted.values.dueTime).toBe('09:00')
    expect(mounted.flow.proposals.time).toBe(false)
    mounted.unmount()
  })

  it('keeps the date question open for words it cannot read and for a day in the past', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    let unread: ReturnType<Mounted['flow']['readWhenWords']> = null
    let past: ReturnType<Mounted['flow']['readWhenWords']> = null
    run(() => { unread = mounted.flow.readWhenWords('zzz') })
    run(() => { past = mounted.flow.readWhenWords('2026-11-01') })
    expect(unread).toBe('unresolved')
    expect(past).toBe('past')
    expect(mounted.values.dueDate).toBe('')
    expect(mounted.flow.current.step).toBe('when')
    mounted.unmount()
  })

  it('asks for the reminder after a time, and turns the reminder off with no set time', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    run(() => mounted.flow.answerWhen('today'))
    run(() => mounted.flow.answerTime('14:00'))
    expect(mounted.values.dueTime).toBe('14:00')
    expect(mounted.flow.current.step).toBe('reminder')
    run(() => mounted.flow.answerReminder(true))
    expect(mounted.reminder).toHaveBeenLastCalledWith(true)
    expect(mounted.flow.current.step).toBe('summary')

    run(() => mounted.flow.open('time'))
    expect(mounted.flow.current).toMatchObject({ step: 'time', trail: ['summary'] })
    run(() => mounted.flow.answerTime(null))
    expect(mounted.values).toMatchObject({ dueTime: '', dueEndTime: '' })
    expect(mounted.reminder).toHaveBeenLastCalledWith(false)
    expect(mounted.flow.current).toMatchObject({ step: 'summary', trail: [] })
    mounted.unmount()
  })

  it('releases the time words of the phrase when the person answers another time', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John every day at 8am')
    expect(mounted.ownership).toHaveBeenLastCalledWith({ cadence: true, dueTime: true })
    run(() => mounted.flow.answerReminder(false))
    run(() => mounted.flow.open('time'))
    run(() => mounted.flow.answerTime('14:00'))
    expect(mounted.ownership).toHaveBeenLastCalledWith({ cadence: true, dueTime: false })
    expect(mounted.values.dueTime).toBe('14:00')
    mounted.unmount()
  })

  it('resets the answers a new phrase covers and keeps the others', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    run(() => mounted.flow.answerWhen('today'))
    run(() => mounted.flow.answerTime(null))
    expect(mounted.flow.answers).toEqual({ when: true, time: true })
    run(() => mounted.flow.changeTitle('call John at 9am'))
    expect(mounted.flow.answers).toEqual({ when: true, time: false })
    expect(mounted.values.dueTime).toBe('09:00')
    mounted.unmount()
  })

  it('goes back through the answered steps, opens a detail step from the summary and returns to it', async () => {
    const mounted = mountFlow({ online: false })
    expect(mounted.flow.back()).toBe(false)
    await leavePhraseWith(mounted, 'call John')
    run(() => mounted.flow.answerWhen('today'))
    run(() => { expect(mounted.flow.back()).toBe(true) })
    expect(mounted.flow.current).toMatchObject({ step: 'when', direction: -1 })
    expect(mounted.values.dueDate).toBe(TODAY)

    run(() => mounted.flow.advance())
    run(() => mounted.flow.answerTime(null))
    expect(mounted.flow.current.step).toBe('summary')
    run(() => mounted.flow.open('more'))
    run(() => mounted.flow.replace('optional:tags'))
    expect(mounted.flow.current).toMatchObject({ step: 'optional:tags', trail: ['summary'] })
    expect(mounted.flow.position).toEqual({ position: 4, total: 4 })
    run(() => { expect(mounted.flow.back()).toBe(true) })
    expect(mounted.flow.current.step).toBe('summary')
    mounted.unmount()
  })

  it('keeps an emoji the person chose as an answer, and an emoji the reader suggested as a proposal', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, emoji: '🪴' }))
    const mounted = mountFlow({ readPhrase })
    run(() => mounted.flow.changeTitle('water the plants'))
    await act(async () => { await mounted.flow.suggestEmoji() })
    expect(mounted.values.emoji).toBe('🪴')
    expect(mounted.flow.proposals.emoji).toBe(true)
    run(() => mounted.flow.chooseEmoji('💧'))
    expect(mounted.values.emoji).toBe('💧')
    expect(mounted.flow.proposals.emoji).toBe(false)
    mounted.unmount()
  })

  it('never marks a repeat the person typed as a proposal when the free read gives the same repeat and an emoji', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], emoji: '🪴' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants every monday')
    expect(readPhrase).toHaveBeenCalledOnce()
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', emoji: '🪴' })
    expect(mounted.flow.proposals).toEqual({ schedule: false, time: false, emoji: true })
    mounted.unmount()
  })

  it('never marks the days the person typed as a proposal when the free read gives the same days in another order', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Thursday', 'Monday'], emoji: '🪴' }))
    const mounted = mountFlow({ readPhrase })
    run(() => mounted.flow.changeTitle('water the plants every monday and thursday'))
    expect(mounted.values.days).toEqual(['Monday', 'Thursday'])
    await act(async () => { await mounted.flow.leavePhrase() })
    expect(readPhrase).toHaveBeenCalledOnce()
    expect(mounted.values).toMatchObject({ frequencyUnit: 'Day', days: ['Monday', 'Thursday'], emoji: '🪴' })
    expect(mounted.flow.proposals).toEqual({ schedule: false, time: false, emoji: true })
    mounted.unmount()
  })

  it('keeps the marks of the values a second free read gives again with no change', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00', emoji: '🪴' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    expect(mounted.flow.proposals).toEqual({ schedule: true, time: true, emoji: true })
    while (mounted.flow.current.step !== 'what') run(() => { expect(mounted.flow.back()).toBe(true) })
    await leavePhraseWith(mounted, 'water my plants')
    expect(readPhrase).toHaveBeenCalledTimes(2)
    expect(mounted.flow.proposals).toEqual({ schedule: true, time: true, emoji: true })
    mounted.unmount()
  })

  it('opens the step that owns a field the server refused', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    run(() => mounted.flow.answerWhen('noDate'))
    expect(mounted.flow.current.step).toBe('summary')
    mounted.refuseField('description')
    expect(mounted.flow.current).toMatchObject({ step: 'optional:description', trail: ['summary'] })
    mounted.unmount()
  })

  it('opens an edit on the summary and leaves the stored schedule as it is when the title changes', () => {
    const mounted = mountFlow({ mode: 'edit', values: { title: 'Read', itemType: 'habit', frequencyUnit: 'Week', dueDate: '2026-11-02', dueTime: '21:00' } })
    expect(mounted.flow.steps).toEqual(['summary'])
    expect(mounted.flow.current.step).toBe('summary')
    run(() => mounted.flow.changeTitle('Read every day at 8am'))
    expect(mounted.values).toMatchObject({ title: 'Read every day at 8am', frequencyUnit: 'Week', dueTime: '21:00', dueDate: '2026-11-02' })
    expect(mounted.ownership).not.toHaveBeenCalled()
    mounted.unmount()
  })

  it('keeps a child of a General parent undated: no date question, no time question and no start day', async () => {
    const mounted = mountFlow({ lockedGeneral: true, online: false })
    await leavePhraseWith(mounted, 'call John every day at 8am')
    expect(mounted.values).toMatchObject({ isGeneral: true, dueDate: '' })
    expect(mounted.flow.steps).toEqual(['what', 'summary'])
    expect(mounted.flow.current.step).toBe('summary')
    mounted.unmount()
  })

  it('keeps a child of a General parent undated when the free read proposes a repeat and a time, and marks only the emoji', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00', emoji: '🪴' }))
    const mounted = mountFlow({ lockedGeneral: true, readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    expect(readPhrase).toHaveBeenCalledOnce()
    expect(mounted.values).toMatchObject({ isGeneral: true, itemType: 'task', dueDate: '', dueTime: '', emoji: '🪴' })
    expect(mounted.values.frequencyUnit ?? null).toBeNull()
    expect(mounted.flow.proposals).toEqual({ schedule: false, time: false, emoji: true })
    expect(mounted.flow.current.step).toBe('summary')
    mounted.unmount()
  })

  it('keeps the day the person answered when a later free read of the phrase proposes a repeat', async () => {
    const readPhrase = vi.fn<GuidedHabitFlowOptions['readPhrase']>()
      .mockResolvedValueOnce(NO_READ)
      .mockResolvedValueOnce({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00', emoji: '📞' })
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'call mom')
    run(() => mounted.flow.answerWhen('tomorrow'))
    run(() => mounted.flow.answerTime(null))
    expect(mounted.flow.current.step).toBe('summary')
    run(() => mounted.flow.open('what'))
    await leavePhraseWith(mounted, 'call mom and ask about the trip')
    expect(readPhrase).toHaveBeenCalledTimes(2)
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: TOMORROW, dueTime: '', emoji: '📞' })
    expect(mounted.values.frequencyUnit ?? null).toBeNull()
    expect(mounted.flow.answers).toEqual({ when: true, time: true })
    expect(mounted.flow.proposals).toEqual({ schedule: false, time: false, emoji: true })
    expect(mounted.flow.current.step).toBe('summary')
    mounted.unmount()
  })

  it('keeps the repeat the person answered when a later free read of the phrase proposes another repeat', async () => {
    const readPhrase = vi.fn<GuidedHabitFlowOptions['readPhrase']>()
      .mockResolvedValueOnce(NO_READ)
      .mockResolvedValueOnce({ ...NO_READ, read: true, frequencyUnit: 'Week', frequencyQuantity: 1, days: ['Monday'] })
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'call mom')
    run(() => mounted.flow.answerWhen('everyDay'))
    run(() => mounted.flow.answerTime(null))
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueDate: TODAY })
    run(() => mounted.flow.open('what'))
    await leavePhraseWith(mounted, 'call mom and ask about the trip')
    expect(readPhrase).toHaveBeenCalledTimes(2)
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueDate: TODAY })
    expect(mounted.values.days ?? []).toEqual([])
    expect(mounted.flow.proposals).toEqual({ schedule: false, time: false, emoji: false })
    mounted.unmount()
  })

  it('takes the time a later free read proposes when the person answered the day but not the time', async () => {
    const readPhrase = vi.fn<GuidedHabitFlowOptions['readPhrase']>()
      .mockResolvedValueOnce(NO_READ)
      .mockResolvedValueOnce({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' })
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'call mom')
    run(() => mounted.flow.answerWhen('tomorrow'))
    expect(mounted.flow.current.step).toBe('time')
    run(() => { expect(mounted.flow.back()).toBe(true) })
    run(() => { expect(mounted.flow.back()).toBe(true) })
    expect(mounted.flow.current.step).toBe('what')
    await leavePhraseWith(mounted, 'call mom and ask about the trip')
    expect(readPhrase).toHaveBeenCalledTimes(2)
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: TOMORROW, dueTime: '07:00' })
    expect(mounted.values.frequencyUnit ?? null).toBeNull()
    expect(mounted.flow.proposals).toEqual({ schedule: false, time: true, emoji: false })
    mounted.unmount()
  })

  it('keeps the type the person set on the summary when the phrase changes after it', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    run(() => mounted.flow.answerWhen('today'))
    mounted.chooseTypeOnTheTypeStep('task')
    run(() => mounted.flow.changeTitle('call John every day'))
    expect(mounted.values.itemType).toBe('task')
    mounted.unmount()
  })

  it('records the type the person chooses on the type step, not the type before it, so a repeat typed after a change to a habit is read', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John')
    run(() => mounted.flow.answerWhen('today'))
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: TODAY })
    mounted.chooseTypeOnTheTypeStep('habit')
    run(() => mounted.flow.changeTitle('call John every monday'))
    expect(mounted.values).toMatchObject({ itemType: 'habit', days: ['Monday'] })
    mounted.unmount()
  })

  it('records a change from a habit to a task on the type step, so a repeat typed after it does not make the task a habit again', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call John every day')
    expect(mounted.values.itemType).toBe('habit')
    mounted.chooseTypeOnTheTypeStep('task')
    run(() => mounted.flow.changeTitle('call John every monday'))
    expect(mounted.values.itemType).toBe('task')
    expect(mounted.values.days ?? []).toEqual([])
    mounted.unmount()
  })

  it('stops marking a repeat the free read proposed as a proposal when the person changes the type, and keeps the mark when the type stays', async () => {
    const readPhrase = vi.fn(async (): Promise<HabitPhraseReadResponse> => ({ ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' }))
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    expect(mounted.values.itemType).toBe('habit')
    expect(mounted.flow.proposals).toMatchObject({ schedule: true, time: true })
    mounted.chooseTypeOnTheTypeStep('habit')
    expect(mounted.flow.proposals).toMatchObject({ schedule: true, time: true })
    mounted.chooseTypeOnTheTypeStep('task')
    expect(mounted.values.itemType).toBe('task')
    expect(mounted.flow.proposals).toMatchObject({ schedule: false, time: true })
    mounted.unmount()
  })

  const FIRST_READ: HabitPhraseReadResponse = { ...NO_READ, read: true, frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00', emoji: '🪴' }
  const LATER_READ: HabitPhraseReadResponse = { ...NO_READ, read: true, frequencyUnit: 'Week', frequencyQuantity: 1, days: ['Monday'], dueTime: '18:00', emoji: '🌿' }
  type Held = [string, (mounted: Mounted) => void, Partial<Values>, Partial<ReturnType<typeof mountFlow>['flow']['proposals']>]
  const HELD_ON_A_STEP: Held[] = [
    ['"Tomorrow" on the When step', (mounted) => { run(() => mounted.flow.open('when')); run(() => mounted.flow.answerWhen('tomorrow')) }, { itemType: 'task', dueDate: TOMORROW, frequencyUnit: null }, { schedule: false }],
    ['"Every day" on the When step', (mounted) => { run(() => mounted.flow.open('when')); run(() => mounted.flow.answerWhen('everyDay')) }, { itemType: 'habit', frequencyUnit: 'Day', days: [] }, { schedule: false }],
    ['"No date" on the When step', (mounted) => { run(() => mounted.flow.open('when')); run(() => mounted.flow.answerWhen('noDate')) }, { isGeneral: true, dueDate: '', dueTime: '', frequencyUnit: null }, { schedule: false, time: false }],
    ['a day of the calendar on the When step', (mounted) => { run(() => mounted.flow.open('when')); run(() => mounted.flow.chooseDate('2026-12-01')) }, { itemType: 'task', dueDate: '2026-12-01', frequencyUnit: null }, { schedule: false }],
    ['a day in the words of the When step', (mounted) => { run(() => mounted.flow.open('when')); run(() => { mounted.flow.readWhenWords('tomorrow') }) }, { itemType: 'task', dueDate: TOMORROW, frequencyUnit: null }, { schedule: false }],
    ['a repeat and a time in the words of the When step', (mounted) => { run(() => mounted.flow.open('when')); run(() => { mounted.flow.readWhenWords('every friday at 9am') }) }, { itemType: 'habit', days: ['Friday'], dueTime: '09:00' }, { schedule: false, time: false }],
    ['"When I can" on the repeat step', (mounted) => { run(() => mounted.flow.open('repeat')); run(() => mounted.flow.controller.setScheduleMode(true)) }, { itemType: 'habit', isFlexible: true, frequencyUnit: 'Day' }, { schedule: false }],
    ['a repeat of every 2 weeks on the repeat step', (mounted) => { run(() => mounted.flow.open('repeat')); run(() => mounted.flow.controller.setSchedule('Week', 2, false)) }, { itemType: 'habit', frequencyUnit: 'Week', frequencyQuantity: 2 }, { schedule: false }],
    ['a time on the time step', (mounted) => { run(() => mounted.flow.open('time')); run(() => mounted.flow.answerTime('20:00')) }, { dueTime: '20:00' }, { time: false }],
    ['"No set time" on the time step', (mounted) => { run(() => mounted.flow.open('time')); run(() => mounted.flow.answerTime(null)) }, { dueTime: '' }, { time: false }],
    ['an end time on the duration step', (mounted) => { run(() => mounted.flow.open('duration')); mounted.setDurationOnTheDurationStep('08:30') }, { dueTime: '07:00', dueEndTime: '08:30' }, {}],
    ['an emoji on the emoji step', (mounted) => { run(() => mounted.flow.open('emoji')); run(() => mounted.flow.chooseEmoji('💧')) }, { emoji: '💧' }, { emoji: false }],
  ]

  it.each(HELD_ON_A_STEP)('keeps %s when a later free read of a new phrase proposes another value, with no proposal mark', async (_step, setOnStep, held, unmarked) => {
    const readPhrase = vi.fn<GuidedHabitFlowOptions['readPhrase']>().mockResolvedValueOnce(FIRST_READ).mockResolvedValueOnce(LATER_READ)
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, 'water the plants')
    setOnStep(mounted)
    run(() => mounted.flow.open('what'))
    await leavePhraseWith(mounted, 'water the plants in the garden')
    expect(readPhrase).toHaveBeenCalledTimes(2)
    expect({ ...mounted.values, frequencyUnit: mounted.values.frequencyUnit ?? null, days: mounted.values.days ?? [] }).toMatchObject(held)
    expect(mounted.flow.proposals).toMatchObject(unmarked)
    mounted.unmount()
  })

  const ONE_TIME_READ: HabitPhraseReadResponse = { ...NO_READ, read: true, dueTime: '07:00', emoji: '🌿' }
  const EVERY_DAY_READ: HabitPhraseReadResponse = { ...ONE_TIME_READ, frequencyUnit: 'Day', frequencyQuantity: 1 }
  type Typed = [string, string, HabitPhraseReadResponse, Partial<Values>, ReturnType<typeof mountFlow>['flow']['proposals'], string]
  const TYPED_IN_THE_PHRASE: Typed[] = [
    ['a time', 'water the plants at 9am', EVERY_DAY_READ, { itemType: 'habit', frequencyUnit: 'Day', days: [], dueTime: '09:00', emoji: '🌿' }, { schedule: true, time: false, emoji: true }, 'water the plants'],
    ['a repeat', 'water the plants 3 times a week', EVERY_DAY_READ, { itemType: 'habit', isFlexible: true, frequencyUnit: 'Week', frequencyQuantity: 3, dueTime: '07:00', emoji: '🌿' }, { schedule: false, time: true, emoji: true }, 'water the plants'],
    ['a day', 'water the plants every monday', EVERY_DAY_READ, { itemType: 'habit', isFlexible: false, frequencyUnit: 'Day', days: ['Monday'], dueTime: '07:00', emoji: '🌿' }, { schedule: false, time: true, emoji: true }, 'water the plants'],
    ['an emoji', '💧 water the plants', EVERY_DAY_READ, { itemType: 'habit', frequencyUnit: 'Day', dueTime: '07:00', emoji: '' }, { schedule: true, time: true, emoji: false }, '💧 water the plants'],
    ['the type', 'water the plants every monday', ONE_TIME_READ, { itemType: 'habit', frequencyUnit: 'Day', days: ['Monday'], dueTime: '07:00', emoji: '🌿' }, { schedule: false, time: true, emoji: true }, 'water the plants'],
    ['a date', 'call mom tomorrow', EVERY_DAY_READ, { itemType: 'task', dueDate: TOMORROW, frequencyUnit: null, days: [], dueTime: '07:00', emoji: '🌿' }, { schedule: false, time: true, emoji: true }, 'call mom'],
    ['a bare interval', 'water the plants every 2 weeks', EVERY_DAY_READ, { itemType: 'habit', isFlexible: false, frequencyUnit: 'Week', frequencyQuantity: 2, days: [], dueTime: '07:00', emoji: '🌿' }, { schedule: false, time: true, emoji: true }, 'water the plants'],
    ['no emoji when the phrase holds only a text sign', 'buy Coca-Cola® zero', EVERY_DAY_READ, { itemType: 'habit', frequencyUnit: 'Day', dueTime: '07:00', emoji: '🌿' }, { schedule: true, time: true, emoji: true }, 'buy Coca-Cola® zero'],
  ]

  it.each(TYPED_IN_THE_PHRASE)('keeps %s the person typed in the phrase when the free read of that phrase proposes another value, and fills only the rest', async (_field, typed, read, values, proposals, title) => {
    const readPhrase = vi.fn<GuidedHabitFlowOptions['readPhrase']>().mockResolvedValue(read)
    const mounted = mountFlow({ readPhrase })
    await leavePhraseWith(mounted, typed)
    expect(readPhrase).toHaveBeenCalledOnce()
    expect({ ...mounted.values, frequencyUnit: mounted.values.frequencyUnit ?? null, days: mounted.values.days ?? [] }).toMatchObject(values)
    expect(mounted.flow.proposals).toEqual(proposals)
    const ownership = mounted.ownership.mock.calls.at(-1)?.[0] ?? { cadence: false, dueTime: false }
    expect(getHabitPhraseTitle(mounted.values.title, 'en', ownership, true)).toBe(title)
    mounted.unmount()
  })

  it('skips the date question for a date typed in the phrase with no free read, and gives the date back when the phrase loses it', async () => {
    const mounted = mountFlow({ online: false, values: { dueDate: '2026-12-01' } })
    run(() => mounted.flow.changeTitle('ligar para a mãe na próxima sexta'))
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '2026-11-20', frequencyUnit: null })
    expect(mounted.flow.steps).not.toContain('when')
    run(() => mounted.flow.changeTitle('ligar para a mãe'))
    expect(mounted.values.dueDate).toBe('2026-12-01')
    expect(mounted.ownership).toHaveBeenLastCalledWith({ cadence: false, dueTime: false, date: null })
    mounted.unmount()
  })

  it('keeps the date words in the title when the person sets the When on a step after a typed date', async () => {
    const mounted = mountFlow({ online: false })
    await leavePhraseWith(mounted, 'call mom tomorrow')
    expect(mounted.values.dueDate).toBe(TOMORROW)
    run(() => mounted.flow.open('when'))
    run(() => mounted.flow.answerWhen('today'))
    expect(mounted.values.dueDate).toBe(TODAY)
    const ownership = mounted.ownership.mock.calls.at(-1)?.[0] ?? { cadence: false, dueTime: false }
    expect(getHabitPhraseTitle(mounted.values.title, 'en', ownership, true)).toBe('call mom tomorrow')
    mounted.unmount()
  })

  it('reads no date in a phrase whose words only look like one, and in the phrase of a deliberate habit', async () => {
    const mounted = mountFlow({ online: false })
    run(() => mounted.flow.changeTitle('beber 1/2 litro de água'))
    run(() => mounted.flow.changeTitle('ter mais paciência'))
    run(() => mounted.flow.changeTitle('read the 2nd book'))
    expect(mounted.values.dueDate).toBe('')
    expect(mounted.flow.steps).toContain('when')
    mounted.chooseTypeOnTheTypeStep('habit')
    run(() => mounted.flow.changeTitle('run tomorrow'))
    expect(mounted.values).toMatchObject({ itemType: 'habit', dueDate: '' })
    mounted.unmount()
  })
})
