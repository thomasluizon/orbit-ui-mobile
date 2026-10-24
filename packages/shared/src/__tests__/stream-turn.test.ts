import { describe, expect, it, vi } from 'vitest'
import { sendChatStreamTurn } from '../chat/stream-turn'

const turnId = 'fe4a8c19-9c97-481a-882d-ed7dea936ec0'
const started = (state = 'running', replayed = false) => ({ type: 'started', turnId, state, replayed })
const final = { type: 'final', response: { aiMessage: 'Reply', actions: [], operations: null, pendingOperations: null, policyDenials: null, correlationId: null, relatedSurfaces: null, habitList: null, goalList: null, metricsCard: null, periodInsight: null, daySummary: null, streak: null, calendar: null, recordLists: null, accountRows: null, followUps: null }, turnId, state: 'completed' }
const interrupted = { type: 'error', status: 503, error: 'The turn was interrupted. Its effects may be partial; do not resend it with another key.', code: 'CHAT_TURN_INTERRUPTED', turnId, state: 'interrupted' }
async function* events(...frames: unknown[]) {
  for (const event of frames) yield `data: ${JSON.stringify(event)}\n\n`
}
function setup() {
  const open = vi.fn()
  const callbacks = { onDelta: vi.fn(), onReset: vi.fn() }
  const options = { turn: { key: 'submitted-key', payload: { message: 'hello' } }, open, callbacks, isCancelled: () => false }
  return { open, callbacks, options }
}

describe('sendChatStreamTurn', () => {
  it.each(['running', 'completed'])('joins a %s replay without clearing rendered deltas', async state => {
    const { open, callbacks, options } = setup()
    open.mockResolvedValueOnce({ kind: 'stream', chunks: events(started(), { type: 'delta', text: 'Partial' }) })
      .mockResolvedValueOnce({ kind: 'stream', chunks: events(started(state, true), final) })
    expect(await sendChatStreamTurn(options)).toMatchObject({ kind: 'final', response: { aiMessage: 'Reply' } })
    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[1][0]).toBe(open.mock.calls[0][0])
    expect(callbacks.onDelta).toHaveBeenCalledExactlyOnceWith('Partial')
    expect(callbacks.onReset).not.toHaveBeenCalled()
  })
  it.each(['network', 'aborted body', 'server error'])('resends once after %s before acceptance', async failure => {
    const { open, options } = setup()
    if (failure === 'server error') open.mockResolvedValueOnce({ kind: 'httpError', status: 503, error: 'Unavailable', code: null })
    else open.mockRejectedValueOnce(failure === 'network' ? new TypeError('Disconnected') : new DOMException('Body aborted', 'AbortError'))
    open.mockResolvedValueOnce({ kind: 'stream', chunks: events(started(), final) })
    expect(await sendChatStreamTurn(options)).toMatchObject({ kind: 'final' })
    expect(open).toHaveBeenCalledTimes(2)
  })
  it.each([final, interrupted, { type: 'error', status: 500, error: 'Unavailable' }])('does not resend terminal %j', async terminal => {
    const { open, options } = setup()
    open.mockResolvedValue({ kind: 'stream', chunks: events(started(), terminal) })
    expect(await sendChatStreamTurn(options)).toMatchObject({ kind: terminal.type })
    expect(open).toHaveBeenCalledTimes(1)
  })
  it.each([400, 401, 403, 408, 409, 429])('does not resend HTTP %s', async status => {
    const { open, options } = setup()
    open.mockResolvedValue({ kind: 'httpError', status, error: 'The turn key belongs to another payload.', code: 'CHAT_TURN_KEY_CONFLICT' })
    expect(await sendChatStreamTurn(options)).toMatchObject({ kind: 'httpError', status })
    expect(open).toHaveBeenCalledTimes(1)
  })
  it.each(['network', 'incomplete', 'server error'])('stops after the second %s failure', async failure => {
    const { open, options } = setup()
    if (failure === 'network') open.mockRejectedValue(new Error('Disconnected'))
    else if (failure === 'incomplete') open.mockImplementation(async () => ({ kind: 'stream', chunks: events(started()) }))
    else open.mockResolvedValue({ kind: 'httpError', status: 500, error: 'Unavailable', code: null })
    expect((await sendChatStreamTurn(options)).kind).toBe(failure === 'network' ? 'transportError' : failure === 'incomplete' ? 'incomplete' : 'httpError')
    expect(open).toHaveBeenCalledTimes(2)
  })
  it('does not resend after cancellation', async () => {
    const { open, options } = setup()
    let cancelled = false
    options.isCancelled = () => cancelled
    open.mockImplementation(async () => { cancelled = true; throw new DOMException('Cancelled', 'AbortError') })
    expect(await sendChatStreamTurn(options)).toEqual({ kind: 'cancelled' })
    expect(open).toHaveBeenCalledTimes(1)
  })
  it('does not resend if transport cleanup throws after final', async () => {
    const { open, options } = setup()
    async function* chunks() {
      try { yield* events(final) } finally { throw new Error('Close failed') }
    }
    open.mockResolvedValue({ kind: 'stream', chunks: chunks() })
    expect(await sendChatStreamTurn(options)).toMatchObject({ kind: 'transportError' })
    expect(open).toHaveBeenCalledTimes(1)
  })
})
