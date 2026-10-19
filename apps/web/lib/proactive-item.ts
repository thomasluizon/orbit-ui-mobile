import { createProactiveItemController } from '@orbit/shared/hooks'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { getSessionEpoch } from '@/lib/session-epoch'
import { getCurrentProactiveItem, reportProactiveOpened } from '@/app/actions/chat'
import { getHeldAccountId } from '@/stores/auth-store'

export const proactiveItemController = createProactiveItemController({
  requestCurrent: getCurrentProactiveItem,
  reportOpened: (id) => reportProactiveOpened(id, getHeldAccountId()),
  getChat: useChatStore.getState,
  openConversation: () => useUIStore.getState().setAstraConversationOpen(true),
  getSessionEpoch,
})

export const { openCurrentProactiveItem } = proactiveItemController
