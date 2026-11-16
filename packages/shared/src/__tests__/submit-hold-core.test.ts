import { describe, expect, it } from 'vitest'
import { createUseSubmitHold, type SubmitHold, type SubmitOutcome } from '../hooks/submit-hold-core'
import { createHookStateHarness } from '../test-support/hook-state'

function mountSubmitHold() {
  const harness = createHookStateHarness()
  const useSubmitHold = createUseSubmitHold({ useState: harness.useState, useRef: (initial) => harness.useState(() => ({ current: initial }))[0] })
  return () => harness.render(useSubmitHold)
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
