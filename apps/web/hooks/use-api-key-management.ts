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
import { createApiKey, revokeApiKey } from '@/app/actions/api-keys'

const MAX_API_KEYS = 5

interface ScopeOption {
  scope: string
  label: string
  description: string
}

async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await fetch(API.apiKeys.list)
  if (!res.ok) {
    throw new Error('Failed to load API keys')
  }
  return res.json()
}

async function fetchCapabilities(): Promise<AgentCapability[]> {
  const res = await fetch(API.ai.capabilities)
  if (!res.ok) {
    throw new Error('Failed to load AI capabilities')
  }
  return res.json()
}

interface UseApiKeyManagementParams {
  hasProAccess: boolean
  queryClient: QueryClient
  t: (key: string, params?: Record<string, string | number | Date>) => string
}

/** Owns the Orbit MCP API-key surface: list + capabilities queries, scope
 *  options, create/revoke flow, and the modal/error/revoke state. Hooks run in
 *  the same order they previously sat inline in the Advanced page. */
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

  const capabilitiesQuery = useQuery({
    queryKey: aiKeys.capabilities(),
    queryFn: fetchCapabilities,
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
    mutationFn: revokeApiKey,
    onSuccess: () => {
      setRevokingKeyId(null)
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })

  async function handleCreateKey(
    request: ApiKeyCreateRequest,
  ): Promise<ApiKeyCreateResponse | null> {
    setCreateKeyError(null)
    try {
      const result = await createApiKey(request)
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
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
