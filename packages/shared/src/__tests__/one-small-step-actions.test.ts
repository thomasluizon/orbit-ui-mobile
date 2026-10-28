import { describe, expect, it, vi } from 'vitest'
import { createUseOneSmallStepActions } from '../chat/one-small-step-actions'
import { createHookStateHarness } from '../test-support/hook-state'
import { makeOneSmallStepCard } from '../test-support/chat-fixtures'

function setup() {
  const harness = createHookStateHarness()
  const useActions = createUseOneSmallStepActions({ useState: harness.useState })
  const send = vi.fn(async (_message: string) => {})
  const view = (blocked = false) => harness.render(() => useActions(send, { isOnline: !blocked, isSending: false, atMessageLimit: false }))
  return { send, view }
}

describe('one small step request actions', () => {
  it.each(makeOneSmallStepCard().actions)('sends only the complete $id message once', async action => {
    const { send, view } = setup()
    await view().submit(action)
    expect(send).toHaveBeenCalledExactlyOnceWith(action.message)
  })
  it('blocks repeat presses during a request and restores actions after failure', async () => {
    const { send, view } = setup()
    let reject!: (error: Error) => void
    send.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail }))
    const request = view().submit(makeOneSmallStepCard().actions[0]!)
    await view().submit(makeOneSmallStepCard().actions[1]!)
    expect(view().disabled).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    reject(new Error('Unavailable'))
    await expect(request).rejects.toThrow('Unavailable')
    expect(view().disabled).toBe(false)
    await view().submit(makeOneSmallStepCard().actions[1]!)
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('does not submit when the conversation is unavailable', async () => {
    const { send, view } = setup()
    await view(true).submit(makeOneSmallStepCard().actions[0]!)
    expect(send).not.toHaveBeenCalled()
  })
})
