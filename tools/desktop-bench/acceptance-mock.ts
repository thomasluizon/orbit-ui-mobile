import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { backendLoginResponseSchema, sendCodeRequestSchema, verifyCodeRequestSchema } from '../../packages/shared/src/types/auth'
import { logHabitResponseSchema } from '../../packages/shared/src/types/habit'
import { pushSubscriptionsResponseSchema } from '../../packages/shared/src/types/push-subscription'
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

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString()
  return text ? JSON.parse(text) as unknown : null
}

export async function handleEmailRequest(request: IncomingMessage, response: ServerResponse, token: string) {
  const reply = emailReply(request.url ?? '', await readBody(request), token)
  response.writeHead(reply.status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(reply.body))
}

// Request shapes copy orbit-api NotificationController.SubscribeRequest and UnsubscribeRequest, RemindersController.DoneRequest
// and the GetPushSubscriptionsQuery item; INVALID_REMINDER_ACTION is CompleteReminderCommandHandler's only failure (#1861).
const subscribeSchema = z.object({ endpoint: z.string().min(1), p256dh: z.string(), auth: z.string(),
  apnsTopic: z.string().nullable().optional(), deviceId: z.uuid().optional() })
const unsubscribeSchema = z.object({ endpoint: z.string().min(1) })
const doneSchema = z.object({ token: z.string().min(1) })
const reminderSchema = z.object({ habitId: z.uuid() })
const sessionModeSchema = z.object({ mode: z.enum(['stable', 'expiring', 'expired']) })
const maxPushSubscriptions = 5
// The refreshed token outlives the BFF's 60 second refresh threshold by 5 seconds, so it becomes due quickly.
const expiringTokenSeconds = 65

interface Registration { id: string; endpoint: string; p256dh: string; auth: string; apnsTopic: string | null; deviceId: string | null; receivedAtUtc: string }
interface HabitLog { habitId: string; source: 'reminder-done' | 'habit-log'; atUtc: string }

function tokenClaims(token: string): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')))
}

function bearer(request: IncomingMessage): string | null {
  return request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? null
}

function send(response: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) response.writeHead(status).end()
  else response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

export function createAcceptanceHandler(token: string, now: () => number = Date.now) {
  const registrations: Registration[] = []
  const logs: HabitLog[] = []
  const reminders = new Map<string, { habitId: string; consumed: boolean }>()
  let mode: z.infer<typeof sessionModeSchema>['mode'] = 'stable'
  const timestamp = () => new Date(now()).toISOString()
  const [header, , signature] = token.split('.')
  const shortToken = () => {
    const claims = { ...tokenClaims(token), exp: Math.floor(now() / 1000) + expiringTokenSeconds }
    return `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`
  }
  const sessionRejected = (request: IncomingMessage, path: string) => {
    const credential = bearer(request)
    if (mode === 'expired') return credential !== null
    if (mode !== 'expiring' || credential === null || path === '/api/auth/refresh') return false
    const expiry = tokenClaims(credential).exp
    return typeof expiry !== 'number' || expiry * 1000 - now() > expiringTokenSeconds * 1000
  }

  async function route(request: IncomingMessage, response: ServerResponse, method: string, path: string): Promise<boolean> {
    if (method === 'GET' && path === '/_test/push-registrations') { send(response, 200, registrations); return true }
    if (method === 'GET' && path === '/_test/habit-logs') { send(response, 200, logs); return true }
    if (method === 'POST' && path === '/_test/repeat-reminders') {
      const { habitId } = reminderSchema.parse(await readBody(request))
      const doneToken = randomBytes(32).toString('base64url')
      reminders.set(doneToken, { habitId, consumed: false })
      send(response, 200, { doneToken })
      return true
    }
    if (method === 'PUT' && path === '/_test/session-mode') {
      mode = sessionModeSchema.parse(await readBody(request)).mode
      send(response, 204)
      return true
    }
    if (method === 'POST' && path === '/api/reminders/done') {
      const reminder = reminders.get(doneSchema.parse(await readBody(request)).token)
      if (!reminder || reminder.consumed) {
        send(response, 400, { error: 'This reminder action is no longer available.', errorCode: 'INVALID_REMINDER_ACTION' })
        return true
      }
      reminder.consumed = true
      logs.push({ habitId: reminder.habitId, source: 'reminder-done', atUtc: timestamp() })
      send(response, 200, logHabitResponseSchema.parse({ logId: randomUUID(), isFirstCompletionToday: true, currentStreak: 1 }))
      return true
    }
    if (sessionRejected(request, path) || (mode === 'expired' && path === '/api/auth/refresh')) {
      request.resume()
      send(response, 401, { error: 'Unauthorized' })
      return true
    }
    if (mode === 'expiring' && method === 'POST' && path === '/api/auth/refresh') {
      request.resume()
      send(response, 200, { token: shortToken(), refreshToken: 'hermetic-refresh' })
      return true
    }
    if (!path.startsWith('/api/notifications/subscri') && !path.startsWith('/api/notifications/unsubscribe')) return false
    if (!bearer(request)) { request.resume(); send(response, 401, { error: 'Unauthorized' }); return true }
    if (method === 'POST' && path === '/api/notifications/subscribe') {
      const body = subscribeSchema.parse(await readBody(request))
      const index = registrations.findIndex((entry) => entry.endpoint === body.endpoint)
      if (index !== -1) registrations.splice(index, 1)
      registrations.push({ id: randomUUID(), endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth,
        apnsTopic: body.apnsTopic ?? null, deviceId: body.deviceId ?? null, receivedAtUtc: timestamp() })
      send(response, 200)
      return true
    }
    if (method === 'POST' && path === '/api/notifications/unsubscribe') {
      const { endpoint } = unsubscribeSchema.parse(await readBody(request))
      const index = registrations.findIndex((entry) => entry.endpoint === endpoint)
      if (index !== -1) registrations.splice(index, 1)
      send(response, 200)
      return true
    }
    if (method === 'GET' && path === '/api/notifications/subscriptions') {
      send(response, 200, pushSubscriptionsResponseSchema.parse({ max: maxPushSubscriptions, items: registrations.toReversed().map((entry) => ({
        id: entry.id, transport: ['apns', 'wns', 'fcm'].includes(entry.p256dh) ? 'native' : 'web', createdAtUtc: entry.receivedAtUtc,
        endpointHash: createHash('sha256').update(entry.endpoint).digest('hex'),
      })) }))
      return true
    }
    return false
  }

  return (request: IncomingMessage, response: ServerResponse) => {
    const method = request.method ?? 'GET'
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (method === 'POST' && ['/api/auth/send-code', '/api/auth/verify-code'].includes(path)) {
      process.stdout.write(`[mock] POST ${path}\n`)
      void handleEmailRequest(request, response, token).catch((error: unknown) => {
        process.stderr.write(`${String(error)}\n`)
        response.writeHead(400).end()
      })
      return
    }
    const habitLog = method === 'POST' ? /^\/api\/habits\/([^/]+)\/log$/.exec(path)?.[1] : undefined
    if (habitLog && !sessionRejected(request, path)) logs.push({ habitId: habitLog, source: 'habit-log', atUtc: timestamp() })
    route(request, response, method, path).then((handled) => {
      // The log names every acceptance route the shell or the BFF reached, such as the reminder Done; the harness's own
      // state polls stay out of it.
      if (handled && !(method === 'GET' && path.startsWith('/_test/'))) process.stdout.write(`[mock] ${method} ${path} ${response.statusCode}\n`)
      if (!handled) handleRequest(request, response)
    }, (error: unknown) => {
      process.stderr.write(`[mock] ${method} ${path} rejected: ${error instanceof Error ? error.message : String(error)}\n`)
      if (!response.headersSent) send(response, 400, { error: 'Invalid acceptance request' })
    })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { token } = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { token: string }
  validateFixturesOrExit()
  createServer(createAcceptanceHandler(token)).listen(5099, '127.0.0.1')
}
