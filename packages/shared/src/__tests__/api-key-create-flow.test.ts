import { describe, expect, it } from 'vitest'
import { apiKeyCreatePosition, apiKeyCreatePrimary, apiKeyTextStepIssue, readApiKeyCreateSubmission } from '../utils/api-key-create-flow'

describe('API key create flow position', () => {
  it('asks for the scope only for a scoped key', () => {
    expect(apiKeyCreatePosition('name', false, false).steps).toEqual(['name', 'access', 'expiry', 'reveal'])
    expect(apiKeyCreatePosition('name', true, false).steps).toEqual(['name', 'access', 'scope', 'expiry', 'reveal'])
  })

  it('has no way back on the first step and goes on to the access question', () => {
    expect(apiKeyCreatePosition('name', true, false)).toMatchObject({ step: 'name', index: 0, previous: null, next: 'access' })
  })

  it('goes from the access question to the scope of a scoped key and to the expiry of a plain key', () => {
    expect(apiKeyCreatePosition('access', true, false)).toMatchObject({ index: 1, previous: 'name', next: 'scope' })
    expect(apiKeyCreatePosition('access', false, false)).toMatchObject({ index: 1, previous: 'name', next: 'expiry' })
  })

  it('ends the questions at the expiry: the create, not a continue, shows the key', () => {
    expect(apiKeyCreatePosition('expiry', true, false)).toMatchObject({ index: 3, previous: 'scope', next: null })
  })

  it('shows the created key on the last step with no way back, whatever question the flow held', () => {
    expect(apiKeyCreatePosition('expiry', false, true)).toMatchObject({ step: 'reveal', index: 3, previous: null, next: null })
  })
})

describe('API key text steps', () => {
  it('keeps the name step on an empty or too long name, and lets a good name go on', () => {
    expect(apiKeyTextStepIssue('name', '  ', '')).toBe('name')
    expect(apiKeyTextStepIssue('name', 'x'.repeat(500), '')).toBe('name')
    expect(apiKeyTextStepIssue('name', 'Laptop', '')).toBeNull()
  })

  it('keeps the scope step on an empty scope, and lets a scope go on', () => {
    expect(apiKeyTextStepIssue('scope', 'Laptop', '   ')).toBe('scope')
    expect(apiKeyTextStepIssue('scope', 'Laptop', 'habits:read')).toBeNull()
  })
})

describe('API key create submission', () => {
  it('sends the trimmed name, the trimmed scope of a scoped key and no expiry for a key that never expires', () => {
    expect(readApiKeyCreateSubmission({ name: ' Laptop ', scope: ' habits:read ', expiresAt: '', scoped: true }))
      .toEqual({ kind: 'ready', request: { name: 'Laptop', scopes: ['habits:read'], expiresAtUtc: null } })
    expect(readApiKeyCreateSubmission({ name: 'Laptop', scope: 'ignored', expiresAt: '', scoped: false }))
      .toEqual({ kind: 'ready', request: { name: 'Laptop', expiresAtUtc: null } })
  })

  it('sends a future expiry as UTC', () => {
    const submission = readApiKeyCreateSubmission({ name: 'Laptop', scope: '', expiresAt: '2999-01-31T23:59:59', scoped: false })
    expect(submission).toEqual({ kind: 'ready', request: { name: 'Laptop', expiresAtUtc: '2999-01-31T23:59:59.000Z' } })
  })

  it('goes back to the name for a bad name, and stays on the expiry for a passed expiry with a good name', () => {
    expect(readApiKeyCreateSubmission({ name: '', scope: '', expiresAt: '2000-01-01T00:00:00', scoped: false })).toEqual({ kind: 'name' })
    expect(readApiKeyCreateSubmission({ name: 'Laptop', scope: '', expiresAt: '2000-01-01T00:00:00', scoped: false })).toEqual({ kind: 'expiry' })
  })
})

describe('API key create main action', () => {
  it('lets the options answer the access question, creates on the expiry, closes on the reveal and continues elsewhere', () => {
    expect(apiKeyCreatePrimary('access')).toBeNull()
    expect(apiKeyCreatePrimary('expiry')).toEqual({ labelKey: 'profile.apiKeys.scopeAction', action: 'create' })
    expect(apiKeyCreatePrimary('reveal')).toEqual({ labelKey: 'orbitMcp.done', action: 'close' })
    expect(apiKeyCreatePrimary('name')).toEqual({ labelKey: 'common.continue', action: 'continue' })
    expect(apiKeyCreatePrimary('scope')).toEqual({ labelKey: 'common.continue', action: 'continue' })
  })
})
