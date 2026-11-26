import { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountModeFlow } from './habit-flow-mode-form'

type Mounted = ReturnType<typeof mountModeFlow>
const snapshot = (mounted: Mounted) => ({ values: structuredClone(mounted.values), when: mounted.flow.answers.when, time: mounted.flow.answers.time, proposals: { ...mounted.flow.proposals } })

describe('guided habit flow: the words of the When step', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.useFakeTimers({ now: new Date('2026-11-25T12:00:00Z'), toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps a task a task for a bare weekday and reads the next date of that weekday', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.markTypeDeliberate('task'))
    let refusal: string | null = 'unset'
    void act(() => { refusal = mounted.flow.readWhenWords('friday') })
    expect(refusal).toBeNull()
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '2026-11-27', frequencyUnit: undefined })
    expect(mounted.flow.answers.when).toBe(true)
    mounted.unmount()
  })

  it('keeps the task a bare weekday names when the person set no type', () => {
    const mounted = mountModeFlow()
    void act(() => { mounted.flow.readWhenWords('friday') })
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '2026-11-27' })
    mounted.unmount()
  })

  it('makes a habit of a repeat when the person set no type', () => {
    const mounted = mountModeFlow()
    void act(() => { mounted.flow.readWhenWords('every friday') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', days: ['Friday'] })
    mounted.unmount()
  })

  it('keeps a task the person chose for a repeat, and states the recovery', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.markTypeDeliberate('task'))
    let refusal: string | null = null
    void act(() => { refusal = mounted.flow.readWhenWords('every friday') })
    expect(refusal).toBe('taskRepeat')
    expect(mounted.values).toMatchObject({ itemType: 'task', frequencyUnit: undefined, dueDate: '' })
    expect(mounted.flow.answers.when).toBe(false)
    expect(mounted.flow.current.step).toBe('what')
    mounted.unmount()
  })

  it('reads a bare weekday as the weekly repeat for a habit the person chose', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.chooseItemType('habit'))
    void act(() => mounted.flow.markTypeDeliberate('habit'))
    void act(() => { mounted.flow.readWhenWords('friday') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', days: ['Friday'] })
    mounted.unmount()
  })

  it('returns the date a weekday names while the person types and changes no field', () => {
    const mounted = mountModeFlow()
    const before = snapshot(mounted)
    let preview: unknown = null
    void act(() => { preview = mounted.flow.previewWhenWords('friday') })
    expect(preview).toEqual({ kind: 'date', date: '2026-11-27' })
    expect(snapshot(mounted)).toEqual(before)
    expect(mounted.flow.steps).toContain('when')
    void act(() => { mounted.flow.readWhenWords('friday') })
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '2026-11-27' })
    expect(mounted.flow.answers.when).toBe(true)
    mounted.unmount()
  })

  it('waits for more letters after a short weekday name and changes nothing', () => {
    const mounted = mountModeFlow()
    void act(() => { expect(mounted.flow.previewWhenWords('qua')).toBeNull() })
    void act(() => { expect(mounted.flow.previewWhenWords('Fri')).toBeNull() })
    expect(mounted.values).toMatchObject({ dueDate: '' })
    expect(mounted.flow.answers.when).toBe(false)
    mounted.unmount()
  })

  it('returns the words of a repeat and changes nothing', () => {
    const mounted = mountModeFlow()
    let preview: unknown = null
    void act(() => { preview = mounted.flow.previewWhenWords('every friday ') })
    expect(preview).toEqual({ kind: 'repeat', text: 'every friday' })
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '', frequencyUnit: undefined })
    mounted.unmount()
  })

  it('changes nothing for unresolved words, a past day and a habit the person chose', () => {
    const mounted = mountModeFlow()
    void act(() => { expect(mounted.flow.previewWhenWords('whenever')).toBeNull() })
    void act(() => { expect(mounted.flow.previewWhenWords('2026-11-01')).toBeNull() })
    expect(mounted.values).toMatchObject({ dueDate: '' })
    void act(() => mounted.flow.chooseItemType('habit'))
    void act(() => mounted.flow.markTypeDeliberate('habit'))
    void act(() => { expect(mounted.flow.previewWhenWords('the 28th')).toBeNull() })
    expect(mounted.values).toMatchObject({ itemType: 'habit', dueDate: '' })
    mounted.unmount()
  })

  const typeKeys = (mounted: Mounted, words: string) => {
    for (let end = 1; end <= words.length; end += 1) void act(() => { mounted.flow.previewWhenWords(words.slice(0, end)) })
  }
  const typeAndErase = (mounted: Mounted, words: string) => {
    typeKeys(mounted, words)
    void act(() => { mounted.flow.previewWhenWords('') })
  }

  it('starts a repeat that the person typed key by key today', () => {
    const mounted = mountModeFlow()
    typeKeys(mounted, 'monday, wednesday and friday')
    void act(() => { mounted.flow.readWhenWords('monday, wednesday and friday') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', dueDate: '2026-11-25' })
    expect(mounted.values.days).toEqual(['Monday', 'Wednesday', 'Friday'])
    mounted.unmount()
  })

  it('changes no field for a date typed key by key, a past date included', () => {
    const mounted = mountModeFlow()
    const before = snapshot(mounted)
    typeKeys(mounted, '20/11/2026')
    typeKeys(mounted, '11/20/2026')
    expect(snapshot(mounted)).toEqual(before)
    let refusal: string | null = null
    void act(() => { refusal = mounted.flow.readWhenWords('11/20/2026') })
    expect(refusal).toBe('past')
    expect(snapshot(mounted)).toEqual(before)
    mounted.unmount()
  })

  it('changes no field for words that end unresolved', () => {
    const mounted = mountModeFlow()
    const before = snapshot(mounted)
    typeKeys(mounted, 'tomorrow morning')
    expect(snapshot(mounted)).toEqual(before)
    let refusal: string | null = null
    void act(() => { refusal = mounted.flow.readWhenWords('tomorrow morning') })
    expect(refusal).toBe('unresolved')
    expect(snapshot(mounted)).toEqual(before)
    mounted.unmount()
  })

  it('changes no field for a repeat typed for a task the person chose', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.markTypeDeliberate('task'))
    const before = snapshot(mounted)
    typeKeys(mounted, 'monday and friday')
    expect(snapshot(mounted)).toEqual(before)
    let refusal: string | null = null
    void act(() => { refusal = mounted.flow.readWhenWords('monday and friday') })
    expect(refusal).toBe('taskRepeat')
    expect(snapshot(mounted)).toEqual(before)
    mounted.unmount()
  })

  it('changes no field for a weekday that the person types and erases', () => {
    const mounted = mountModeFlow()
    const before = snapshot(mounted)
    typeAndErase(mounted, 'friday')
    expect(snapshot(mounted)).toEqual(before)
    mounted.unmount()
  })

  it('keeps the date the person chose before the words', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.chooseDate('2026-12-01'))
    const before = snapshot(mounted)
    typeAndErase(mounted, 'friday')
    expect(snapshot(mounted)).toEqual(before)
    mounted.unmount()
  })

  it('keeps the repeat that the person answered when the person types over it and goes back', () => {
    const mounted = mountModeFlow()
    void act(() => { mounted.flow.readWhenWords('every friday') })
    void act(() => { mounted.flow.back() })
    expect(mounted.flow.current.step).toBe('when')
    const before = snapshot(mounted)
    expect(before.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', days: ['Friday'] })
    typeAndErase(mounted, 'tomorrow')
    expect(snapshot(mounted)).toEqual(before)
    typeKeys(mounted, 'tomorrow morning')
    expect(snapshot(mounted)).toEqual(before)
    mounted.unmount()
  })

  it('keeps the every day answer when the person types a date', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.answerWhen('everyDay'))
    void act(() => { mounted.flow.back() })
    const before = snapshot(mounted)
    expect(before.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day' })
    typeKeys(mounted, '12/1/2025')
    typeAndErase(mounted, 'tomorrow')
    expect(snapshot(mounted)).toEqual(before)
    mounted.unmount()
  })

  it('keeps a habit or a task the person chose after a typed date', () => {
    for (const type of ['habit', 'task'] as const) {
      const mounted = mountModeFlow()
      typeKeys(mounted, 'friday')
      void act(() => mounted.flow.chooseItemType(type))
      void act(() => mounted.flow.markTypeDeliberate(type))
      const before = snapshot(mounted)
      typeKeys(mounted, 'frida')
      typeAndErase(mounted, 'tomorrow')
      expect(snapshot(mounted)).toEqual(before)
      mounted.unmount()
    }
  })

  it('keeps a task with no date as a task with no date after a typed weekday', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.answerWhen('noDate'))
    void act(() => { mounted.flow.back() })
    const before = snapshot(mounted)
    expect(before.values).toMatchObject({ isGeneral: true })
    typeKeys(mounted, 'friday')
    typeKeys(mounted, 'frida')
    typeAndErase(mounted, 'friday')
    expect(snapshot(mounted)).toEqual(before)
    expect(mounted.values.isGeneral).toBe(true)
    mounted.unmount()
  })

  it('starts the repeat today when the person chose the habit after a typed date and typed a repeat', () => {
    const mounted = mountModeFlow()
    typeKeys(mounted, 'friday')
    void act(() => mounted.flow.chooseItemType('habit'))
    void act(() => mounted.flow.markTypeDeliberate('habit'))
    typeKeys(mounted, 'every monday')
    void act(() => { mounted.flow.readWhenWords('every monday') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', dueDate: '2026-11-25' })
    expect(mounted.values.days).toEqual(['Monday'])
    mounted.unmount()
  })
})
