import { describe, expect, it, vi } from 'vitest'
import { apiKeyCreateResponseSchema } from '../types/api-key'
import { openApiKeyScopeOrStartStepUp, submitApiKeyCreation } from '../utils/api-key-creation'

const request = { name: 'automation', expiresAtUtc: '2099-12-31T23:59:00.000Z' }
const createdKey = apiKeyCreateResponseSchema.parse({
  id: 'key-1', name: request.name, keyPrefix: 'orb_test', key: 'orb_test_secret',
  scopes: [], isReadOnly: false, expiresAtUtc: request.expiresAtUtc,
  createdAtUtc: '2099-01-01T00:00:00.000Z', lastUsedAtUtc: null, isRevoked: false,
})

function setup() {
  let accountGeneration = 1
  let creating = false
  const adapter = {
    getAccountGeneration: () => accountGeneration,
    setCreating: (value: boolean) => { creating = value },
    createKey: vi.fn().mockResolvedValue(createdKey),
    retainExpiryDraft: vi.fn<(expiresAt: string) => void>(),
  }
  return { adapter, isCreating: () => creating, changeAccount: () => { accountGeneration += 1 } }
}

describe('submitApiKeyCreation', () => {
  it('forwards the expiry and clears the retained draft only after success', async () => {
    const { adapter, isCreating } = setup()
    const pending = submitApiKeyCreation(request, adapter)
    expect(isCreating()).toBe(true)
    expect(await pending).toEqual(createdKey)
    expect(adapter.createKey).toHaveBeenCalledWith(request)
    expect(adapter.retainExpiryDraft).toHaveBeenCalledWith('')
    expect(isCreating()).toBe(false)
  })

  it('retains expiry when creation returns to fresh authentication', async () => {
    const { adapter, isCreating } = setup()
    adapter.createKey.mockResolvedValue(null)
    expect(await submitApiKeyCreation(request, adapter)).toBeNull()
    expect(adapter.retainExpiryDraft).not.toHaveBeenCalled()
    expect(isCreating()).toBe(false)
  })

  it('propagates a failed submission and releases the busy state without clearing expiry', async () => {
    const { adapter, isCreating } = setup()
    const error = new Error('creation failed')
    adapter.createKey.mockRejectedValue(error)
    await expect(submitApiKeyCreation(request, adapter)).rejects.toBe(error)
    expect(adapter.retainExpiryDraft).not.toHaveBeenCalled()
    expect(isCreating()).toBe(false)
  })

  it('ignores a completed submission after the account changes', async () => {
    const { adapter, changeAccount, isCreating } = setup()
    let finish!: (value: typeof createdKey) => void
    adapter.createKey.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const pending = submitApiKeyCreation(request, adapter)
    changeAccount()
    adapter.setCreating(true)
    finish(createdKey)

    expect(await pending).toBeNull()
    expect(adapter.retainExpiryDraft).not.toHaveBeenCalled()
    expect(isCreating()).toBe(true)
  })
})

describe('openApiKeyScopeOrStartStepUp', () => {
  it.each([false, true])('requires a fresh grant before opening scope (%s)', (hasGrant) => {
    const clearError = vi.fn()
    const openScope = vi.fn()
    const startStepUp = vi.fn().mockResolvedValue(undefined)
    openApiKeyScopeOrStartStepUp(hasGrant, clearError, openScope, startStepUp)
    expect(clearError).toHaveBeenCalledOnce()
    expect(openScope).toHaveBeenCalledTimes(hasGrant ? 1 : 0)
    expect(startStepUp).toHaveBeenCalledTimes(hasGrant ? 0 : 1)
  })
})
