import { describe, expect, it } from 'vitest'
import { notionAuthorizationSchema, notionCallbackRequestSchema, notionConnectionSchema, notionConnectionLabel, notionConnectionAccess, notionConnectionSheetState } from '../types/notion-connection'
import { createNotionAuthorization, createNotionCallback, createNotionConnection } from './notion-fixtures'

describe('Notion connection contract', () => {
  it('accepts complete responses from the pinned generated schema', () => {
    const connected = createNotionConnection({ connected: true, workspaceName: 'Shared tasks', lastPollAtUtc: '2026-10-17T12:00:00Z' })
    expect(notionConnectionSchema.parse(connected)).toEqual(connected)
    expect(notionAuthorizationSchema.parse(createNotionAuthorization())).toEqual(createNotionAuthorization())
    expect(notionCallbackRequestSchema.parse(createNotionCallback())).toEqual(createNotionCallback())
  })
  it('keeps reconnect distinct from a disconnected connection', () => {
    expect(notionConnectionLabel(undefined)).toBe('profile.connections.notConnected')
    expect(notionConnectionLabel(createNotionConnection({ connected: true }), true)).toBe('common.loading')
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

describe('Notion connection access', () => {
  it.each([false, true])('requires the feature flag for Pro access %s', (hasProAccess) => {
    expect(notionConnectionAccess(undefined, hasProAccess)).toEqual({ visible: false, enabled: false })
    expect(notionConnectionAccess(false, hasProAccess)).toEqual({ visible: false, enabled: false })
    expect(notionConnectionAccess(true, hasProAccess)).toEqual({ visible: true, enabled: hasProAccess })
  })
})

function sheetInput() {
  return {
    connection: { data: createNotionConnection(), isLoading: false, isError: false },
    authorize: { isPending: false, isError: false },
    disconnect: { isPending: false, isError: false },
    isOnline: true,
    leaving: false,
    callbackFailed: false,
  }
}

describe('Notion connection sheet state', () => {
  it.each([
    [false, 'Idle', false, false, 'connect'],
    [true, 'Idle', false, true, 'choosePages'],
    [false, 'ReconnectRequired', true, true, 'reconnect'],
    [true, 'ReconnectRequired', true, true, 'reconnect'],
  ] as const)('selects the action for connected %s and status %s', (connected, status, reconnect, hasConnection, actionKey) => {
    const input = sheetInput()
    input.connection.data = createNotionConnection({ connected, status })
    expect(notionConnectionSheetState(input)).toEqual({ reconnect, hasConnection, actionKey, busy: false, disabled: false, error: false })
  })

  it('keeps the connect action disabled while the first response loads', () => {
    const input = sheetInput()
    expect(notionConnectionSheetState({ ...input, connection: { data: undefined, isLoading: true, isError: false } }))
      .toEqual({ reconnect: false, hasConnection: false, actionKey: 'connect', busy: false, disabled: true, error: false })
  })

  it.each(['authorize', 'disconnect', 'leaving'] as const)('disables actions during %s without changing the label', (operation) => {
    const input = sheetInput()
    input.connection.data = createNotionConnection({ connected: true })
    if (operation === 'leaving') input.leaving = true
    else input[operation].isPending = true
    expect(notionConnectionSheetState(input)).toMatchObject({ busy: true, disabled: true, actionKey: 'choosePages', error: false })
  })

  it('disables actions offline without reporting a connection failure', () => {
    expect(notionConnectionSheetState({ ...sheetInput(), isOnline: false })).toMatchObject({ busy: false, disabled: true, error: false })
  })

  it.each(['callback', 'connection', 'authorize', 'disconnect', 'transient'] as const)('reports %s failures', (failure) => {
    const input = sheetInput()
    if (failure === 'callback') input.callbackFailed = true
    else if (failure === 'transient') input.connection.data = createNotionConnection({ status: 'TransientError' })
    else input[failure].isError = true
    expect(notionConnectionSheetState(input)).toMatchObject({ error: true, disabled: failure === 'connection', busy: false })
  })
})
