import { API_KEY_EXPIRY_DEFAULT } from '../validation/api-key-form'
import type { StepUpOperation } from './step-up'

export interface StepUpSessionState {
  bindStepUpStateToAccount: (nextAccountId: string) => void
  clearStepUpState: () => void
  readApiKeyExpiryDraft: () => string
  retainApiKeyExpiryDraft: (expiresAt: string) => void
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
  let accountId: string | null = null

  function clearStepUpState(): void {
    visibleManagementOperations.clear()
    apiKeyCreationGrantAvailable = false
    apiKeyExpiryDraft = API_KEY_EXPIRY_DEFAULT
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
