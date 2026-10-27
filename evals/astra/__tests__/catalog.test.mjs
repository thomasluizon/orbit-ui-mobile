import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { beforeAll } from '../hooks.mjs'
import { structural } from '../assertions.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { toolCall } from './fixtures/producer.mjs'

const apiCommit = '0031b9e336fb046c00bee9335ef5808479f70437'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

// Producer: orbit-api src/Orbit.Application/Chat/Tools/Implementations/QueryHabitsTool.cs:26-45,
// src/Orbit.Application/Chat/RelativeReadPeriod.cs:37-43 and Chat/TerminalReadDirective.cs:19-33.
const relativeRead = ['query_habits', { relative_period: 'today', orbit_read_complete: true }]
// Producer: orbit-api src/Orbit.Application/Chat/Tools/Implementations/GetSubscriptionOverviewTool.cs:19-28
// and src/Orbit.Application/Chat/TerminalReadDirective.cs:19-33.
const completedRead = ['get_subscription_overview', { include_status: true, orbit_read_complete: true }]
// Producer: orbit-api src/Orbit.Application/Chat/Tools/Implementations/CreateHabitTool.cs:29,
// BulkCreateHabitsTool.cs:410-440, src/Orbit.Domain/Entities/Habit.cs:8-34 and ValueObjects/HabitPlacement.cs:7-9.
const placedHabit = ['create_habit', { title: 'Read', frequency_unit: 'Day', frequency_quantity: 1,
  parent_habit_id: '11111111-1111-4111-8111-111111111111', placement: 'sub_habit' }]
// Producer: orbit-api src/Orbit.Application/Chat/Tools/Implementations/GetHabitMonthTool.cs:18-35
// src/Orbit.Application/Habits/Queries/RetrospectivePeriodRange.cs:14-18 and Chat/TerminalReadDirective.cs:19-33.
const habitMonth = ['get_habit_month', { relative_period: 'this_month', language: 'en', orbit_read_complete: true }]

it.each([relativeRead, completedRead, placedHabit, habitMonth])('accepts the producer arguments for %s', async (name, supplied) => {
  const { status, ...call } = toolCall(name, supplied)
  const output = { trace: { state: 'available', requestId: 'catalog', responseRequestId: 'catalog',
    calls: [{ ...call, resultStatus: status }] } }
  const result = await structural(output, { vars: { evalRequestId: 'catalog' }, test: { vars: {} } })
  expect(result.pass, result.reason).toBe(true)
})

it.each([['different commit', 'a'.repeat(40)], ['missing commit', null], ['matching commit', apiCommit]])(
  'checks the catalog before the first live case: %s', async (_, servedCommit) => {
    offlineCredentials()
    vi.stubEnv('ORBIT_EVAL_GRADER', 'offline-grader')
    // Producer: orbit-api src/Orbit.Api/Extensions/WebApplicationExtensions.cs:103-125.
    const request = vi.fn(async () => Response.json({ status: 'Healthy', commit: servedCommit, checks: [] }))
    vi.stubGlobal('fetch', request)
    const start = async () => beforeAll({ suite: { tests: [] } })
    if (servedCommit === apiCommit) await expect(start()).resolves.toBeUndefined()
    else {
      const failure = await start().catch((error) => error)
      expect(failure).toBeInstanceOf(Error)
      expect(failure.message).toContain(`catalog ${apiCommit}`)
      expect(failure.message).toContain(`API ${servedCommit}`)
      expect(failure.message).toContain('node evals/astra/generate-catalog.mjs')
    }
    expect(request.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/health'])
  },
)

it('records the full API source commit and refuses a dirty checkout without replacing the catalog', () => {
  const catalogPath = new URL('../catalog.yaml', import.meta.url)
  const committed = readFileSync(catalogPath, 'utf8')
  expect(parse(committed).apiCommit).toBe(apiCommit)
  const directory = mkdtempSync(join(tmpdir(), 'astra-dirty-api-'))
  try {
    execFileSync('git', ['init', '--quiet', directory])
    writeFileSync(join(directory, 'untracked'), 'dirty')
    const run = spawnSync(process.execPath,
      [fileURLToPath(new URL('../generate-catalog.mjs', import.meta.url)), directory], { encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(1)
    expect(run.stderr).toContain('requires a clean API checkout')
    expect(readFileSync(catalogPath, 'utf8')).toBe(committed)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
