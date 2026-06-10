import { describe, expect, it } from 'vitest'
import { consumeChatSseStream, createChatSseParser } from '../chat/sse-stream'

const frame = (json: string) => `data: ${json}\n\n`

async function* chunksOf(...chunks: string[]) {
  for (const chunk of chunks) {
    yield chunk
  }
}

describe('createChatSseParser', () => {
  it('parses complete events as they arrive', () => {
    const parser = createChatSseParser()

    const events = parser.feed(frame('{"type":"started"}') + frame('{"type":"delta","text":"Hi"}'))

    expect(events).toEqual([
      { type: 'started' },
      { type: 'delta', text: 'Hi' },
    ])
  })

  it('buffers events fragmented across chunks', () => {
    const parser = createChatSseParser()

    expect(parser.feed('data: {"type":"del')).toEqual([])
    expect(parser.feed('ta","text":"He"}\n')).toEqual([])
    expect(parser.feed('\n')).toEqual([{ type: 'delta', text: 'He' }])
  })

  it('handles CRLF separators split across chunks', () => {
    const parser = createChatSseParser()

    expect(parser.feed('data: {"type":"reset"}\r')).toEqual([])
    expect(parser.feed('\n\r\n')).toEqual([{ type: 'reset' }])
  })

  it('ignores comment lines and unknown event shapes', () => {
    const parser = createChatSseParser()

    const events = parser.feed(
      ': keepalive\n\n' + frame('{"type":"mystery"}') + frame('{"type":"round","iteration":2}'),
    )

    expect(events).toEqual([{ type: 'round', iteration: 2 }])
  })

  it('parses final events carrying the full chat response', () => {
    const parser = createChatSseParser()
    const response = { aiMessage: 'done', actions: [], correlationId: 'trace-1' }

    const events = parser.feed(frame(JSON.stringify({ type: 'final', response })))

    expect(events).toEqual([
      {
        type: 'final',
        response: expect.objectContaining({ aiMessage: 'done', correlationId: 'trace-1' }),
      },
    ])
  })

  it('parses error events with and without code', () => {
    const parser = createChatSseParser()

    const events = parser.feed(
      frame('{"type":"error","status":403,"error":"limit","code":"paygate"}') +
        frame('{"type":"error","status":500,"error":"down"}'),
    )

    expect(events).toEqual([
      { type: 'error', status: 403, error: 'limit', code: 'paygate' },
      { type: 'error', status: 500, error: 'down' },
    ])
  })

  it('drops malformed json without breaking subsequent events', () => {
    const parser = createChatSseParser()

    const events = parser.feed(frame('{"type":') + frame('{"type":"started"}'))

    expect(events).toEqual([{ type: 'started' }])
  })
})

describe('consumeChatSseStream', () => {
  it('dispatches deltas and resolves on the final event, ignoring trailing chunks', async () => {
    const deltas: string[] = []
    const rounds: number[] = []

    const outcome = await consumeChatSseStream(
      chunksOf(
        frame('{"type":"started"}'),
        frame('{"type":"round","iteration":1}'),
        frame('{"type":"delta","text":"Hel"}') + frame('{"type":"delta","text":"lo"}'),
        frame('{"type":"final","response":{"aiMessage":"Hello","actions":[]}}'),
        frame('{"type":"delta","text":"ignored"}'),
      ),
      {
        onDelta: (text) => deltas.push(text),
        onReset: () => deltas.length = 0,
        onRound: (iteration) => rounds.push(iteration),
      },
    )

    expect(deltas).toEqual(['Hel', 'lo'])
    expect(rounds).toEqual([1])
    expect(outcome).toEqual({
      kind: 'final',
      response: expect.objectContaining({ aiMessage: 'Hello' }),
    })
  })

  it('resolves error outcomes with a null code default', async () => {
    const outcome = await consumeChatSseStream(
      chunksOf(frame('{"type":"error","status":500,"error":"down"}')),
      { onDelta: () => {}, onReset: () => {} },
    )

    expect(outcome).toEqual({ kind: 'error', status: 500, error: 'down', code: null })
  })

  it('invokes reset and resolves incomplete when the source ends without a terminal event', async () => {
    let resets = 0

    const outcome = await consumeChatSseStream(
      chunksOf(frame('{"type":"delta","text":"Hi"}') + frame('{"type":"reset"}')),
      { onDelta: () => {}, onReset: () => resets++ },
    )

    expect(resets).toBe(1)
    expect(outcome).toEqual({ kind: 'incomplete' })
  })
})
