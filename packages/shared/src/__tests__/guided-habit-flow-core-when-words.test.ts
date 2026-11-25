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
})
