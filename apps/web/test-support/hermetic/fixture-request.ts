import { IncomingMessage, Server, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { vi } from 'vitest'

export async function createHermeticFixtureRequest() {
  const listen = vi.spyOn(Server.prototype, 'listen').mockReturnThis()
  let server: Server
  try {
    const fixtureServerModule = './mock-api/server.ts'
    await import(fixtureServerModule)
    server = listen.mock.contexts[0] as Server
  } finally {
    listen.mockRestore()
  }
  return (path: string) => {
    const request = new IncomingMessage(new Socket())
    request.method = 'GET'
    request.url = path
    const response = new ServerResponse(request)
    const end = vi.spyOn(response, 'end').mockReturnValue(response)
    try {
      server.emit('request', request, response)
      return { status: response.statusCode, body: JSON.parse(String(end.mock.calls[0]?.[0])) as unknown }
    } finally {
      end.mockRestore()
      request.destroy()
    }
  }
}
