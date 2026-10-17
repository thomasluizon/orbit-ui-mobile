'use client'

import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getProactiveActionReason } from '@orbit/shared/utils'
import { proactiveKeys } from '@orbit/shared/query'
import type { ProactiveItem } from '@orbit/shared/types'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { useChatStore } from '@/stores/chat-store'
import { getSessionEpoch } from '@/lib/session-epoch'
import { getProactiveItemStatus, reportProactiveActed } from '@/app/actions/chat'
import { getHeldAccountId } from '@/stores/auth-store'

export function useProactiveAction(item: ProactiveItem, acted: boolean, onSend: (prompt: string) => Promise<void>) {
  const { profile } = useProfile()
  const { isOnline } = useOffline()
  const queryClient = useQueryClient()
  const busy = useChatStore((state) => state.isTyping || state.streamingMessageId !== null)
  const atLimit = profile !== undefined && profile.aiMessagesUsed >= profile.aiMessagesLimit
  const currentSend = useRef({ isOnline, atLimit, onSend })
  useEffect(() => { currentSend.current = { isOnline, atLimit, onSend } }, [isOnline, atLimit, onSend])
  const statusOptions = {
    queryKey: proactiveKeys.status(item.id),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const status = await getProactiveItemStatus(item.id)
      if (signal.aborted) throw new Error('Proactive request cancelled')
      return status
    },
    staleTime: 0,
    retry: false,
  }
  const status = useQuery({ ...statusOptions, enabled: isOnline && !acted, refetchInterval: 30_000 })
  const action = useMutation({
    retry: false,
    mutationFn: async () => {
      const epoch = getSessionEpoch()
      const latest = await queryClient.fetchQuery(statusOptions)
      if (epoch !== getSessionEpoch() || latest.status !== 'active') return
      if (!currentSend.current.isOnline || currentSend.current.atLimit) return
      const chat = useChatStore.getState()
      if (chat.isTyping || chat.streamingMessageId !== null || !chat.claimProactiveAction(item.id)) return
      void reportProactiveActed(item.id, getHeldAccountId()).catch(() => undefined)
      void queryClient.invalidateQueries({ queryKey: proactiveKeys.current() })
      await currentSend.current.onSend(item.actionPrompt)
    },
  })
  const reason = getProactiveActionReason({
    ended: acted || status.data?.status === 'ended',
    online: isOnline,
    atLimit,
    busy: busy || action.isPending,
    failed: status.isError,
    ready: status.data !== undefined,
  })

  return { reason, allowance: profile?.aiMessagesLimit ?? 0, act: () => {
    if (!reason) action.mutate()
  } }
}
