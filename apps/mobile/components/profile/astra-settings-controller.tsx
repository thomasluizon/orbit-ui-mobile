import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys, connectionKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { NOTION_CALLBACK_PATH, notionAuthorizationSchema, notionConnectionSchema, type NotionConnection } from '@orbit/shared/types/notion-connection'
import { useConfig } from '@/hooks/use-config'
import { useOffline } from '@/hooks/use-offline'
import { apiClient } from '@/lib/api-client'
import { getAccountGeneration } from '@/lib/session-epoch'
import { APP_LINK_ORIGIN } from '@/lib/app-link-origin'

async function fetchNotionConnection(): Promise<NotionConnection> {
  return apiClient(API.connections.notion, {}, notionConnectionSchema)
}

export interface AstraSettingsController {
  aiSummaryEnabled: boolean
  proactiveAstraEnabled: boolean
  summaryPending: boolean
  proactivePending: boolean
  onToggleSummary: () => void
  onToggleProactive: () => void
}

export function useAstraSettingsController(
  profile: Profile | undefined,
  patchProfile: (patch: Partial<Profile>) => void,
): AstraSettingsController {
  const queryClient = useQueryClient()
  const aiSummaryEnabled = Boolean(profile?.hasProAccess && profile.aiSummaryEnabled)
  const proactiveAstraEnabled = Boolean(
    profile?.hasProAccess && profile.proactiveAstraEnabled,
  )
  const aiSummaryMutation = useMutation({
    mutationFn: (enabled: boolean) => performQueuedApiMutation({
      type: 'setAiSummary',
      scope: 'profile',
      endpoint: API.profile.aiSummary,
      method: 'PUT',
      payload: { enabled },
      dedupeKey: 'profile-ai-summary',
    }),
    onMutate: (enabled) => {
      const previous = profile?.aiSummaryEnabled
      patchProfile({ aiSummaryEnabled: enabled })
      return { previous }
    },
    onError: (_error, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiSummaryEnabled: context.previous })
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
  // react-doctor-disable-next-line query-mutation-missing-invalidation -- The optimistic profile cache update mirrors the stored boolean and rolls back on error. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const proactiveMutation = useMutation({
    mutationFn: (enabled: boolean) => performQueuedApiMutation({
      type: 'setProactiveAstra',
      scope: 'profile',
      endpoint: API.profile.proactiveAstra,
      method: 'PUT',
      payload: { enabled },
      dedupeKey: 'profile-proactive-astra',
    }),
    onMutate: (enabled) => {
      const previous = profile?.proactiveAstraEnabled
      patchProfile({ proactiveAstraEnabled: enabled })
      return { previous }
    },
    onError: (_error, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ proactiveAstraEnabled: context.previous })
      }
    },
  })

  return {
    aiSummaryEnabled,
    proactiveAstraEnabled,
    summaryPending: aiSummaryMutation.isPending,
    proactivePending: proactiveMutation.isPending,
    onToggleSummary: () => aiSummaryMutation.mutate(!aiSummaryEnabled),
    onToggleProactive: () => proactiveMutation.mutate(!proactiveAstraEnabled),
  }
}

export function useNotionConnectionController(hasProAccess: boolean) {
  const { config } = useConfig()
  const { isOnline } = useOffline()
  const queryClient = useQueryClient()
  const visible = config.features.notion_integration?.enabled === true
  const enabled = visible && hasProAccess
  const connection = useQuery({
    queryKey: connectionKeys.notion(),
    queryFn: fetchNotionConnection,
    enabled: enabled && isOnline,
    staleTime: 0,
  })
  const authorize = useMutation({
    mutationFn: async (generation: number) => {
      const authorization = await apiClient(API.connections.notionAuthorize, {
        method: 'POST', body: JSON.stringify({ redirectUri: `${APP_LINK_ORIGIN}${NOTION_CALLBACK_PATH}` }),
        isCurrent: () => getAccountGeneration() === generation,
      }, notionAuthorizationSchema)
      if (getAccountGeneration() !== generation) throw new Error('Account changed')
      return authorization
    },
  })
  const disconnect = useMutation({
    mutationFn: (generation: number) => apiClient<void>(API.connections.notion, { method: 'DELETE', isCurrent: () => getAccountGeneration() === generation }),
    onSuccess: (_response, generation) => {
      if (getAccountGeneration() !== generation) return
      void queryClient.resetQueries({ queryKey: connectionKeys.notion() })
    },
  })
  return { visible, enabled, isOnline, connection, authorize, disconnect }
}
