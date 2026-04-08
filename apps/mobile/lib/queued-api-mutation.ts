import type { QueuedMutationBuildOptions } from './offline-mutations'
import type { QueuedMarker } from './offline-mutations'
import type { QueuedMutation } from '@orbit/shared/types/sync'
import { runQueuedMutation } from './offline-mutations'
import { apiClient } from './api-client'

export async function performQueuedApiMutation<
  TResult = void,
  TQueuedResult = TResult | QueuedMarker,
>({
  execute,
  queuedResult,
  queuedResultFactory,
  ...mutation
}: QueuedMutationBuildOptions & {
  execute?: (mutation: QueuedMutation) => Promise<TResult>
  queuedResult?: TResult
  queuedResultFactory?: (mutationId: string) => TQueuedResult
}): Promise<TResult | TQueuedResult> {
  return runQueuedMutation({
    mutation,
    execute:
      execute ??
      (async (resolvedMutation) =>
        apiClient<TResult>(resolvedMutation.endpoint, {
          method: resolvedMutation.method,
          body:
            resolvedMutation.payload === undefined
              ? undefined
              : JSON.stringify(resolvedMutation.payload),
        })),
    queuedResult: queuedResult as TResult,
    queuedResultFactory,
  })
}
