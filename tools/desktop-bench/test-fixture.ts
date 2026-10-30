import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { benchmarkChatEvents, benchmarkTokens } from '../../apps/web/test-support/hermetic/mock-api/fixtures/chat-stream'
import { handleRequest } from '../../apps/web/test-support/hermetic/mock-api/request-handler'
import { mintHermeticJwt } from '../../apps/web/test-support/hermetic/hermetic-session'
import { consumeChatSseStream } from '../../packages/shared/src/chat/sse-stream'

async function main() {
  const server = createServer(handleRequest)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const url = `http://127.0.0.1:${address.port}/api/chat/stream`
    delete process.env.ORBIT_DESKTOP_BENCH
    const headers = { Authorization: `Bearer ${mintHermeticJwt(undefined, [], [], 'desktop-bench')}` }
    const disabled = await fetch(url, { method: 'POST', headers })
    assert.equal(disabled.headers.get('content-type'), 'application/json')
    await disabled.arrayBuffer()
    process.env.ORBIT_DESKTOP_BENCH = '1'
    const unrelated = await fetch(url, { method: 'POST' })
    assert.equal(unrelated.headers.get('content-type'), 'application/json')
    await unrelated.arrayBuffer()
    const response = await fetch(url, { method: 'POST', headers })
    assert.equal(response.headers.get('content-type'), 'text/event-stream')
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
