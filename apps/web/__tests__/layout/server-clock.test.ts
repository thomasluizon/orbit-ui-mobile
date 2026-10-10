import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

describe('layout server clock', () => {
  it('starts the server process on the browser fixture date in UTC', async () => {
    vi.stubEnv('LAYOUT', '1')
    try {
      const { default: configuration } = await import('../../playwright.config')
      const servers = configuration.webServer
      if (!Array.isArray(servers)) throw new Error('Missing layout servers')
      const server = servers.find((candidate) => candidate.command === 'npm run start')
      if (!server) throw new Error('Missing layout web server')
      const observed = execFileSync(process.execPath, ['--input-type=module', '--eval', `
        process.stdout.write(JSON.stringify({
          now: Date.now(),
          constructed: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          called: Date(),
          epoch: new Date(0).getTime(),
          explicit: new Date('2026-10-01T00:00:00Z').toISOString(),
          calendar: new Date(2026, 8, 4, 12).toISOString(),
          parsed: Date.parse('2026-10-01T00:00:00Z'),
          utc: Date.UTC(2026, 8, 4, 12),
          instance: new Date() instanceof Date,
          subclass: new (class extends Date {})().toISOString(),
          afterTimer: await new Promise((resolve) => setTimeout(() => resolve(Date.now()), 20)),
        }))
      `], { env: { ...process.env, ...server.env }, encoding: 'utf8' })
      expect(JSON.parse(observed)).toEqual({
        now: Date.parse('2026-09-04T12:00:00Z'),
        constructed: '2026-09-04T12:00:00.000Z',
        timeZone: 'UTC',
        called: 'Fri Sep 04 2026 12:00:00 GMT+0000 (Coordinated Universal Time)',
        epoch: 0,
        explicit: '2026-10-01T00:00:00.000Z',
        calendar: '2026-09-04T12:00:00.000Z',
        parsed: Date.parse('2026-10-01T00:00:00Z'),
        utc: Date.UTC(2026, 8, 4, 12),
        instance: true,
        subclass: '2026-09-04T12:00:00.000Z',
        afterTimer: Date.parse('2026-09-04T12:00:00Z'),
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
