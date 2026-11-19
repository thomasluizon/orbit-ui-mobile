import { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountModeFlow, type ModeFlow } from './habit-flow-mode-form'

async function answerPhrase(mounted: ModeFlow, phrase: string) {
  void act(() => mounted.flow.changeTitle(phrase))
  await act(async () => { await mounted.flow.leavePhrase() })
}

async function visitEachModeThenAnswerTimeAndReminder(mounted: ModeFlow, from: 'task' | 'habit') {
  await answerPhrase(mounted, 'gym')
  void act(() => mounted.flow.controller.setSchedule('Week', 3, true))
  void act(() => mounted.flow.answerWhen('everyDay'))
  void act(() => mounted.flow.answerWhen(from === 'habit' ? 'everyDay' : 'today'))
  void act(() => mounted.flow.answerTime('08:00'))
  void act(() => mounted.flow.answerReminder(true))
}

const flush = (mounted: ModeFlow) => { void act(() => { mounted.flow.back() }) }

describe('guided habit flow: a later answer keeps the time and the reminder that an earlier answer gave', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
  afterEach(() => vi.unstubAllGlobals())

  it('keeps both when the person goes back three steps and answers When again', async () => {
    const mounted = mountModeFlow()
    await visitEachModeThenAnswerTimeAndReminder(mounted, 'habit')
    for (let step = 0; step < 3; step += 1) flush(mounted)
    expect(mounted.flow.current.step).toBe('when')
    void act(() => mounted.flow.answerWhen('today'))
    expect(mounted.values).toMatchObject({ itemType: 'task', frequencyUnit: undefined, dueTime: '08:00', reminderEnabled: true })
    mounted.unmount()
  })

  type Site = [name: string, from: 'task' | 'habit', run: (mounted: ModeFlow) => void, expected: Record<string, unknown>]
  it.each<Site>([
    ['the Today quick option', 'habit', ({ flow }) => flow.answerWhen('today'), { itemType: 'task' }],
    ['the Tomorrow quick option', 'habit', ({ flow }) => flow.answerWhen('tomorrow'), { itemType: 'task' }],
    ['the Every day quick option', 'task', ({ flow }) => flow.answerWhen('everyDay'), { itemType: 'habit', frequencyUnit: 'Day' }],
    ['a date from the calendar', 'habit', ({ flow }) => flow.chooseDate('2030-05-04'), { itemType: 'task', dueDate: '2030-05-04' }],
    ['a repeat in the words of the When step', 'task', ({ flow }) => flow.readWhenWords('every monday'), { itemType: 'habit' }],
    ['the type step, Habit', 'task', ({ flow }) => flow.chooseItemType('habit'), { itemType: 'habit' }],
    ['the type step, Task', 'habit', ({ flow }) => flow.chooseItemType('task'), { itemType: 'task' }],
    ['the repeat step, a count in each week', 'task', ({ flow }) => flow.controller.setSchedule('Week', 3, true), { isFlexible: true }],
    ['the repeat step, a full schedule', 'task', ({ flow }) => flow.controller.setRecurrence({ unit: 'Week', quantity: 1, days: ['Monday'], monthDays: [], flexible: false, intervalWeeks: 1 }), { frequencyUnit: 'Week' }],
    ['a repeat typed in the phrase', 'task', ({ flow }) => flow.changeTitle('gym every monday'), { itemType: 'habit' }],
    ['a date typed in the phrase', 'habit', ({ flow }) => flow.changeTitle('gym tomorrow'), { itemType: 'task' }],
  ])('keeps the time and the reminder through %s', async (_name, from, run, expected) => {
    const mounted = mountModeFlow()
    await visitEachModeThenAnswerTimeAndReminder(mounted, from)
    expect(mounted.values).toMatchObject({ dueTime: '08:00', reminderEnabled: true })
    void act(() => run(mounted))
    expect(mounted.values).toMatchObject({ ...expected, dueTime: '08:00', reminderEnabled: true })
    mounted.unmount()
  })

  it('asks the time again when No date dropped it, and asks again on the next dated answer', async () => {
    const mounted = mountModeFlow()
    await visitEachModeThenAnswerTimeAndReminder(mounted, 'task')
    void act(() => mounted.flow.answerWhen('noDate'))
    expect(mounted.values).toMatchObject({ isGeneral: true, dueTime: '' })
    expect(mounted.flow.answers.time).toBe(false)
    flush(mounted)
    expect(mounted.flow.current.step).toBe('when')
    void act(() => mounted.flow.answerWhen('everyDay'))
    expect(mounted.flow.steps).toContain('time')
    expect(mounted.flow.current.step).toBe('time')
    mounted.unmount()
  })
})

describe('guided habit flow: a value the phrase read set is released when the phrase stops setting it', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
  afterEach(() => vi.unstubAllGlobals())

  it.each<[string, string, string, Record<string, unknown>]>([
    ['a repeat on a week day', 'gym every monday', 'gym', { itemType: 'task', frequencyUnit: undefined, days: [] }],
    ['a count in each week', 'gym 3 times a week', 'gym', { itemType: 'task', frequencyUnit: undefined, isFlexible: false }],
    ['a bare interval', 'gym every 2 weeks', 'gym', { itemType: 'task', frequencyUnit: undefined }],
    ['a time', 'gym at 8am', 'gym', { dueTime: '' }],
    ['a date', 'gym tomorrow', 'gym', { dueDate: '' }],
  ])('releases %s that the phrase read set', (_name, typed, corrected, released) => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.changeTitle(typed))
    void act(() => mounted.flow.changeTitle(corrected))
    expect(mounted.values).toMatchObject(released)
    mounted.unmount()
  })

  it('asks When again after the repeat words are deleted', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.changeTitle('gym every monday'))
    expect(mounted.flow.steps).not.toContain('when')
    void act(() => mounted.flow.changeTitle('gym'))
    expect(mounted.flow.steps).toContain('when')
    mounted.unmount()
  })

  it('keeps the repeat of a habit the person chose on the type step', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.changeTitle('gym every monday'))
    void act(() => mounted.flow.markTypeDeliberate('habit'))
    void act(() => mounted.flow.changeTitle('gym'))
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day' })
    mounted.unmount()
  })
})
