import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { z, type ZodType } from 'zod'
import { profileSchema } from '@orbit/shared/types/profile'
import { appConfigSchema } from '@orbit/shared/types/config'
import { subscriptionPlansSchema } from '@orbit/shared/types/subscription'
import { gamificationProfileSchema } from '@orbit/shared/types/gamification'
import {
  createPaginatedSchema,
  habitScheduleItemSchema,
  habitTagSchema,
} from '@orbit/shared/types/habit'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { checklistTemplateSchema } from '@orbit/shared/types/checklist-template'
import { referralDashboardSchema } from '@orbit/shared/types/referral'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { profileFixture } from './fixtures/profile'
import { configFixture } from './fixtures/config'
import { subscriptionPlansFixture } from './fixtures/subscription-plans'
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

interface MockRoute {
  method: string
  path: string
  schema: ZodType
  body: unknown
}

const routes: MockRoute[] = [
  { method: 'GET', path: '/api/profile', schema: profileSchema, body: profileFixture },
  { method: 'GET', path: '/api/config', schema: appConfigSchema, body: configFixture },
  {
    method: 'GET',
    path: '/api/subscriptions/plans',
    schema: subscriptionPlansSchema,
    body: subscriptionPlansFixture,
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

/** Validates every fixture against its Zod schema; a drift exits non-zero so the visual job reds. */
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

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  req.resume()
  const method = req.method ?? 'GET'
  const pathname = new URL(req.url ?? '/', `http://${HOST}:${PORT}`).pathname

  if (pathname === '/health') {
    sendJson(res, 200, { status: 'ok' })
    return
  }

  const route = routes.find((entry) => entry.method === method && entry.path === pathname)
  if (route) {
    log(`${method} ${pathname}`)
    sendJson(res, 200, route.body)
    return
  }

  handleCatchAll(method, pathname, res)
}

validateFixturesOrExit()

createServer(handleRequest).listen(PORT, HOST, () => {
  log(`mock orbit-api listening on http://${HOST}:${PORT}`)
})
