import { useState } from 'react'
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import type { ApiKey, ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { apiKeyKeys } from '@orbit/shared/query'
import { apiClient } from '@/lib/api-client'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import {
  clearApiKeyCreationGrant,
  consumeApiKeyCreationGrant,
  hasApiKeyCreationGrant,
} from '@/lib/step-up-storage'
import { extractBackendErrorCode, extractBackendStatus } from '@orbit/shared/utils'

const MAX_API_KEYS = 5

interface UseApiKeyManagementParams {
  hasProAccess: boolean
  isOnline: boolean
  queryClient: QueryClient
  t: (key: string, params?: Record<string, unknown>) => string
}

/** Owns the Orbit MCP API-key list plus its create and revoke mutations. */
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

  const apiKeys = apiKeysQuery.data ?? []
  const canCreateKey = apiKeys.length < MAX_API_KEYS
  const [createKeyError, setCreateKeyError] = useState<string | null>(null)
  const [createGrantAvailable, setCreateGrantAvailable] = useState(hasApiKeyCreationGrant)
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
        void queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      }
    },
  })

  async function handleCreateKey(
    request: ApiKeyCreateRequest,
    onCreateGrantRequired: () => Promise<void>,
  ): Promise<ApiKeyCreateResponse | null> {
    setCreateKeyError(null)
    if (!createGrantAvailable) {
      await onCreateGrantRequired()
      return null
    }
    if (!isOnline) {
      setCreateKeyError(t('errors.offline'))
      return null
    }
    try {
      const result = await apiClient<ApiKeyCreateResponse>(API.apiKeys.create, {
        method: 'POST',
        body: JSON.stringify(request),
      })
      consumeApiKeyCreationGrant()
      setCreateGrantAvailable(false)
      await queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      return result
    } catch (caught: unknown) {
      if (
        extractBackendStatus(caught) === 428
        && extractBackendErrorCode(caught) === 'API_KEY_CREATION_CHALLENGE_REQUIRED'
      ) {
        clearApiKeyCreationGrant()
        setCreateGrantAvailable(false)
        await onCreateGrantRequired()
        return null
      }
      setCreateKeyError(t('orbitMcp.createKeyError'))
      return null
    }
  }

  return {
    apiKeysQuery,
    apiKeys,
    canCreateKey,
    createGrantAvailable,
    createKeyError,
    clearCreateKeyError: () => setCreateKeyError(null),
    revokingKeyId,
    setRevokingKeyId,
    revokeKeyMutation,
    handleCreateKey,
  }
}
