import { notifyManager, type QueryClient } from '@tanstack/query-core'

export function resetAccountQueries(
  queryClient: QueryClient,
  mode: 'signed-in' | 'signed-out',
): Promise<void> {
  notifyManager.batch(() => {
    const queryCache = queryClient.getQueryCache()
    for (const query of queryCache.getAll()) {
      if (query.getObserversCount() === 0) {
        queryCache.remove(query)
        continue
      }

      void query.cancel({ silent: true })
      query.setOptions({ ...query.options, initialData: undefined })
      for (const observer of query.observers) {
        observer.setOptions({ ...observer.options, initialData: undefined })
      }
      query.setState({
        ...query.resetState,
        data: undefined,
        dataUpdatedAt: 0,
        fetchStatus: 'idle',
        status: 'pending',
      })
    }
    queryClient.getMutationCache().clear()
  })

  return mode === 'signed-in'
    ? Promise.resolve().then(() => queryClient.refetchQueries({ type: 'active' }))
    : Promise.resolve()
}
