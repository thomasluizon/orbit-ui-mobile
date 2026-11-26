import { describe, expect, it } from 'vitest'
import { getBodyReader, readBodyChunks } from '../utils/body-reader'

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(body: Parameters<typeof readBodyChunks>[0]): Promise<string[]> {
  const decoder = new TextDecoder()
  const out: string[] = []
  for await (const chunk of readBodyChunks(body)) out.push(decoder.decode(chunk))
  return out
}

describe('readBodyChunks', () => {
  it('returns no chunks for a null body', async () => {
    expect(await collect(null)).toEqual([])
  })

  it('returns no chunks for an undefined body', async () => {
    expect(await collect(undefined)).toEqual([])
  })

  it('returns no chunks for a response with a null body', async () => {
    const response = new Response(null, { status: 204 })
    expect(response.body).toBeNull()
    expect(await collect(response.body)).toEqual([])
  })

  it('returns every chunk of a real body in order', async () => {
    expect(await collect(streamOf('a', 'b', 'c'))).toEqual(['a', 'b', 'c'])
  })

  it('releases the reader lock when the consumer stops early', async () => {
    const body = streamOf('a', 'b')
    for await (const _chunk of readBodyChunks(body)) break
    expect(body.locked).toBe(false)
  })
})

describe('getBodyReader', () => {
  it('returns a reader that is done at once for a missing body', async () => {
    const reader = getBodyReader(undefined)
    expect(await reader.read()).toEqual({ done: true })
    expect(() => reader.releaseLock()).not.toThrow()
    await expect(reader.cancel?.()).resolves.toBeUndefined()
  })

  it('returns the real reader for a body', async () => {
    const reader = getBodyReader(streamOf('x'))
    expect((await reader.read()).done).toBe(false)
    expect((await reader.read()).done).toBe(true)
  })
})
