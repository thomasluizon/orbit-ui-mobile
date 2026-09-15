import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { useState } from 'react'
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { ApiClientError } from '@orbit/shared/utils'
import type { ApiKey, ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { apiKeyKeys } from '@orbit/shared/query'
import { createApiKey, revokeApiKey } from '@/app/actions/api-keys'
import {
  clearApiKeyCreationGrant,
  consumeApiKeyCreationGrant,
  hasApiKeyCreationGrant,
} from '@/lib/step-up-storage'

const MAX_API_KEYS = 5

async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await fetchWithThrottle(API.apiKeys.list)
  if (!res.ok) {
    throw new ApiClientError(res.status, 'Failed to load API keys')
  }
  return res.json() as Promise<ApiKey[]>
}

interface UseApiKeyManagementParams {
  hasProAccess: boolean
  queryClient: QueryClient
  t: (key: string, params?: Record<string, string | number | Date>) => string
}

/** Owns the Orbit MCP API-key list plus its create and revoke mutations. */
export function useApiKeyManagement({
  hasProAccess,
  queryClient,
  t,
}: Readonly<UseApiKeyManagementParams>) {
  const apiKeysQuery = useQuery({
    queryKey: apiKeyKeys.lists(),
    queryFn: fetchApiKeys,
    enabled: hasProAccess,
    staleTime: 5 * 60 * 1000,
  })

  const apiKeys = apiKeysQuery.data ?? []
  const canCreateKey = apiKeys.length < MAX_API_KEYS
  const [createKeyError, setCreateKeyError] = useState<string | null>(null)
  const [createGrantAvailable, setCreateGrantAvailable] = useState(hasApiKeyCreationGrant)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)

  const revokeKeyMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      setRevokingKeyId(null)
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
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
    try {
      const result = await createApiKey(request)
      if (!result.success) {
        clearApiKeyCreationGrant()
        setCreateGrantAvailable(false)
        await onCreateGrantRequired()
        return null
      }
      consumeApiKeyCreationGrant()
      setCreateGrantAvailable(false)
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      return result.response
    } catch {
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
