import { onlineManager, type QueryClient } from '@tanstack/query-core'
import { proactiveKeys } from '../query/keys'
import type { ChatStoreState } from '../stores/chat-store'
import type { ProactiveItem } from '../types/proactive'

interface ProactiveItemAdapters {
  requestCurrent: (signal: AbortSignal) => Promise<ProactiveItem | null | undefined>
  reportOpened: (id: string) => Promise<unknown>
  getChat: () => Pick<ChatStoreState, 'openProactiveItem'>
  openConversation: () => void
  getSessionEpoch: () => number
}

export interface ProactiveCurrentOptions {
  queryKey: ReturnType<typeof proactiveKeys.current>
  queryFn: (context: { signal: AbortSignal }) => Promise<ProactiveItem | null>
  staleTime: number
}

export interface ProactiveItemController {
  currentProactiveOptions: ProactiveCurrentOptions
  openProactiveItem: (item: ProactiveItem) => void
  openCurrentProactiveItem: (queryClient: QueryClient) => Promise<void>
}

export function createProactiveItemController(adapters: ProactiveItemAdapters): ProactiveItemController {
  const currentProactiveOptions = {
    queryKey: proactiveKeys.current(),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const item = await adapters.requestCurrent(signal)
      if (signal.aborted) throw new Error('Proactive request cancelled')
      return item ?? null
    },
    staleTime: 30_000,
  }

  function openProactiveItem(item: ProactiveItem): void {
    if (adapters.getChat().openProactiveItem(item)) {
      void adapters.reportOpened(item.id).catch(() => undefined)
    }
    adapters.openConversation()
  }

  async function openCurrentProactiveItem(queryClient: QueryClient): Promise<void> {
    const epoch = adapters.getSessionEpoch()
    let item: ProactiveItem | null
    try {
      item = onlineManager.isOnline()
        ? await queryClient.fetchQuery({ ...currentProactiveOptions, staleTime: 0 })
        : queryClient.getQueryData<ProactiveItem | null>(proactiveKeys.current()) ?? null
    } catch {
      item = queryClient.getQueryData<ProactiveItem | null>(proactiveKeys.current()) ?? null
    }
    if (epoch !== adapters.getSessionEpoch()) return
    if (item) openProactiveItem(item)
    else adapters.openConversation()
  }

  return { currentProactiveOptions, openProactiveItem, openCurrentProactiveItem }
}

export function proactiveItemQueryOptions(controller: ProactiveItemController, isAuthenticated: boolean): ProactiveCurrentOptions & { enabled: boolean; refetchInterval: number } {
  return { ...controller.currentProactiveOptions, enabled: isAuthenticated, refetchInterval: 60_000 }
}

export function proactiveItemQueryResult<T extends { data: ProactiveItem | null | undefined }>(query: T, openItem: (item: ProactiveItem) => void): T & { item: ProactiveItem | null; openItem: typeof openItem } {
  return { ...query, item: query.data ?? null, openItem }
}
