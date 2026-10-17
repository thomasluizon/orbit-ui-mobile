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

export function notionConnectionLabel(connection: NotionConnection | undefined) {
  if (connection?.status === 'ReconnectRequired') return 'profile.connections.renew'
  return connection?.connected ? 'profile.connections.connected' : 'profile.connections.notConnected'
}
