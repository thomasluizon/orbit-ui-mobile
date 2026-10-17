import { describe, expect, it } from 'vitest'
import { notionAuthorizationSchema, notionCallbackRequestSchema, notionConnectionSchema, notionConnectionLabel } from '../types/notion-connection'
import { createNotionAuthorization, createNotionCallback, createNotionConnection } from './notion-fixtures'

describe('Notion connection contract', () => {
  it('accepts complete responses from the pinned generated schema', () => {
    const connected = createNotionConnection({ connected: true, workspaceName: 'Shared tasks', lastPollAtUtc: '2026-10-17T12:00:00Z' })
    expect(notionConnectionSchema.parse(connected)).toEqual(connected)
    expect(notionAuthorizationSchema.parse(createNotionAuthorization())).toEqual(createNotionAuthorization())
    expect(notionCallbackRequestSchema.parse(createNotionCallback())).toEqual(createNotionCallback())
  })
  it('keeps reconnect distinct from a disconnected connection', () => {
    expect(notionConnectionLabel(createNotionConnection())).toBe('profile.connections.notConnected')
    expect(notionConnectionLabel(createNotionConnection({ connected: true }))).toBe('profile.connections.connected')
    expect(notionConnectionLabel(createNotionConnection({ status: 'ReconnectRequired' }))).toBe('profile.connections.renew')
  })
  it('rejects malformed payloads and authorization destinations', () => {
    expect(notionConnectionSchema.safeParse({ connected: true }).success).toBe(false)
    expect(notionConnectionSchema.safeParse(createNotionConnection({ lastPollAtUtc: null, workspaceName: null })).success).toBe(true)
    expect(notionAuthorizationSchema.safeParse({ authorizeUrl: 'javascript:alert(1)' }).success).toBe(false)
    expect(notionAuthorizationSchema.safeParse({ authorizeUrl: 'https://example.com/v1/oauth/authorize' }).success).toBe(false)
    expect(notionCallbackRequestSchema.safeParse({ ...createNotionCallback(), state: '' }).success).toBe(false)
  })
})
