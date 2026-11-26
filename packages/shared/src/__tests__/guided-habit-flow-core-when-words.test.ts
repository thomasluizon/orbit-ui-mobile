import { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountModeFlow } from './habit-flow-mode-form'

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

  it('fills the date while the person types and keeps the step in the list', () => {
    const mounted = mountModeFlow()
    let preview: unknown = null
    void act(() => { preview = mounted.flow.previewWhenWords('friday') })
    expect(preview).toEqual({ kind: 'date', date: '2026-11-27' })
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '2026-11-27' })
    expect(mounted.flow.answers.when).toBe(true)
    expect(mounted.flow.steps).toContain('when')
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

  const typeKeys = (mounted: ReturnType<typeof mountModeFlow>, words: string) => {
    for (let end = 1; end <= words.length; end += 1) void act(() => { mounted.flow.previewWhenWords(words.slice(0, end)) })
  }

  it('starts a repeat that the person typed key by key today, not on the date a first word read', () => {
    const mounted = mountModeFlow()
    typeKeys(mounted, 'monday, wednesday and friday')
    void act(() => { mounted.flow.readWhenWords('monday, wednesday and friday') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', dueDate: '2026-11-25' })
    expect(mounted.values.days).toEqual(['Monday', 'Wednesday', 'Friday'])
    mounted.unmount()
  })

  it('undoes the fill of a date when the full words read as a past date', () => {
    const mounted = mountModeFlow()
    typeKeys(mounted, '11/20')
    expect(mounted.values).toMatchObject({ dueDate: '2027-11-20' })
    for (const words of ['11/20/', '11/20/2', '11/20/20', '11/20/202', '11/20/2026']) void act(() => { mounted.flow.previewWhenWords(words) })
    expect(mounted.values).toMatchObject({ dueDate: '' })
    expect(mounted.flow.answers.when).toBe(false)
    let refusal: string | null = null
    void act(() => { refusal = mounted.flow.readWhenWords('11/20/2026') })
    expect(refusal).toBe('past')
    expect(mounted.values).toMatchObject({ dueDate: '' })
    mounted.unmount()
  })

  it('undoes the fill of a date when later words stay unresolved', () => {
    const mounted = mountModeFlow()
    typeKeys(mounted, 'tomorrow morning')
    expect(mounted.values).toMatchObject({ dueDate: '' })
    expect(mounted.flow.answers.when).toBe(false)
    let refusal: string | null = null
    void act(() => { refusal = mounted.flow.readWhenWords('tomorrow morning') })
    expect(refusal).toBe('unresolved')
    expect(mounted.values).toMatchObject({ dueDate: '' })
    mounted.unmount()
  })

  it('undoes the fill of a date when a deliberate task gets a repeat', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.markTypeDeliberate('task'))
    typeKeys(mounted, 'monday and friday')
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '', frequencyUnit: undefined })
    expect(mounted.flow.answers.when).toBe(false)
    let refusal: string | null = null
    void act(() => { refusal = mounted.flow.readWhenWords('monday and friday') })
    expect(refusal).toBe('taskRepeat')
    expect(mounted.values).toMatchObject({ dueDate: '' })
    expect(mounted.flow.answers.when).toBe(false)
    mounted.unmount()
  })

  it('undoes the fill of a date when the person erases the words', () => {
    const mounted = mountModeFlow()
    typeKeys(mounted, 'friday')
    expect(mounted.values).toMatchObject({ dueDate: '2026-11-27' })
    void act(() => { mounted.flow.previewWhenWords('') })
    expect(mounted.values).toMatchObject({ dueDate: '' })
    expect(mounted.flow.answers.when).toBe(false)
    mounted.unmount()
  })

  it('keeps the date the person chose before the fill and puts it back after the words change', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.chooseDate('2026-12-01'))
    typeKeys(mounted, 'friday')
    expect(mounted.values).toMatchObject({ dueDate: '2026-11-27' })
    void act(() => { mounted.flow.previewWhenWords('') })
    expect(mounted.values).toMatchObject({ dueDate: '2026-12-01' })
    expect(mounted.flow.answers.when).toBe(true)
    mounted.unmount()
  })

  it('starts a daily repeat today when the person changes a typed weekday to every day', () => {
    const mounted = mountModeFlow()
    typeKeys(mounted, 'friday')
    expect(mounted.values).toMatchObject({ dueDate: '2026-11-27' })
    typeKeys(mounted, 'every day')
    void act(() => { mounted.flow.readWhenWords('every day') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueDate: '2026-11-25' })
    mounted.unmount()
  })

  it('brings back the repeat the person answered after a typed and erased date', () => {
    const mounted = mountModeFlow()
    void act(() => { mounted.flow.readWhenWords('every friday') })
    expect(mounted.flow.current.step).toBe('time')
    void act(() => { mounted.flow.back() })
    expect(mounted.flow.current.step).toBe('when')
    const before = { ...mounted.values }
    expect(before).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', days: ['Friday'] })
    typeKeys(mounted, 'tomorrow')
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '2026-11-26' })
    void act(() => { mounted.flow.previewWhenWords('') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', days: ['Friday'], dueDate: before.dueDate })
    expect(mounted.flow.answers.when).toBe(true)
    mounted.unmount()
  })

  it('brings back the repeat the person answered when the typed words end as tomorrow morning', () => {
    const mounted = mountModeFlow()
    void act(() => { mounted.flow.readWhenWords('every friday') })
    void act(() => { mounted.flow.back() })
    const before = { ...mounted.values }
    typeKeys(mounted, 'tomorrow morning')
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', days: ['Friday'], dueDate: before.dueDate })
    expect(mounted.flow.answers.when).toBe(true)
    let refusal: string | null = null
    void act(() => { refusal = mounted.flow.readWhenWords('tomorrow morning') })
    expect(refusal).toBe('unresolved')
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', days: ['Friday'], dueDate: before.dueDate })
    mounted.unmount()
  })

  it('brings back the every day answer when the typed date reads as past', () => {
    const mounted = mountModeFlow()
    void act(() => mounted.flow.answerWhen('everyDay'))
    const before = { ...mounted.values }
    expect(before).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day' })
    typeKeys(mounted, '12/1/2025')
    expect(mounted.values).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueDate: before.dueDate })
    expect(mounted.flow.answers.when).toBe(true)
    mounted.unmount()
  })
  it('keeps the habit the person chose after a filled date when the words change', () => {
    const mounted = mountModeFlow()
    typeKeys(mounted, 'friday')
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '2026-11-27' })
    void act(() => mounted.flow.chooseItemType('habit'))
    void act(() => mounted.flow.markTypeDeliberate('habit'))
    void act(() => { mounted.flow.previewWhenWords('frida') })
    expect(mounted.values).toMatchObject({ itemType: 'habit' })
    void act(() => { mounted.flow.previewWhenWords('e') })
    expect(mounted.values).toMatchObject({ itemType: 'habit' })
    mounted.unmount()
  })

  it('keeps the task the person chose after a filled date when the words are typed and erased', () => {
    const mounted = mountModeFlow()
    void act(() => { mounted.flow.readWhenWords('every friday') })
    void act(() => { mounted.flow.back() })
    typeKeys(mounted, 'tomorrow')
    expect(mounted.values).toMatchObject({ itemType: 'task', dueDate: '2026-11-26' })
    void act(() => mounted.flow.chooseItemType('task'))
    void act(() => mounted.flow.markTypeDeliberate('task'))
    void act(() => { mounted.flow.previewWhenWords('tomorro') })
    void act(() => { mounted.flow.previewWhenWords('') })
    expect(mounted.values).toMatchObject({ itemType: 'task', frequencyUnit: undefined })
    expect(mounted.values.days ?? []).toEqual([])
    mounted.unmount()
  })

  it('starts the repeat today when the person chose the habit after a filled date and typed a repeat', () => {
    const mounted = mountModeFlow()
    typeKeys(mounted, 'friday')
    void act(() => mounted.flow.chooseItemType('habit'))
    void act(() => mounted.flow.markTypeDeliberate('habit'))
    void act(() => { mounted.flow.previewWhenWords('e') })
    typeKeys(mounted, 'every monday')
    void act(() => { mounted.flow.readWhenWords('every monday') })
    expect(mounted.values).toMatchObject({ itemType: 'habit', dueDate: '2026-11-25' })
    expect(mounted.values.days).toEqual(['Monday'])
    mounted.unmount()
  })
})
