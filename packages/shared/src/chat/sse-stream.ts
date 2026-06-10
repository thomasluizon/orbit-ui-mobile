import { chatStreamEventSchema, type ChatResponse, type ChatStreamEvent } from '../types/chat'

/**
 * Incremental parser for the chat SSE stream. Feed raw text chunks as they
 * arrive; each call returns the events completed by that chunk. Frames on
 * blank lines, joins multi-line `data:` payloads, and ignores comments and
 * payloads that do not match the shared contract so a future protocol
 * addition never breaks an older client mid-stream.
 */
export interface ChatSseParser {
  feed: (chunk: string) => ChatStreamEvent[]
}

export function createChatSseParser(): ChatSseParser {
  let buffer = ''

  return {
    feed(chunk) {
      buffer = (buffer + chunk).replace(/\r\n/g, '\n')
      const events: ChatStreamEvent[] = []

      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + 2)

        const event = parseEventBlock(block)
        if (event) events.push(event)

        separatorIndex = buffer.indexOf('\n\n')
      }

      return events
    },
  }
}

export interface ChatStreamCallbacks {
  onDelta: (text: string) => void
  onReset: () => void
  onRound?: (iteration: number) => void
}

export type ChatStreamOutcome =
  | { kind: 'final'; response: ChatResponse }
  | { kind: 'error'; status: number; error: string; code: string | null }
  | { kind: 'incomplete' }

/**
 * Drives the chat SSE protocol over any text-chunk source: dispatches
 * delta/reset/round to the callbacks and resolves on the stream's terminal
 * event. Resolves `incomplete` when the source ends without final or error,
 * which callers must treat as a failed send.
 */
export async function consumeChatSseStream(
  chunks: AsyncIterable<string>,
  callbacks: ChatStreamCallbacks,
): Promise<ChatStreamOutcome> {
  const parser = createChatSseParser()

  for await (const chunk of chunks) {
    for (const event of parser.feed(chunk)) {
      switch (event.type) {
        case 'delta':
          callbacks.onDelta(event.text)
          break
        case 'reset':
          callbacks.onReset()
          break
        case 'round':
          callbacks.onRound?.(event.iteration)
          break
        case 'final':
          return { kind: 'final', response: event.response }
        case 'error':
          return { kind: 'error', status: event.status, error: event.error, code: event.code ?? null }
        case 'started':
          break
      }
    }
  }

  return { kind: 'incomplete' }
}

function parseEventBlock(block: string): ChatStreamEvent | null {
  const payload = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n')

  if (!payload) return null

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(payload)
  } catch {
    return null
  }

  const result = chatStreamEventSchema.safeParse(parsedJson)
  return result.success ? result.data : null
}
