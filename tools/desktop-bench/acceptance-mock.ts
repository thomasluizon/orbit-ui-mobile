import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { backendLoginResponseSchema, sendCodeRequestSchema, verifyCodeRequestSchema } from '../../packages/shared/src/types/auth'
import { handleRequest, validateFixturesOrExit } from '../../apps/web/test-support/hermetic/mock-api/request-handler'

export const acceptanceEmail = 'desktop-vm@example.invalid'
export const acceptanceCode = '741852'

export function emailReply(path: string, body: unknown, token: string) {
  const sending = path === '/api/auth/send-code'
  const parsed = sending ? sendCodeRequestSchema.parse(body) : verifyCodeRequestSchema.parse(body)
  const accepted = parsed.email === acceptanceEmail && (sending || ('code' in parsed && parsed.code === acceptanceCode))
  return {
    status: accepted ? 200 : 400,
    body: !accepted ? { error: 'Invalid fixed hermetic email code' } : sending ? {} : backendLoginResponseSchema.parse({
      userId: 'hermetic-perf-user', name: 'Orbit Preview', email: acceptanceEmail, token, refreshToken: 'hermetic-refresh',
    }),
  }
}

export async function handleEmailRequest(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse, token: string) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString())
  const reply = emailReply(request.url ?? '', body, token)
  response.writeHead(reply.status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(reply.body))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { token } = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { token: string }
  validateFixturesOrExit()
  createServer((request, response) => {
    if (request.method === 'POST' && ['/api/auth/send-code', '/api/auth/verify-code'].includes(request.url ?? '')) {
      void handleEmailRequest(request, response, token).catch((error: unknown) => {
        process.stderr.write(`${String(error)}\n`)
        response.writeHead(400).end()
      })
    } else handleRequest(request, response)
  }).listen(5099, '127.0.0.1')
}
