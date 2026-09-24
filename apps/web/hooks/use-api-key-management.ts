import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { useState } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { ApiClientError, getFriendlyErrorMessage } from '@orbit/shared/utils'
import type { ApiKey, ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { apiKeyKeys } from '@orbit/shared/query'
import { createApiKey, revokeApiKey } from '@/lib/actions/api-keys'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
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
  const [revokeKeyError, setRevokeKeyError] = useState<string | null>(null)

  const revokeKeyMutation = useAccountScopedMutation({
    mutationFn: (keyId: string, intendedAccountId) => revokeApiKey(keyId, intendedAccountId),
    onSuccess: () => {
      setRevokingKeyId(null)
      setRevokeKeyError(null)
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
    onError: (error) => {
      setRevokeKeyError(getFriendlyErrorMessage(error, t, 'orbitMcp.apiKeysError'))
    },
  })

  async function handleCreateKey(
    request: ApiKeyCreateRequest,
    onCreateGrantRequired: () => Promise<void>,
  ): Promise<ApiKeyCreateResponse | null> {
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    setCreateKeyError(null)
    if (!createGrantAvailable) {
      await onCreateGrantRequired()
      return null
    }
    try {
      const result = await createApiKey(request, intendedAccountId)
      if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
        setCreateKeyError(t('errors.api.accountChanged'))
        return null
      }
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
    } catch (error) {
      setCreateKeyError(getFriendlyErrorMessage(error, t, 'orbitMcp.createKeyError'))
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
    revokeKeyError,
    clearRevokeKeyError: () => setRevokeKeyError(null),
    setRevokingKeyId,
    revokeKeyMutation,
    handleCreateKey,
  }
}
