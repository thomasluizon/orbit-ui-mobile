import { z } from 'zod'

export const notionAuthorizeRequestSchema = z.object({ redirectUri: z.string().url() })
export const notionCallbackRequestSchema = notionAuthorizeRequestSchema.extend({
  code: z.string().min(1),
  state: z.string().min(1),
})
export const notionAuthorizationSchema = z.object({
  authorizeUrl: z.string().url().refine((value) => {
    const url = new URL(value)
    return url.origin === 'https://api.notion.com' && url.pathname === '/v1/oauth/authorize'
  }),
})
export const notionConnectionSchema = z.object({
  connected: z.boolean(),
  workspaceName: z.string().nullable(),
  status: z.string(),
  lastPollAtUtc: z.iso.datetime({ offset: true }).nullable(),
  sharedDatabases: z.array(z.object({ id: z.uuid(), title: z.string() })),
})
export type NotionConnection = z.infer<typeof notionConnectionSchema>
export type NotionCallbackRequest = z.infer<typeof notionCallbackRequestSchema>
export type NotionAuthorizeRequest = z.infer<typeof notionAuthorizeRequestSchema>

export const NOTION_CALLBACK_PATH = '/auth-callback/notion'
export const NOTION_RETURN_PATH = '/profile/astra'

export function notionConnectionLabel(connection: NotionConnection | undefined, isLoading = false):
  'common.loading' | 'profile.connections.renew' | 'profile.connections.connected' | 'profile.connections.notConnected' {
  if (isLoading) return 'common.loading'
  if (connection?.status === 'ReconnectRequired') return 'profile.connections.renew'
  return connection?.connected ? 'profile.connections.connected' : 'profile.connections.notConnected'
}

export function notionConnectionAccess(featureEnabled: boolean | undefined, hasProAccess: boolean): { visible: boolean; enabled: boolean } {
  const visible = featureEnabled === true
  return { visible, enabled: visible && hasProAccess }
}

interface NotionConnectionSheetInput {
  connection: { data: NotionConnection | undefined; isLoading: boolean; isError: boolean }
  authorize: { isPending: boolean; isError: boolean }
  disconnect: { isPending: boolean; isError: boolean }
  isOnline: boolean
  leaving: boolean
  callbackFailed: boolean
}

export function notionConnectionSheetState({ connection, authorize, disconnect, isOnline, leaving, callbackFailed }: NotionConnectionSheetInput): {
  reconnect: boolean
  hasConnection: boolean
  busy: boolean
  disabled: boolean
  actionKey: 'connect' | 'choosePages' | 'reconnect'
  error: boolean
} {
  const reconnect = connection.data?.status === 'ReconnectRequired'
  const hasConnection = connection.data?.connected || reconnect
  const busy = authorize.isPending || disconnect.isPending || leaving
  const disabled = !isOnline || busy || connection.isLoading || connection.isError
  const actionKey = reconnect ? 'reconnect' : hasConnection ? 'choosePages' : 'connect'
  const error = [callbackFailed, connection.isError, authorize.isError, disconnect.isError, connection.data?.status === 'TransientError'].some(Boolean)
  return { reconnect, hasConnection, busy, disabled, actionKey, error }
}
