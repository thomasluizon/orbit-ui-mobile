import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { benchmarkChatEvents, benchmarkTokens, sendBenchmarkChatStream } from '../../apps/web/test-support/hermetic/mock-api/fixtures/chat-stream'
import { consumeChatSseStream } from '../../packages/shared/src/chat/sse-stream'

async function main() {
  const server = createServer((_request, response) => { void sendBenchmarkChatStream(response) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const response = await fetch(`http://127.0.0.1:${address.port}`)
    assert.ok(response.body)
    const reader = response.body.getReader()
    async function* chunks() {
      const decoder = new TextDecoder()
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) return
        yield decoder.decode(chunk.value, { stream: true })
      }
    }
    const deltas: string[] = []
    const outcome = await consumeChatSseStream(chunks(), { onDelta: (text) => deltas.push(text), onReset: () => assert.fail('Unexpected reset') })
    assert.deepEqual(benchmarkChatEvents.map((event) => event.type), ['started', 'delta', 'delta', 'delta', 'final'])
    assert.deepEqual(deltas, benchmarkTokens)
    assert.equal(outcome.kind, 'final')
    if (outcome.kind === 'final') assert.equal(outcome.response.aiMessage, benchmarkTokens.join(''))
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

void main().catch((error: unknown) => { process.stderr.write(String(error)); process.exitCode = 1 })
