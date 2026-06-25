import { useState, useMemo } from 'react'
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import type {
  AgentCapability,
  ApiKey,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
} from '@orbit/shared/types'
import { aiKeys, apiKeyKeys } from '@orbit/shared/query'
import { apiClient } from '@/lib/api-client'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'

const MAX_API_KEYS = 5

interface ScopeOption {
  scope: string
  label: string
  description: string
}

interface UseApiKeyManagementParams {
  hasProAccess: boolean
  isOnline: boolean
  queryClient: QueryClient
  t: (key: string, params?: Record<string, unknown>) => string
}

/** Owns the Orbit MCP API-key surface: list + capabilities queries, scope
 *  options, create/revoke flow, and the modal/error/revoke state. Hooks run in
 *  the same order they previously sat inline in the Advanced screen. */
export function useApiKeyManagement({
  hasProAccess,
  isOnline,
  queryClient,
  t,
}: Readonly<UseApiKeyManagementParams>) {
  const apiKeysQuery = useQuery({
    queryKey: apiKeyKeys.lists(),
    queryFn: () => apiClient<ApiKey[]>(API.apiKeys.list),
    enabled: hasProAccess,
    staleTime: 5 * 60 * 1000,
  })

  const capabilitiesQuery = useQuery({
    queryKey: aiKeys.capabilities(),
    queryFn: () => apiClient<AgentCapability[]>(API.ai.capabilities),
    enabled: hasProAccess,
    staleTime: 5 * 60 * 1000,
  })

  const apiKeys = apiKeysQuery.data ?? []
  const scopeOptions = useMemo<ScopeOption[]>(() => {
    const grouped = new Map<string, string[]>()

    for (const capability of capabilitiesQuery.data ?? []) {
      const descriptions = grouped.get(capability.scope) ?? []
      descriptions.push(capability.displayName)
      grouped.set(capability.scope, descriptions)
    }

    return Array.from(grouped.entries())
      .map(([scope, labels]) => ({
        scope,
        label: scope,
        description: labels.join(', '),
      }))
      .sort((left, right) => left.scope.localeCompare(right.scope))
  }, [capabilitiesQuery.data])
  const canCreateKey = apiKeys.length < MAX_API_KEYS
  const canCreateScopedKey =
    canCreateKey &&
    !capabilitiesQuery.isLoading &&
    !capabilitiesQuery.error &&
    scopeOptions.length > 0

  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false)
  const [createKeyError, setCreateKeyError] = useState<string | null>(null)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) =>
      performQueuedApiMutation({
        type: 'deleteApiKey',
        scope: 'apiKeys',
        endpoint: API.apiKeys.delete(id),
        method: 'DELETE',
        payload: undefined,
        targetEntityId: id,
        dedupeKey: `api-key-delete-${id}`,
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: apiKeyKeys.all })
      const previous = queryClient.getQueryData<ApiKey[]>(apiKeyKeys.lists())
      queryClient.setQueryData<ApiKey[]>(apiKeyKeys.lists(), (old) =>
        old ? old.filter((key) => key.id !== id) : old,
      )
      return { previous }
    },
    onError: (_err, _id, context: { previous?: ApiKey[] } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(apiKeyKeys.lists(), context.previous)
      }
    },
    onSettled: () => {
      setRevokingKeyId(null)
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      }
    },
  })

  async function handleCreateKey(
    request: ApiKeyCreateRequest,
  ): Promise<ApiKeyCreateResponse | null> {
    setCreateKeyError(null)
    if (!isOnline) {
      setCreateKeyError(t('errors.offline'))
      return null
    }
    try {
      const result = await apiClient<ApiKeyCreateResponse>(API.apiKeys.create, {
        method: 'POST',
        body: JSON.stringify(request),
      })
      await queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      return result
    } catch {
      setCreateKeyError(t('orbitMcp.createKeyError'))
      return null
    }
  }

  return {
    apiKeysQuery,
    capabilitiesQuery,
    apiKeys,
    scopeOptions,
    canCreateKey,
    canCreateScopedKey,
    createKeyModalOpen,
    setCreateKeyModalOpen,
    createKeyError,
    revokingKeyId,
    setRevokingKeyId,
    revokeKeyMutation,
    handleCreateKey,
  }
}
