import { ApiClientError } from '@orbit/shared'

export type RecordProxyUpstream = (response: Response) => void

export async function observeProxyFailure<T>(
  path: string,
  run: (recordUpstream: RecordProxyUpstream) => Promise<T>,
): Promise<T> {
  const startedAt = performance.now()
  let upstream: Response | null = null
  const recordUpstream: RecordProxyUpstream = (response) => { upstream = response }
  const logFailure = (status: number) => {
    if (status >= 200 && status < 300) return
    process.stderr.write(JSON.stringify({
      path,
      status,
      upstreamStatus: upstream?.status ?? null,
      apiRequestId: upstream?.headers.get('x-orbit-request-id') ?? null,
      renderRequestId: upstream?.headers.get('rndr-id') ?? null,
      elapsedMs: Math.round(performance.now() - startedAt),
    }) + '\n')
  }

  try {
    const result = await run(recordUpstream)
    if (result instanceof Response) logFailure(result.status)
    return result
  } catch (error) {
    logFailure(error instanceof ApiClientError ? error.status : 500)
    throw error
  }
}
