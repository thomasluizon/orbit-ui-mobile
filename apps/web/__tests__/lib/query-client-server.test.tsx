// @vitest-environment node

import { renderToStaticMarkup } from 'react-dom/server'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { Providers } from '@/lib/providers'
import { getQueryClient } from '@/lib/query-client'
import { useProfile } from '@/hooks/use-profile'
import { useConfig } from '@/hooks/use-config'
import { useCalendars } from '@/hooks/use-calendars'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useCalendarAutoSyncState, useCalendarSyncSuggestions } from '@/hooks/use-calendar-auto-sync'

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))

const renderedClients: QueryClient[] = []

function runHeapProbe(arguments_: string[]): Promise<string> {
  const started = performance.now()
  return new Promise((resolve, reject) => {
    execFile(process.execPath, arguments_, { timeout: 10_000 }, (cause, stdout, stderr) => {
      const progress = `startup: Node, tsx and probe imports\n${stderr}`
      if (cause) {
        reject(new Error(`Heap probe failed after ${(performance.now() - started).toFixed(1)} ms. Progress:\n${progress}`, { cause }))
      } else {
        if (process.env.ORBIT_TEST_PHASE_TIMINGS) process.stderr.write(progress)
        resolve(stdout)
      }
    })
  })
}

function AccountQueries() {
  const client = useQueryClient()
  renderedClients.push(client)
  useQuery({ queryKey: habitKeys.list({}), initialData: ['rendered habit'], queryFn: async () => [] })
  useProfile()
  useConfig()
  useCalendars()
  useCalendarEvents({ timeZone: 'UTC' })
  useCalendarAutoSyncState()
  useCalendarSyncSuggestions()
  return <main>{client.getQueryData<string[]>(habitKeys.list({}))?.[0]}</main>
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const client of renderedClients.splice(0)) client.clear()
  vi.useRealTimers()
})

describe('server query lifetime', () => {
  it('releases request contexts under a production-sized heap cap', async () => {
    vi.useRealTimers()
    const probe = fileURLToPath(new URL('../../test-support/query-client-heap.ts', import.meta.url))
    const stdout = await runHeapProbe([
      '--expose-gc', '--max-old-space-size=256', '--import', 'tsx', probe,
    ])
    const samples = JSON.parse(stdout) as { requests: number; heapBytes: number; retainedResponses: number }[]
    expect(samples.map(sample => sample.requests)).toEqual([0, 100, 200, 300, 400])
    expect(samples.map(sample => sample.retainedResponses)).toEqual([0, 0, 0, 0, 0])
    expect(samples[4]!.heapBytes - samples[0]!.heapBytes).toBeLessThan(16 * 1024 * 1024)
  })

  it('reports startup failure before the probe emits progress', async () => {
    vi.useRealTimers()
    await expect(runHeapProbe(['-e', 'process.exit(1)'])).rejects.toThrow('startup: Node, tsx and probe imports')
  })

  it('preserves the last probe phase when a child fails', async () => {
    vi.useRealTimers()
    await expect(runHeapProbe(['-e', 'process.stderr.write("measurement: 400 requests\\n"); process.exit(1)']))
      .rejects.toThrow('measurement: 400 requests')
  })

  it('reports a stalled child phase at the subprocess deadline', async () => {
    vi.useRealTimers()
    await expect(runHeapProbe(['-e', 'process.stderr.write("garbage collection: 200 requests\\n"); setInterval(() => {}, 1000)']))
      .rejects.toThrow('garbage collection: 200 requests')
  })

  it('creates an isolated client for each server render', () => {
    expect(getQueryClient()).not.toBe(getQueryClient())
  })

  it('does not retain completed account renders through query cleanup timers', () => {
    for (let request = 0; request < 50; request += 1) {
      expect(renderToStaticMarkup(<Providers><AccountQueries /></Providers>)).toContain('rendered habit')
    }
    expect(new Set(renderedClients).size).toBe(50)
    expect(renderedClients.every(client => client.getQueryCache().getAll().length === 7)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
