import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { setTimeout as delay } from 'node:timers/promises'
import { QueryClient } from '@tanstack/query-core'
import type {} from 'react'
import { expect, it, vi } from 'vitest'
import { benchmarkChatEvents } from '../../web/test-support/hermetic/mock-api/fixtures/chat-stream'
import { ChatTurnReconciliation } from '../../../packages/shared/src/chat/stream-turn'
import { runComposerStream, type ComposerStreamContext } from '../../../packages/shared/src/hooks/chat-send-stream-core'
import { createChatStoreState, type ChatStoreState } from '../../../packages/shared/src/stores/chat-store'

const probe = readFileSync(new URL('../../../tools/desktop-bench/probe.js', import.meta.url), 'utf8')
const chatSource = probe.slice(probe.indexOf('  async function chat()'), probe.indexOf('  async function run()'))

async function measureChat({ fragmented = false, interrupted = false, dispatchDelayMs = 0 } = {}) {
  let chat: ChatStoreState
  chat = createChatStoreState(patch => { chat = { ...chat, ...(typeof patch === 'function' ? patch(chat) : patch) } })
  chat.beginReply()
  const queryClient = new QueryClient()
  const reports: Array<{ kind: string; message: string }> = []
  const responses: Array<{ status: number; statusText: string; contentType: string | null }> = []
  const signals: AbortSignal[] = []
  const payload = benchmarkChatEvents.slice(0, interrupted ? -1 : undefined).map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
  const encoder = new TextEncoder()
  const createResponse = (signal: AbortSignal) => {
    const chunks = fragmented ? [...payload].map(character => encoder.encode(character)) : [encoder.encode(payload)]
    const body = new ReadableStream<Uint8Array>({
      start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }) },
      pull(controller) {
        const chunk = chunks.shift()
        if (chunk) controller.enqueue(chunk)
        else if (interrupted) controller.error(new Error('Connection lost before final'))
      },
    })
    return new Response(body, { status: 200, statusText: 'OK', headers: { 'content-type': 'text/event-stream' } })
  }
  async function* textChunks(response: Response) {
    const reader = response.body!.getReader() as ReadableStreamDefaultReader<Uint8Array>
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) return
        yield decoder.decode(chunk.value, { stream: true })
      }
    } finally { reader.releaseLock() }
  }
  const browser = {
    fetch: (url: string, options?: { signal?: AbortSignal; body?: string }) => {
      if (url === '/_bench/events') {
        reports.push(JSON.parse(options!.body!) as { kind: string; message: string })
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      expect(url).toBe('/api/chat/stream')
      return Promise.resolve(createResponse(options!.signal!))
    },
  }
  let rendered: string | null | undefined = ''
  const context: ComposerStreamContext<string, string> = {
    ...chat, getChat: () => chat, queryClient,
    t: key => key, allowanceText: key => key, onModuleLoadError: vi.fn(),
    activeStepsRef: { current: [] }, setActiveSteps: vi.fn(), stopReply: { current: null },
    scrollToBottom: revealed => revealed?.(), getAccountGeneration: () => 0,
    createTurnKey: () => 'benchmark-turn', createMessageId: () => 'benchmark-reply',
    turnReconciliation: new ChatTurnReconciliation(), buildChatFormData: request => request.content,
    isAbortError: error => error instanceof Error && error.name === 'AbortError',
    applyFinalResponse: response => { rendered = response.aiMessage; return Promise.resolve() },
    createTransport: (_request, reply) => async () => {
      const controller = reply.resetController()
      signals.push(controller.signal)
      reply.armIdleTimer()
      const response = await browser.fetch('/api/chat/stream', { signal: controller.signal })
      responses.push({ status: response.status, statusText: response.statusText, contentType: response.headers.get('content-type') })
      return { kind: 'stream', chunks: textChunks(response) }
    },
  }
  let sending: ReturnType<typeof runComposerStream> | undefined
  class Textarea {
    text = ''
    get value() { return this.text }
    set value(value: string) { this.text = value }
    focus() {}
    dispatchEvent(event: { type: string }) {
      if (event.type === 'keydown') sending = delay(dispatchDelayMs).then(() => runComposerStream(context, { content: this.value, image: null, messageCost: 1 }))
    }
  }
  const textarea = new Textarea()
  let conversationOpen = false
  class InputEvent { constructor(public type: string) {} }
  const sandbox = {
    window: browser, fetch: browser.fetch, Request, Response, ReadableStream, TransformStream, TextDecoder,
    performance, HTMLTextAreaElement: Textarea, Event: InputEvent, KeyboardEvent: InputEvent,
    document: {
      querySelector: (selector: string) => {
        if (selector === '[data-astra-button]:not([disabled])') return { click: () => { conversationOpen = true } }
        if (selector === '[data-shell-conversation] [data-composer-input]:not([disabled])') return conversationOpen ? textarea : null
        return null
      },
      querySelectorAll: () => rendered ? [{ innerText: rendered }] : chat.messages.map(message => ({ innerText: message.content })),
    },
    pause: () => Promise.resolve(), frame: () => Promise.resolve(),
    post: (event: { kind: string; message: string }) => { reports.push(event); return Promise.resolve() },
    until: (read: () => unknown, label: string) => vi.waitFor(() => {
      const result = read()
      if (!result) throw new Error(label)
      return result
    }, { interval: 1, timeout: 20000 }),
  }
  runInNewContext(`${chatSource}\nglobalThis.measure = chat`, sandbox)
  try {
    const measure = (sandbox as typeof sandbox & { measure: () => Promise<{ finalEventMs: number; firstTokenMs: number }> }).measure
    let failure: unknown
    let measured: Awaited<ReturnType<typeof measure>> | undefined
    try { measured = await measure() } catch (error) { failure = error }
    const outcome = await sending
    await delay(10)
    return { measured, failure, outcome, reports, responses, signals }
  } finally { queryClient.clear() }
}

it.each([
  { fragmented: false, dispatchDelayMs: 0 },
  { fragmented: true, dispatchDelayMs: 0 },
  { fragmented: false, dispatchDelayMs: 2500 },
])('measures the terminal event before the production composer aborts its completed request: fragmented=$fragmented, dispatchDelayMs=$dispatchDelayMs', async options => {
  const result = await measureChat(options)
  expect(result.outcome).toEqual({ kind: 'final' })
  expect(result.signals).toHaveLength(1)
  expect(result.signals[0]?.aborted).toBe(true)
  expect(result.reports).toEqual([])
  expect(result.failure).toBeUndefined()
  expect(result.responses).toEqual([{ status: 200, statusText: 'OK', contentType: 'text/event-stream' }])
  expect(result.measured?.finalEventMs).toBeGreaterThanOrEqual(0)
}, 60000)

it('refuses a stream interrupted before the final event', async () => {
  const result = await measureChat({ interrupted: true })
  expect(result.outcome?.kind).toBe('failed')
  expect(result.failure).toBeInstanceOf(Error)
  expect(result.failure).toMatchObject({ message: 'final rendered part' })
  expect(result.measured).toBeUndefined()
  expect(result.signals.every(signal => signal.aborted)).toBe(true)
}, 60000)
