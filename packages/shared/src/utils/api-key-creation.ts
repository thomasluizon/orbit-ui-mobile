import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '../types/api-key'
import { API_KEY_EXPIRY_DEFAULT } from '../validation/api-key-form'

export interface ApiKeyCreationAdapter {
  getAccountGeneration: () => number
  setCreating: (creating: boolean) => void
  createKey: (request: ApiKeyCreateRequest) => Promise<ApiKeyCreateResponse | null>
  retainExpiryDraft: (expiresAt: string) => void
}

export async function submitApiKeyCreation(
  request: ApiKeyCreateRequest,
  adapter: ApiKeyCreationAdapter,
): Promise<ApiKeyCreateResponse | null> {
  const creationAccount = adapter.getAccountGeneration()
  adapter.setCreating(true)
  try {
    const result = await adapter.createKey(request)
    if (adapter.getAccountGeneration() !== creationAccount) return null
    if (result) adapter.retainExpiryDraft(API_KEY_EXPIRY_DEFAULT)
    return result
  } finally {
    if (adapter.getAccountGeneration() === creationAccount) adapter.setCreating(false)
  }
}

export function openApiKeyScopeOrStartStepUp(
  createGrantAvailable: boolean,
  clearCreateKeyError: () => void,
  openScope: () => void,
  startStepUp: () => Promise<void>,
): void {
  clearCreateKeyError()
  if (!createGrantAvailable) {
    void startStepUp()
    return
  }
  openScope()
}
