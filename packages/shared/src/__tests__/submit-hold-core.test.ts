import { describe, expect, it } from 'vitest'
import { createUseSubmitHold, type SubmitHold, type SubmitOutcome } from '../hooks/submit-hold-core'

function mountSubmitHold() {
  const slots: unknown[] = []
  let cursor = 0
  const useState = <State>(initial: State | (() => State)) => {
    const index = cursor++
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => State)() : initial
    const set = (update: State | ((current: State) => State)) => {
      slots[index] = typeof update === 'function' ? (update as (current: State) => State)(slots[index] as State) : update
    }
    return [slots[index] as State, set] as [State, typeof set]
  }
  const useRef = <Value>(initial: Value) => {
    const index = cursor++
    if (!(index in slots)) slots[index] = { current: initial }
    return slots[index] as { current: Value }
  }
  const useSubmitHold = createUseSubmitHold({ useState, useRef })
  return () => {
    cursor = 0
    return useSubmitHold()
  }
}

function deferred() {
  let settle!: (outcome: SubmitOutcome) => void
  let fail!: (error: unknown) => void
  const promise = new Promise<SubmitOutcome>((resolve, reject) => { settle = resolve; fail = reject })
  return { promise, settle, fail }
}

describe('submit hold', () => {
  it('blocks a second submission from the press, before the request starts', async () => {
    const render = mountSubmitHold()
    const request = deferred()
    let calls = 0
    const submit = () => { calls++; return request.promise }
    const first = render().run(submit)
    const second = render().run(submit)
    expect(calls).toBe(1)
    expect(render().isRunning()).toBe(true)
    expect(render().waiting).toBe(false)
    request.settle('stay')
    await Promise.all([first, second])
    expect(render().isRunning()).toBe(false)
  })

  it('waits from the request start until the form leaves, then ends on release', async () => {
    const render = mountSubmitHold()
    const request = deferred()
    let hold: SubmitHold = render()
    const running = hold.run(async (startRequest) => { startRequest(); return request.promise })
    hold = render()
    expect(hold.waiting).toBe(true)
    request.settle('leave')
    await running
    hold = render()
    expect(hold.waiting).toBe(true)
    let calls = 0
    await hold.run(async () => { calls++; return 'stay' })
    expect(calls).toBe(0)
    hold.release()
    hold = render()
    expect(hold.waiting).toBe(false)
    expect(hold.isRunning()).toBe(false)
  })

  it('ends the waiting state when the request fails, so a retry can start', async () => {
    const render = mountSubmitHold()
    const request = deferred()
    const running = render().run(async (startRequest) => { startRequest(); return request.promise })
    expect(render().waiting).toBe(true)
    request.fail(new Error('offline'))
    await expect(running).rejects.toThrow('offline')
    expect(render().waiting).toBe(false)
    let calls = 0
    await render().run(async () => { calls++; return 'stay' })
    expect(calls).toBe(1)
  })
})
