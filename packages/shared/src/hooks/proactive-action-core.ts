import type { QueryClient } from '@tanstack/query-core'
import { proactiveKeys } from '../query/keys'
import type { ChatStoreState } from '../stores/chat-store'
import type { Profile } from '../types/profile'
import type { ProactiveItem, ProactiveItemStatus } from '../types/proactive'
import { getProactiveActionReason } from '../utils/proactive'

type ProactiveProfile = Pick<Profile, 'aiMessagesUsed' | 'aiMessagesLimit'>
type ProactiveChat = Pick<ChatStoreState, 'isTyping' | 'streamingMessageId' | 'claimProactiveAction'>
type ProactiveSend = { isOnline: boolean; atLimit: boolean; onSend: (prompt: string) => Promise<void> }
export type ProactiveActionHook = (item: ProactiveItem, acted: boolean, isOnline: boolean, onSend: ProactiveSend['onSend']) => { reason: ReturnType<typeof getProactiveActionReason>; allowance: number; act: () => void }
export interface ProactiveStatusOptions {
  queryKey: ReturnType<typeof proactiveKeys.status>
  queryFn: (context: { signal: AbortSignal }) => Promise<ProactiveItemStatus>
  staleTime: number
  retry: false
}

export function proactiveStatusOptions(id: string, request: (id: string, signal: AbortSignal) => Promise<ProactiveItemStatus>): ProactiveStatusOptions {
  return {
    queryKey: proactiveKeys.status(id),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const status = await request(id, signal)
      if (signal.aborted) throw new Error('Proactive request cancelled')
      return status
    },
    staleTime: 0,
    retry: false,
  }
}

export interface ProactiveActionAdapters {
  useRef: <T>(initial: T) => { current: T }
  useEffect: (effect: () => void, dependencies: readonly unknown[]) => void
  useQueryClient: () => QueryClient
  useQuery: (options: ReturnType<typeof proactiveStatusOptions> & { enabled: boolean; refetchInterval: number }) => { data: ProactiveItemStatus | undefined; isError: boolean }
  useMutation: (options: { retry: false; mutationFn: () => Promise<void> }) => { isPending: boolean; mutate: () => void }
  useProfile: () => { profile: ProactiveProfile | undefined }
  useChatStore: { (selector: (state: ProactiveChat) => boolean): boolean; getState: () => ProactiveChat }
  getSessionEpoch: () => number
  requestStatus: (id: string, signal: AbortSignal) => Promise<ProactiveItemStatus>
  reportActed: (id: string) => Promise<unknown>
}

export async function actOnProactiveItem(item: ProactiveItem, adapters: Pick<ProactiveActionAdapters, 'getSessionEpoch' | 'useChatStore' | 'reportActed'>, queryClient: QueryClient, statusOptions: ReturnType<typeof proactiveStatusOptions>, getSend: () => ProactiveSend): Promise<void> {
  const epoch = adapters.getSessionEpoch()
  const latest = await queryClient.fetchQuery(statusOptions)
  if (epoch !== adapters.getSessionEpoch() || latest.status !== 'active') return
  const send = getSend()
  if (!send.isOnline || send.atLimit) return
  const chat = adapters.useChatStore.getState()
  if (chat.isTyping || chat.streamingMessageId !== null || !chat.claimProactiveAction(item.id)) return
  void adapters.reportActed(item.id).catch(() => undefined)
  void queryClient.invalidateQueries({ queryKey: proactiveKeys.current() })
  await send.onSend(item.actionPrompt)
}

export function createUseProactiveAction(adapters: ProactiveActionAdapters): ProactiveActionHook {
  const { useEffect, useRef, useQuery, useQueryClient, useMutation, useProfile, useChatStore } = adapters
  return function useProactiveAction(item: ProactiveItem, acted: boolean, isOnline: boolean, onSend: (prompt: string) => Promise<void>) {
    const { profile } = useProfile()
    const queryClient = useQueryClient()
    const busy = useChatStore((state) => state.isTyping || state.streamingMessageId !== null)
    const atLimit = profile !== undefined && profile.aiMessagesUsed >= profile.aiMessagesLimit
    const currentSend = useRef({ isOnline, atLimit, onSend })
    useEffect(() => { currentSend.current = { isOnline, atLimit, onSend } }, [isOnline, atLimit, onSend])
    const statusOptions = proactiveStatusOptions(item.id, adapters.requestStatus)
    const status = useQuery({ ...statusOptions, enabled: isOnline && !acted, refetchInterval: 30_000 })
    const action = useMutation({
      retry: false,
      mutationFn: () => actOnProactiveItem(item, adapters, queryClient, statusOptions, () => currentSend.current),
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
}
