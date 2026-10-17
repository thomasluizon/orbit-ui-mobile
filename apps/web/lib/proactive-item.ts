import type { QueryClient } from '@tanstack/react-query'
import { proactiveKeys } from '@orbit/shared/query'
import type { ProactiveItem } from '@orbit/shared/types'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { getSessionEpoch } from '@/lib/session-epoch'
import { getCurrentProactiveItem, reportProactiveOpened } from '@/app/actions/chat'
import { getHeldAccountId } from '@/stores/auth-store'


export const currentProactiveOptions = {
  queryKey: proactiveKeys.current(),
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    const item = await getCurrentProactiveItem()
    if (signal.aborted) throw new Error('Proactive request cancelled')
    return item ?? null
  },
  staleTime: 30_000,
}

export function openProactiveItem(item: ProactiveItem) {
  if (useChatStore.getState().openProactiveItem(item)) {
    void reportProactiveOpened(item.id, getHeldAccountId()).catch(() => undefined)
  }
  useUIStore.getState().setAstraConversationOpen(true)
}

export async function openCurrentProactiveItem(queryClient: QueryClient) {
  const epoch = getSessionEpoch()
  let item: ProactiveItem | null
  try {
    item = await queryClient.fetchQuery({ ...currentProactiveOptions, staleTime: 0 })
  } catch {
    item = queryClient.getQueryData<ProactiveItem | null>(proactiveKeys.current()) ?? null
  }
  if (epoch !== getSessionEpoch()) return
  if (item) openProactiveItem(item)
  else useUIStore.getState().setAstraConversationOpen(true)
}
