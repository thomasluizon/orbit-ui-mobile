import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { z, type ZodType } from 'zod'
import { profileSchema, subscriptionStatusSchema } from '@orbit/shared/types/profile'
import { userCalendarsSchema } from '@orbit/shared/types/calendar'
import { appConfigSchema } from '@orbit/shared/types/config'
import { billingDetailsSchema, subscriptionPlansSchema } from '@orbit/shared/types/subscription'
import { gamificationProfileSchema } from '@orbit/shared/types/gamification'
import {
  createPaginatedSchema,
  habitScheduleItemSchema,
  habitTagSchema,
  logHabitResponseSchema,
} from '@orbit/shared/types/habit'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { checklistTemplateSchema } from '@orbit/shared/types/checklist-template'
import { referralDashboardSchema } from '@orbit/shared/types/referral'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { profileFixture } from './fixtures/profile'
import { configFixture } from './fixtures/config'
import { subscriptionPlansFixture } from './fixtures/subscription-plans'
import { billingDetailsFixture, subscriptionStatusFixture } from './fixtures/subscriptions'
import { gamificationProfileFixture } from './fixtures/gamification'
import {
  emptyChecklistTemplatesFixture,
  emptyGoalsPageFixture,
  emptyHabitsPageFixture,
  emptyTagsFixture,
  habitCountFixture,
} from './fixtures/collections'
import { notificationsFixture, referralDashboardFixture } from './fixtures/secondary'
import { mintHermeticJwt } from '../hermetic-session'

const HOST = '127.0.0.1'
const PORT = 5099
const habitMutations: { method: string; path: string; body: unknown }[] = []

interface MockRoute {
  method: string
  path: string
  schema: ZodType
  body: unknown
}

const routes: MockRoute[] = [
  { method: 'GET', path: '/api/profile', schema: profileSchema, body: profileFixture },
  { method: 'GET', path: '/api/calendar/calendars', schema: userCalendarsSchema, body: [] },
  { method: 'GET', path: '/api/config', schema: appConfigSchema, body: configFixture },
  {
    method: 'GET',
    path: '/api/subscriptions/plans',
    schema: subscriptionPlansSchema,
    body: subscriptionPlansFixture,
  },
  {
    method: 'GET',
    path: '/api/subscriptions/status',
    schema: subscriptionStatusSchema,
    body: subscriptionStatusFixture,
  },
  {
    method: 'GET',
    path: '/api/subscriptions/billing',
    schema: billingDetailsSchema,
    body: billingDetailsFixture,
  },
  {
    method: 'GET',
    path: '/api/gamification/profile',
    schema: gamificationProfileSchema,
    body: gamificationProfileFixture,
  },
  {
    method: 'GET',
    path: '/api/habits',
    schema: createPaginatedSchema(habitScheduleItemSchema),
    body: emptyHabitsPageFixture,
  },
  {
    method: 'GET',
    path: '/api/habits/count',
    schema: z.object({ count: z.number() }),
    body: habitCountFixture,
  },
  {
    method: 'GET',
    path: '/api/goals',
    schema: paginatedGoalResponseSchema,
    body: emptyGoalsPageFixture,
  },
  { method: 'GET', path: '/api/tags', schema: z.array(habitTagSchema), body: emptyTagsFixture },
  {
    method: 'GET',
    path: '/api/checklist-templates',
    schema: z.array(checklistTemplateSchema),
    body: emptyChecklistTemplatesFixture,
  },
  {
    method: 'GET',
    path: '/api/referrals/dashboard',
    schema: referralDashboardSchema,
    body: referralDashboardFixture,
  },
  {
    method: 'GET',
    path: '/api/notifications',
    schema: notificationsResponseSchema,
    body: notificationsFixture,
  },
]

function log(line: string): void {
  process.stdout.write(`[mock] ${line}\n`)
}

/** Validates every fixture against its Zod schema; drift exits non-zero so the performance gate fails. */
function validateFixturesOrExit(): void {
  for (const route of routes) {
    const result = route.schema.safeParse(route.body)
    if (!result.success) {
      process.stderr.write(
        `[mock] fixture drift on ${route.method} ${route.path}:\n${JSON.stringify(result.error.issues, null, 2)}\n`,
      )
      process.exit(1)
    }
  }
  log(`validated ${routes.length} fixtures`)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

function profileForRequest(req: IncomingMessage): unknown {
  const authorization = req.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return profileFixture
  const encodedPayload = authorization.slice('Bearer '.length).split('.')[1]
  if (!encodedPayload) return profileFixture

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown
    const session = z.object({ hermeticProfile: profileSchema.optional() }).parse(payload)
    return session.hermeticProfile ?? profileFixture
  } catch {
    return null
  }
}

function calendarsForRequest(req: IncomingMessage): unknown {
  const authorization = req.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return []
  const encodedPayload = authorization.slice('Bearer '.length).split('.')[1]
  if (!encodedPayload) return []

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown
    const session = z.object({ hermeticCalendars: userCalendarsSchema.optional() }).parse(payload)
    return session.hermeticCalendars ?? []
  } catch {
    return null
  }
}

function tagsForRequest(req: IncomingMessage): unknown {
  const authorization = req.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return emptyTagsFixture
  const encodedPayload = authorization.slice('Bearer '.length).split('.')[1]
  if (!encodedPayload) return emptyTagsFixture

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown
    const session = z.object({ hermeticTags: z.array(habitTagSchema).optional() }).parse(payload)
    return session.hermeticTags ?? emptyTagsFixture
  } catch {
    return null
  }
}

function handleCatchAll(method: string, pathname: string, res: ServerResponse): void {
  log(`unmapped ${method} ${pathname}`)
  if (method === 'POST' && pathname === '/api/auth/refresh') {
    const token = mintHermeticJwt()
    sendJson(res, 200, { token, refreshToken: token })
    return
  }
  if (method === 'GET') {
    sendJson(res, 200, {})
    return
  }
  sendJson(res, 200, {})
}

async function handleHabitMutation(req: IncomingMessage, res: ServerResponse, method: string, path: string): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    if (!(chunk instanceof Uint8Array)) throw new Error('Expected a request byte chunk')
    chunks.push(Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8')
  habitMutations.push({ method, path, body: text ? JSON.parse(text) as unknown : null })
  if (method === 'POST') {
    sendJson(res, 200, logHabitResponseSchema.parse({
      logId: 'layout-log', isFirstCompletionToday: false, currentStreak: 0,
    }))
  } else {
    res.writeHead(204)
    res.end()
  }
}

function handleHabitTestRequest(req: IncomingMessage, res: ServerResponse, method: string, pathname: string): boolean {
  if (pathname === '/_test/habit-mutations' && (method === 'GET' || method === 'DELETE')) {
    req.resume()
    if (method === 'DELETE') habitMutations.length = 0
    sendJson(res, 200, habitMutations)
    return true
  }
  if ((method === 'PUT' && pathname === '/api/habits/reorder') ||
      (method === 'POST' && /^\/api\/habits\/[^/]+\/log$/.test(pathname))) {
    void handleHabitMutation(req, res, method, pathname).catch(() => {
      sendJson(res, 400, { error: 'Invalid habit mutation fixture' })
    })
    return true
  }
  return false
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const method = req.method ?? 'GET'
  const pathname = new URL(req.url ?? '/', `http://${HOST}:${PORT}`).pathname

  if (handleHabitTestRequest(req, res, method, pathname)) return
  req.resume()

  if (pathname === '/health') {
    sendJson(res, 200, { status: 'ok' })
    return
  }

  const route = routes.find((entry) => entry.method === method && entry.path === pathname)
  if (route) {
    log(`${method} ${pathname}`)
    let body = route.body
    if (pathname === '/api/profile') body = profileForRequest(req)
    if (pathname === '/api/calendar/calendars') body = calendarsForRequest(req)
    if (pathname === '/api/tags') body = tagsForRequest(req)
    if (body === null) {
      const fixture = pathname.slice(pathname.lastIndexOf('/') + 1)
      sendJson(res, 400, { error: `Invalid hermetic ${fixture} session` })
      return
    }
    sendJson(res, 200, body)
    return
  }

  handleCatchAll(method, pathname, res)
}

validateFixturesOrExit()

createServer(handleRequest).listen(PORT, HOST, () => {
  log(`mock orbit-api listening on http://${HOST}:${PORT}`)
})
