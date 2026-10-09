import { createApiClientError, extractBackendStatus } from '../utils/error-utils'
import { errorRetryAfter, isUpstreamStarting } from './retry'
import { accountEventPayloadSchema, type AccountEventPayload } from '../types/account-event'

export type ParsedAccountEvent =
  | { type: 'ready'; connectionId: string; id: null }
  | { type: 'changes' | 'resync'; payload: AccountEventPayload; id: string | null }

export function createAccountEventParser(): { feed: (chunk: string) => ParsedAccountEvent[] } {
  let buffer = ''

  return {
    feed(chunk: string): ParsedAccountEvent[] {
      buffer += chunk
      const events: ParsedAccountEvent[] = []
      let boundary = buffer.search(/\r?\n\r?\n/)
      while (boundary >= 0) {
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n'
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + separator.length)
        const event = parseBlock(block)
        if (event) events.push(event)
        boundary = buffer.search(/\r?\n\r?\n/)
      }
      return events
    },
  }
}

function parseBlock(block: string): ParsedAccountEvent | null {
  const lines = block.split(/\r?\n/)
  const field = (name: string) => lines
    .filter((line) => line.startsWith(`${name}:`))
    .map((line) => line.slice(name.length + 1).trimStart())
  const type = field('event')[0]
  const payloadText = field('data').join('\n')
  if (!type || !payloadText) return null
  let payload: unknown
  try {
    payload = JSON.parse(payloadText)
  } catch {
    return null
  }
  if (type === 'ready') {
    if (typeof payload !== 'object' || payload === null || !('connectionId' in payload)) return null
    return typeof payload.connectionId === 'string' && payload.connectionId
      ? { type, connectionId: payload.connectionId, id: null } : null
  }
  if (type !== 'changes' && type !== 'resync') return null
  const result = accountEventPayloadSchema.safeParse(payload)
  if (!result.success) return { type: 'resync', payload: { v: 1, changes: [] }, id: field('id')[0] || null }
  return { type, payload: result.data, id: field('id')[0] || null }
}

interface StreamResponse {
  ok: boolean
  status?: number
  headers?: { get: (name: string) => string | null }
  body: { getReader: () => ReadableStreamDefaultReader<Uint8Array> } | null
}

interface AccountEventStreamOptions {
  open: (signal: AbortSignal, lastEventId: string | null) => Promise<StreamResponse>
  lastEventId?: string | null
  resumed?: boolean
  onEvent: (event: ParsedAccountEvent) => void
  onOpen: (openedAt: number, hasReplayCursor: boolean) => void
  onFirstFailure?: (failedAt: number) => void
  onReconnect: () => void
  signal: AbortSignal
}

function waitForRetry(signal: AbortSignal, delay: number): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(finish, delay)
    function finish() {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
  })
}

function streamIsActive(signal: AbortSignal): boolean {
  return !signal.aborted
}

export async function consumeAccountEventStream(options: AccountEventStreamOptions): Promise<void> {
  let lastEventId: string | null = options.lastEventId ?? null
  let retry = 0
  let reportNextFailure = options.resumed ?? false
  while (!options.signal.aborted) {
    let opened = false
    let retryAfter: number | null = null
    try {
      const response = await options.open(options.signal, lastEventId)
      const body = requireStreamBody(response)
      opened = true
      reportNextFailure = true
      if (streamIsActive(options.signal)) options.onOpen(Date.now(), Boolean(lastEventId))
      await readEvents(body, options.signal, (event) => {
        if (event.id) lastEventId = event.id
        options.onEvent(event)
        retry = 0
      })
    } catch (error: unknown) {
      retryAfter = errorRetryAfter(error)
      retry = Math.min(retry + 1, 5)
      if (!opened && reportNextFailure && extractBackendStatus(error) !== 429 && !isUpstreamStarting(error) && streamIsActive(options.signal)) {
        reportNextFailure = false
        options.onFirstFailure?.(Date.now())
      }
    }
    if (opened && streamIsActive(options.signal)) options.onReconnect()
    await waitForRetry(options.signal, retryAfter ?? Math.min(1000 * 2 ** retry, 30000))
  }
}

function requireStreamBody(response: StreamResponse): NonNullable<StreamResponse['body']> {
  if (!response.ok) throw createApiClientError(response.status ?? 503, null, 'Account event stream unavailable', response.headers?.get('retry-after'))
  if (!response.body) throw new Error('Account event stream unavailable')
  return response.body
}

async function readEvents(
  body: NonNullable<StreamResponse['body']>,
  signal: AbortSignal,
  onEvent: (event: ParsedAccountEvent) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = createAccountEventParser()
  try {
    for (;;) {
      if (signal.aborted) return
      const { done, value } = await reader.read()
      if (done) return
      for (const event of parser.feed(decoder.decode(value, { stream: true }))) onEvent(event)
    }
  } finally {
    void reader.cancel().catch(() => {})
  }
}
