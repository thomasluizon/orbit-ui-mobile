import { AsyncLocalStorage } from 'node:async_hooks'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { setImmediate } from 'node:timers/promises'
import { habitKeys } from '@orbit/shared/query'
import { getQueryClient } from '../lib/query-client'

const requestStorage = new AsyncLocalStorage<ServerResponse>()
const responses: WeakRef<ServerResponse>[] = []

function renderRequest() {
  const response = new ServerResponse(new IncomingMessage(new Socket()))
  responses.push(new WeakRef(response))
  requestStorage.run(response, () => {
    const client = getQueryClient()
    client.setQueryData(habitKeys.list({}), Array.from({ length: 50_000 }, (_, index) => index))
  })
}

async function measureRetention() {
  if (!globalThis.gc) throw new Error('Run the query heap probe with --expose-gc')
  const samples = []
  for (let batch = 0; batch <= 4; batch += 1) {
    if (batch > 0) {
      for (let request = 0; request < 100; request += 1) renderRequest()
    }
    await setImmediate()
    globalThis.gc()
    await setImmediate()
    globalThis.gc()
    samples.push({
      requests: batch * 100,
      heapBytes: process.memoryUsage().heapUsed,
      retainedResponses: responses.filter(reference => reference.deref()).length,
    })
  }
  process.stdout.write(JSON.stringify(samples) + '\n')
  process.exit(0)
}

void measureRetention()
