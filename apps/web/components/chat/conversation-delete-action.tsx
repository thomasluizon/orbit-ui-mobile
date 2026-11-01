'use client'

import { useTranslations } from 'next-intl'
import { APP_BAR_CONTROL_CLASS } from '@/components/ui/app-bar'
import { Trash2 } from '@/components/ui/icons'
import { useChatStore } from '@/stores/chat-store'

export function ConversationDeleteAction({ onDelete, isSending, operationBusy }: Readonly<{ onDelete: () => void; isSending: boolean; operationBusy: boolean }>) {
  const t = useTranslations()
  const id = useChatStore(state => state.serverConversationId)
  const busy = useChatStore(state => state.conversationBusy || state.queuedPrompts.length > 0)
  return id ? <button type="button" aria-label={t('chat.conversation.delete')} className={APP_BAR_CONTROL_CLASS} disabled={busy || isSending || operationBusy} onClick={onDelete}><Trash2 size={20} strokeWidth={2} aria-hidden="true" /></button> : null
}
