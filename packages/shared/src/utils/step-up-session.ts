import { API_KEY_EXPIRY_DEFAULT } from '../validation/api-key-form'
import type { StepUpOperation } from './step-up'

export interface StepUpSessionState {
  bindStepUpStateToAccount: (nextAccountId: string) => void
  clearStepUpState: () => void
  readApiKeyExpiryDraft: () => string
  retainApiKeyExpiryDraft: (expiresAt: string) => void
  rememberApiKeyCreationPermission: (isReadOnly: boolean) => void
  readPendingApiKeyPermission: () => boolean
  clearPendingApiKeyPermission: () => void
  markStepUpVerified: (operation: StepUpOperation) => void
  isStepUpVerified: (operation: StepUpOperation) => boolean
  hasApiKeyCreationGrant: () => boolean
  consumeApiKeyCreationGrant: () => void
  clearApiKeyCreationGrant: () => void
}

export function createStepUpSessionState(): StepUpSessionState {
  const visibleManagementOperations = new Set<StepUpOperation>()
  let apiKeyCreationGrantAvailable = false
  let apiKeyExpiryDraft = API_KEY_EXPIRY_DEFAULT
  let pendingApiKeyReadOnly: boolean | null = null
  let accountId: string | null = null

  function clearStepUpState(): void {
    visibleManagementOperations.clear()
    apiKeyCreationGrantAvailable = false
    apiKeyExpiryDraft = API_KEY_EXPIRY_DEFAULT
    pendingApiKeyReadOnly = null
    accountId = null
  }

  function clearApiKeyCreationGrant(): void {
    apiKeyCreationGrantAvailable = false
  }

  return {
    bindStepUpStateToAccount: (nextAccountId) => {
      if (accountId === nextAccountId) return
      clearStepUpState()
      accountId = nextAccountId
    },
    clearStepUpState,
    readApiKeyExpiryDraft: () => apiKeyExpiryDraft,
    retainApiKeyExpiryDraft: (expiresAt) => {
      if (accountId !== null) apiKeyExpiryDraft = expiresAt
    },
    rememberApiKeyCreationPermission: (isReadOnly) => {
      pendingApiKeyReadOnly = isReadOnly
    },
    readPendingApiKeyPermission: () => apiKeyCreationGrantAvailable && pendingApiKeyReadOnly === true,
    clearPendingApiKeyPermission: () => { pendingApiKeyReadOnly = null },
    markStepUpVerified: (operation) => {
      visibleManagementOperations.add(operation)
      if (operation === 'keys') apiKeyCreationGrantAvailable = true
    },
    isStepUpVerified: (operation) => visibleManagementOperations.has(operation),
    hasApiKeyCreationGrant: () => apiKeyCreationGrantAvailable,
    consumeApiKeyCreationGrant: clearApiKeyCreationGrant,
    clearApiKeyCreationGrant,
  }
}
