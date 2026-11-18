import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUseGuidedHabitFlow, type GuidedHabitFlowForm, type GuidedHabitFlowHelpers, type GuidedHabitFlowOptions } from '../hooks/guided-habit-flow-core'
import type { HabitPhraseReadResponse } from '../types/habit'

const useGuidedHabitFlow = createUseGuidedHabitFlow({ useState, useEffect, useMemo, useCallback, useRef })
const DAILY_AT_SEVEN: HabitPhraseReadResponse = { read: true, emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] }

type Values = ReturnType<GuidedHabitFlowForm['getValues']>

function mountFlow(readPhrase: GuidedHabitFlowOptions['readPhrase']) {
  const values: Values = { title: '', dueDate: '', dueTime: '', frequencyUnit: undefined, isFlexible: false, isGeneral: false, itemType: 'task', emoji: '' }
  let render = () => {}
  const write = (change: Partial<Values>) => { Object.assign(values, change); render() }
  const form: GuidedHabitFlowForm = { getValues: () => values, setField: (field, value) => write({ [field]: value }) }
  const helpers: GuidedHabitFlowHelpers = {
    isGeneral: false, toggleDay: vi.fn(), chooseItemType: (itemType) => write({ itemType }), setOneTime: () => write({ frequencyUnit: undefined }),
    setRecurring: () => {}, setFlexible: () => {}, setGeneral: () => {}, backendFocusRequest: 0, backendFocusField: undefined,
  }
  const applySchedule: GuidedHabitFlowOptions['applySchedule'] = (patch) => {
    write({ frequencyUnit: patch.mode === 'oneTime' ? undefined : patch.frequencyUnit ?? undefined, dueTime: patch.dueTime ?? values.dueTime })
    return true
  }
  let flow!: ReturnType<typeof useGuidedHabitFlow>
  function FlowProbe() {
    const [, setVersion] = useState(0)
    render = () => setVersion((version) => version + 1)
    flow = useGuidedHabitFlow({
      mode: 'create', lockedGeneral: null, locale: 'en', timeZone: 'UTC', isOnline: true, helpers, form, readPhrase, applySchedule,
      watched: { title: values.title, dueDate: values.dueDate, dueTime: values.dueTime, frequencyUnit: values.frequencyUnit, isFlexible: values.isFlexible },
    })
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(FlowProbe)) })
  return { values, helpers, get flow() { return flow }, unmount: () => { void act(() => tree.unmount()) } }
}

function deferredRead() {
  let arrive!: (response: HabitPhraseReadResponse | null) => void
  const readPhrase = vi.fn<GuidedHabitFlowOptions['readPhrase']>(() => new Promise((resolve) => { arrive = resolve }))
  return { readPhrase, arrive: (response: HabitPhraseReadResponse | null) => arrive(response) }
}

describe('shared guided habit flow', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
  afterEach(() => vi.unstubAllGlobals())

  it('applies a read with the type the person set while it ran, never the type at the press', async () => {
    const read = deferredRead()
    const mounted = mountFlow(read.readPhrase)
    void act(() => mounted.flow.changeTitle('water the plants'))
    await act(async () => { void mounted.flow.leavePhrase() })
    expect(read.readPhrase).toHaveBeenCalledTimes(1)
    expect(mounted.flow.reading).toBe(true)
    void act(() => mounted.flow.markTypeDeliberate('task'))
    await act(async () => { read.arrive(DAILY_AT_SEVEN) })
    expect(mounted.flow.reading).toBe(false)
    expect(mounted.values).toMatchObject({ itemType: 'task', frequencyUnit: undefined, dueTime: '07:00' })
    expect(mounted.flow.current.step).not.toBe('what')
    mounted.unmount()
  })

  it('starts one read for two presses and stays on the phrase step until the read ends', async () => {
    const read = deferredRead()
    const mounted = mountFlow(read.readPhrase)
    void act(() => mounted.flow.changeTitle('water the plants'))
    await act(async () => { void mounted.flow.leavePhrase() })
    await act(async () => { void mounted.flow.leavePhrase() })
    expect(read.readPhrase).toHaveBeenCalledTimes(1)
    expect(mounted.flow.current.step).toBe('what')
    await act(async () => { read.arrive(null) })
    expect(mounted.flow.current.step).toBe('when')
    mounted.unmount()
  })

  it('drops the emoji of a read that arrives after the person changed the phrase', async () => {
    const read = deferredRead()
    const mounted = mountFlow(read.readPhrase)
    void act(() => mounted.flow.changeTitle('water the plants'))
    await act(async () => { void mounted.flow.suggestEmoji() })
    void act(() => mounted.flow.changeTitle('call John'))
    await act(async () => { read.arrive({ ...DAILY_AT_SEVEN, emoji: '🪴' }) })
    expect(mounted.values.emoji).toBe('')
    expect(mounted.flow.proposals.emoji).toBe(false)
    mounted.unmount()
  })

  type ScheduleController = ReturnType<typeof mountFlow>['flow']['controller']
  it.each<[string, (controller: ScheduleController) => void, (mounted: ReturnType<typeof mountFlow>) => void]>([
    ['a repeat', (controller) => controller.setRecurrence({ unit: 'Week', quantity: 1, days: ['Monday'], monthDays: [], flexible: false, intervalWeeks: 1 }), ({ values }) => expect(values).toMatchObject({ frequencyUnit: 'Week', days: ['Monday'] })],
    ['a week day', (controller) => controller.toggleDay('Monday', false, []), ({ helpers }) => expect(helpers.toggleDay).toHaveBeenCalledWith('Monday', false)],
    ['a month day', (controller) => controller.toggleMonthDay(15, 1, []), ({ values }) => expect(values.monthDays).toEqual([1, 15])],
    ['a count in each week', (controller) => controller.setQuantity(3), ({ values }) => expect(values).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 3 })],
    ['a week interval', (controller) => controller.setIntervalWeeks(2), ({ values }) => expect(values).toMatchObject({ frequencyUnit: 'Day', intervalWeeks: 2 })],
  ])('answers the When and drops the proposed repeat when the person sets %s', async (_name, change, written) => {
    const read = deferredRead()
    const mounted = mountFlow(read.readPhrase)
    void act(() => mounted.flow.changeTitle('water the plants'))
    await act(async () => { void mounted.flow.leavePhrase() })
    await act(async () => { read.arrive(DAILY_AT_SEVEN) })
    expect(mounted.flow.proposals.schedule).toBe(true)
    expect(mounted.flow.answers.when).toBe(false)
    void act(() => change(mounted.flow.controller))
    expect(mounted.flow.proposals.schedule).toBe(false)
    expect(mounted.flow.answers.when).toBe(true)
    written(mounted)
    mounted.unmount()
  })

  it('sets a daily repeat under a week interval when the item has no repeat yet', () => {
    const mounted = mountFlow(deferredRead().readPhrase)
    expect(mounted.values.frequencyUnit).toBeUndefined()
    void act(() => mounted.flow.controller.setIntervalWeeks(3))
    expect(mounted.values).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 3 })
    expect(mounted.flow.answers.when).toBe(true)
    mounted.unmount()
  })
})
