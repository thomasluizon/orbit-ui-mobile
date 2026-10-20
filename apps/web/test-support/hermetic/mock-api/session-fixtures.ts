import type { IncomingMessage } from 'node:http'
import { z, type ZodType } from 'zod'

const fixtureSchema = z.object({
  path: z.string(),
  delayMs: z.number().int().min(0).max(30_000).optional(),
  body: z.unknown(),
  query: z.record(z.string(), z.string()).optional(),
  afterMutation: z.object({ method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']), path: z.string(), body: z.unknown() }).optional(),
})
const seedSchema = z.object({ fixtures: z.array(fixtureSchema) })
export type SessionFixture = z.infer<typeof fixtureSchema>

export function readFixtureSession(req: IncomingMessage): string | undefined {
  const encoded = req.headers.authorization?.replace(/^Bearer /, '').split('.')[1]
  if (!encoded) return undefined
  const claims = z.object({ hermeticFixtureSession: z.string().min(1).optional() })
    .parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown)
  return claims.hermeticFixtureSession
}

export function createSessionFixtureStore(routes: readonly { method: string; path: string; schema: ZodType }[]) {
  const sessions = new Map<string, SessionFixture[]>()
  return {
    seed(session: string, input: unknown) {
      const { fixtures } = seedSchema.parse(input)
      for (const fixture of fixtures) {
        const route = routes.find((entry) => entry.method === 'GET' && entry.path === fixture.path)
        if (!route) throw new Error('Unknown session fixture endpoint')
        fixture.body = route.schema.parse(fixture.body)
        if (fixture.afterMutation) fixture.afterMutation.body = route.schema.parse(fixture.afterMutation.body)
      }
      const previous = sessions.get(session) ?? []
      for (const fixture of fixtures) {
        const key = (entry: SessionFixture) => JSON.stringify([entry.path, Object.entries(entry.query ?? {}).sort(([left], [right]) => left.localeCompare(right))])
        const index = previous.findIndex((entry) => key(entry) === key(fixture))
        if (index === -1) previous.push(fixture)
        else previous[index] = fixture
      }
      sessions.set(session, previous)
    },
    read(session: string, url: URL): SessionFixture | undefined {
      return [...(sessions.get(session) ?? [])].reverse().find((entry) => entry.path === url.pathname &&
        Object.entries(entry.query ?? {}).every(([key, value]) => url.searchParams.get(key) === value))
    },
    mutate(session: string, method: string, path: string) {
      for (const fixture of sessions.get(session) ?? []) {
        if (fixture.afterMutation?.method !== method || fixture.afterMutation.path !== path) continue
        fixture.body = fixture.afterMutation.body
        delete fixture.afterMutation
      }
    },
  }
}
