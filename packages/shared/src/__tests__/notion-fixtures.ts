import { z } from 'zod'
import generated from './fixtures/notion-contract.json'
import type { NotionConnection, NotionCallbackRequest } from '../types/notion-connection'

const connectionContract = z.fromJSONSchema(generated.GetApiConnectionsNotionResponse as Parameters<typeof z.fromJSONSchema>[0])
const authorizationContract = z.fromJSONSchema(generated.PostApiConnectionsNotionAuthorizeResponse as Parameters<typeof z.fromJSONSchema>[0])
const callbackContract = z.fromJSONSchema(generated.PostApiConnectionsNotionCallbackBody as Parameters<typeof z.fromJSONSchema>[0])

export function createNotionConnection(overrides: Partial<NotionConnection> = {}): NotionConnection {
  return connectionContract.parse({
    connected: false,
    workspaceName: null,
    status: 'Idle',
    lastPollAtUtc: null,
    sharedDatabases: [],
    ...overrides,
  }) as NotionConnection
}

export function createNotionAuthorization(): { authorizeUrl: string } {
  return authorizationContract.parse({
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize?owner=user&response_type=code&client_id=client&redirect_uri=https%3A%2F%2Fapp.useorbit.org%2Fauth-callback%2Fnotion&state=oauth-state',
  }) as { authorizeUrl: string }
}

export function createNotionCallback(redirectUri = 'https://app.useorbit.org/auth-callback/notion'): NotionCallbackRequest {
  return callbackContract.parse({ code: 'oauth-code', state: 'oauth-state', redirectUri }) as NotionCallbackRequest
}
