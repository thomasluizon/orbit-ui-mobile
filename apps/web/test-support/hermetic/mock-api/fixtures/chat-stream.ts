import type { ServerResponse } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { chatStreamEventSchema, type ChatStreamEvent } from '@orbit/shared/types/chat'

export const benchmarkTokens = ['A small ', 'step ', 'counts.']

export const benchmarkChatEvents: ChatStreamEvent[] = [
  { type: 'started' },
  ...benchmarkTokens.map((text): ChatStreamEvent => ({ type: 'delta', text })),
  { type: 'final', response: { aiMessage: benchmarkTokens.join(''), actions: [] } },
].map((event) => chatStreamEventSchema.parse(event))

export async function sendBenchmarkChatStream(response: ServerResponse): Promise<void> {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no' })
  response.flushHeaders()
  for (const event of benchmarkChatEvents) {
    if (event.type !== 'started') await delay(80)
    if (response.destroyed) return
    response.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  response.end()
}
