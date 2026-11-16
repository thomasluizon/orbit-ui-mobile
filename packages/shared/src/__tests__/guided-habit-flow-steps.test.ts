import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUseGuidedHabitFlow, type GuidedHabitFlowForm, type GuidedHabitFlowHelpers, type GuidedHabitFlowOptions } from '../hooks/guided-habit-flow-core'
import type { HabitPhraseReadResponse } from '../types/habit'
import type { HabitPhraseFormOwnership } from '../utils/habit-form-helpers'

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
    if (patch.mode !== 'oneTime') write({ frequencyUnit: patch.frequencyUnit ?? undefined, isFlexible: patch.mode === 'flexible' })
    if (patch.dueTime) write({ dueTime: patch.dueTime })
    if (patch.emoji) write({ emoji: patch.emoji })
    return true
  }
  let flow!: ReturnType<typeof useGuidedHabitFlow>
  function FlowProbe() {
    const [, setVersion] = useState(0)
    render = () => setVersion((version) => version + 1)
    flow = useGuidedHabitFlow({
      mode, lockedGeneral, locale: 'en', timeZone: 'UTC', isOnline: online, helpers: { ...helpers, isGeneral: helpers.isGeneral, backendFocusRequest: backend.request, backendFocusField: backend.field },
      form, readPhrase, applySchedule, onReminderEnabledChange: reminder, onPhraseOwnershipChange: ownership,
      watched: { title: values.title, dueDate: values.dueDate, dueTime: values.dueTime, frequencyUnit: values.frequencyUnit, isFlexible: values.isFlexible },
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
})
