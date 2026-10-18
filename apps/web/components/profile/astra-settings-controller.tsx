'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Profile } from '@orbit/shared/types/profile'
import { habitKeys, connectionKeys } from '@orbit/shared/query'
import { updateAiSummary, updateProactiveAstra, authorizeNotion, disconnectNotion } from '@/lib/actions/profile'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { NOTION_CALLBACK_PATH, notionConnectionAccess, notionConnectionSchema, type NotionConnection } from '@orbit/shared/types/notion-connection'
import { useConfig } from '@/hooks/use-config'
import { useOffline } from '@/hooks/use-offline'
import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { API } from '@orbit/shared/api'
import { createApiClientError } from '@orbit/shared/utils'

async function fetchNotionConnection(): Promise<NotionConnection> {
  const response = await fetchWithThrottle(API.connections.notion)
  if (!response.ok) throw createApiClientError(response.status, null, 'Connection unavailable')
  return notionConnectionSchema.parse(await response.json())
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
  const aiSummaryMutation = useAccountScopedMutation({
    mutationFn: (enabled: boolean, intendedAccountId) =>
      updateAiSummary({ enabled }, intendedAccountId),
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
  const proactiveMutation = useAccountScopedMutation({
    mutationFn: (enabled: boolean, intendedAccountId) =>
      updateProactiveAstra({ enabled }, intendedAccountId),
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
  const { visible, enabled } = notionConnectionAccess(config.features.notion_integration?.enabled, hasProAccess)
  const connection = useQuery({
    queryKey: connectionKeys.notion(),
    queryFn: fetchNotionConnection,
    enabled: enabled && isOnline,
    staleTime: 0,
  })
  const authorize = useAccountScopedMutation({
    mutationFn: (_input: void, intendedAccountId) => authorizeNotion({ redirectUri: `${window.location.origin}${NOTION_CALLBACK_PATH}` }, intendedAccountId),
  })
  const disconnect = useAccountScopedMutation({
    mutationFn: (_input: void, intendedAccountId) => disconnectNotion(intendedAccountId),
    onSuccess: () => {
      void queryClient.resetQueries({ queryKey: connectionKeys.notion() })
    },
  })
  return { visible, enabled, isOnline, connection, authorize, disconnect }
}
