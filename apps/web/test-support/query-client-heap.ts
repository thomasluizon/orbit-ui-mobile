import { AsyncLocalStorage } from 'node:async_hooks'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { setImmediate } from 'node:timers/promises'
import { habitKeys } from '@orbit/shared/query'
import type { QueryClient } from '@tanstack/react-query'

const requestStorage = new AsyncLocalStorage<ServerResponse>()
const responses: WeakRef<ServerResponse>[] = []

function reportPhase(phase: string) {
  process.stderr.write(`[heap probe ${performance.now().toFixed(1)} ms] ${phase}\n`)
}

function renderRequest(createClient: () => QueryClient) {
  const response = new ServerResponse(new IncomingMessage(new Socket()))
  responses.push(new WeakRef(response))
  requestStorage.run(response, () => {
    const client = createClient()
    client.setQueryData(habitKeys.list({}), Array.from({ length: 50_000 }, (_, index) => index))
  })
}

async function measureRetention() {
  reportPhase('imports: loading query client')
  const { getQueryClient } = await import('../lib/query-client')
  reportPhase('imports complete')
  if (!globalThis.gc) throw new Error('Run the query heap probe with --expose-gc')
  const samples = []
  for (let batch = 0; batch <= 4; batch += 1) {
    if (batch > 0) {
      reportPhase(`render: requests ${(batch - 1) * 100 + 1} through ${batch * 100}`)
      for (let request = 0; request < 100; request += 1) renderRequest(getQueryClient)
    }
    reportPhase(`garbage collection: ${batch * 100} requests`)
    await setImmediate()
    globalThis.gc()
    await setImmediate()
    globalThis.gc()
    reportPhase(`measurement: ${batch * 100} requests`)
    samples.push({
      requests: batch * 100,
      heapBytes: process.memoryUsage().heapUsed,
      retainedResponses: responses.filter(reference => reference.deref()).length,
    })
  }
  reportPhase('complete: 400 requests measured')
  process.stdout.write(JSON.stringify(samples) + '\n')
  process.exit(0)
}

void measureRetention()
