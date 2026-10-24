import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

interface Habit {
  id: string; title: string; isCompleted: boolean; isOverdue: boolean; dueTime: string | null
  checklistChecked: number; checklistTotal: number; isBadHabit: boolean; children: Habit[]; hasSubHabits: boolean
}

function habit(overrides: Partial<Habit> = {}): Habit {
  return { id: 'habit', title: 'Água da manhã', isCompleted: false, isOverdue: false, dueTime: '09:05:00',
    checklistChecked: 0, checklistTotal: 0, isBadHabit: false, children: [], hasSubHabits: false, ...overrides }
}

function payload(items: Habit[] = [], overrides: Record<string, unknown> = {}) {
  return { dayOffset: 0, language: 'pt-BR', currentStreak: 2, items, emptyReason: null, uses24HourClock: true, ...overrides }
}

interface NativeDay {
  completed: number; total: number; tomorrow: boolean; emptyKey: string
  rows: { id: string; state: string; depth: number; childrenDone: number; childrenTotal: number; deeperCount: number; time: string }[]
}

interface NativeEntry { signedOut: boolean; completed: number; rows: string[] }
interface TimelineResult {
  foreground: NativeEntry
  steps: { timeline: NativeEntry; snapshot: NativeEntry; tokenPresent: boolean; requestCount: number; language: string; snapshotLanguage: string }[]
  requests: { path: string; authorized: boolean }[]
  scheduled: NativeEntry[]
  scheduledAfterSeconds: number[]
}

describe.skipIf(process.platform !== 'darwin')('compiled WidgetKit state and session storage', () => {
  let directory: string
  let executable: string
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'orbit-widget-native-'))
    executable = join(directory, 'widget-tests')
    execFileSync('/usr/bin/xcrun', ['swiftc', '-o', executable,
      resolve('modules/orbit-widget/ios/Shared/WidgetState.swift'),
      resolve('modules/orbit-widget/ios/Shared/WidgetStore.swift'),
      resolve('modules/orbit-widget/ios/Shared/WidgetTimeline.swift'),
      resolve('__tests__/support/ios-widget-timeline-driver.swift'),
      resolve('__tests__/support/ios-widget-driver.swift')], { encoding: 'utf8', timeout: 60000 })
  }, 65000)
  afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }) })
  function run(mode: string, snapshot: ReturnType<typeof payload>) {
    return JSON.parse(execFileSync(executable, [mode], { input: JSON.stringify(snapshot), encoding: 'utf8' })) as unknown
  }
  const map = (snapshot: ReturnType<typeof payload>) => run('map', snapshot) as NativeDay

  function timeline(steps: { afterSeconds: number; status?: number; replaceSession?: string; responseAfterSeconds?: number }[], secondsBeforeMidnight?: number, language = 'pt-BR') {
    const scenario = { foreground: payload([habit({ id: 'foreground' })], { language }),
      background: payload([habit({ id: 'background', isCompleted: true })], { language }), steps, secondsBeforeMidnight }
    return JSON.parse(execFileSync(executable, ['timeline'], { input: JSON.stringify(scenario), encoding: 'utf8' })) as TimelineResult
  }

  it.each([undefined, 600])('replaces an expired foreground session with the sign-in state, including midnight (%s)', (secondsBeforeMidnight) => {
    const result = timeline([{ afterSeconds: 1200, status: 401 }, { afterSeconds: 2100 }], secondsBeforeMidnight)
    expect(result.foreground).toMatchObject({ signedOut: false, rows: ['foreground'] })
    for (const step of result.steps) {
      expect(step.timeline).toEqual({ signedOut: true, completed: -1, rows: [] })
      expect(step.snapshot).toEqual(step.timeline)
      expect(step.tokenPresent).toBe(false)
      expect([step.language, step.snapshotLanguage]).toEqual(['pt-BR', 'pt-BR'])
    }
    expect(result.requests).toEqual([{ path: '/api/habits/widget', authorized: true }])
  })

  it.each(['en', 'pt-BR'])('retains %s for the signed-out open-app state', (language) => {
    const result = timeline([{ afterSeconds: 120, status: 401 }], undefined, language)
    expect(result.steps[0]).toMatchObject({ language, snapshotLanguage: language, timeline: { signedOut: true } })
  })

  it('keeps a same-day foreground cache on transient connectivity and server failures', () => {
    const result = timeline([{ afterSeconds: 120, status: 503 }, { afterSeconds: 240 }])
    for (const step of result.steps) {
      expect(step.timeline).toEqual(result.foreground)
      expect(step.snapshot).toEqual(result.foreground)
      expect(step.tokenPresent).toBe(true)
    }
  })

  it('uses the foreground freshness window before refreshing the authorized cache', () => {
    const result = timeline([{ afterSeconds: 30, status: 200 }, { afterSeconds: 120, status: 200 }])
    expect(result.steps[0]).toMatchObject({ requestCount: 0, timeline: result.foreground, snapshot: result.foreground })
    expect(result.steps[1]).toMatchObject({ requestCount: 1, timeline: { rows: ['background'] }, snapshot: { rows: ['background'] } })
  })

  it('schedules a localized open-app entry at midnight even without another refresh', () => {
    const result = timeline([], 20)
    expect(result.scheduled).toEqual([result.foreground, { signedOut: true, completed: -1, rows: [] }])
    expect(result.scheduledAfterSeconds).toEqual([0, 20])
  })

  it('discards an authorized response requested on the previous day', () => {
    const result = timeline([{ afterSeconds: 0, status: 200, responseAfterSeconds: 20 }], 90)
    expect(result.steps[0]?.requestCount).toBe(0)
    const crossing = timeline([{ afterSeconds: 60, status: 200, responseAfterSeconds: 120 }], 90)
    expect(crossing.steps[0]).toMatchObject({ requestCount: 1,
      timeline: { signedOut: true, rows: [] }, snapshot: { signedOut: true, rows: [] } })
  })

  it('persists background success for the next snapshot and offline or server-error fallback', () => {
    const result = timeline([{ afterSeconds: 120, status: 200 }, { afterSeconds: 240 }, { afterSeconds: 360, status: 503 }])
    expect(result.foreground.rows).toEqual(['foreground'])
    expect(result.requests).toHaveLength(3)
    for (const step of result.steps) {
      expect(step.timeline).toEqual({ signedOut: false, completed: 1, rows: ['background'] })
      expect(step.snapshot).toEqual(step.timeline)
    }
  })

  it.each([30, 120])('never republishes yesterday’s cache after midnight with an offline app (%s)', (afterSeconds) => {
    const result = timeline([{ afterSeconds }], 20)
    expect(result.foreground.rows).toEqual(['foreground'])
    expect(result.steps[0]?.snapshot.rows).toEqual([])
    expect(result.steps[0]?.timeline.rows).toEqual([])
  })

  it.each([200, 401])('ignores an old account response (%s) after an account switch', (status) => {
    const result = timeline([{ afterSeconds: 120, status, replaceSession: 'other' }])
    expect(result.steps[0]).toMatchObject({ tokenPresent: true,
      timeline: { signedOut: false, rows: ['foreground'] }, snapshot: { signedOut: false, rows: ['foreground'] } })
  })

  it.each([200, 401])('ignores a superseded access token response (%s) after rotation', (status) => {
    const result = timeline([{ afterSeconds: 120, status, replaceSession: 'rotated' }])
    expect(result.steps[0]).toMatchObject({ tokenPresent: true,
      timeline: { signedOut: false, rows: ['foreground'] }, snapshot: { signedOut: false, rows: ['foreground'] } })
  })

  it('rejects an in-flight background success after logout', () => {
    const result = timeline([{ afterSeconds: 120, status: 200, replaceSession: 'logout' }])
    expect(result.steps[0]).toMatchObject({ tokenPresent: false,
      timeline: { signedOut: true, rows: [] }, snapshot: { signedOut: true, rows: [] } })
  })

  it('uses done before overdue and keeps a pending state', () => {
    const day = map(payload([
      habit({ id: 'done', isCompleted: true, isOverdue: true }),
      habit({ id: 'overdue', isOverdue: true }), habit({ id: 'pending' }),
    ]))
    expect(day.rows.map((row) => row.state)).toEqual(['done', 'overdue', 'pending'])
    expect([day.completed, day.total]).toEqual([1, 3])
  })

  it('counts non-bad children, including those belonging to a bad parent', () => {
    const day = map(payload([habit({ id: 'parent', isBadHabit: true, hasSubHabits: true, children: [
      habit({ id: 'child', isCompleted: true }), habit({ id: 'bad-child', isBadHabit: true }),
    ] }), habit({ id: 'bad-leaf', isBadHabit: true })]))
    expect([day.completed, day.total]).toEqual([1, 1])
    expect(day.rows[0]).toMatchObject({ state: 'done', childrenDone: 1, childrenTotal: 1 })
  })

  it('flattens one child level and counts deeper descendants', () => {
    const day = map(payload([habit({ id: 'parent', children: [habit({ id: 'child', children: [habit({ id: 'grandchild' })] })] })]))
    expect(day.rows.map((row) => [row.id, row.depth, row.deeperCount])).toEqual([['parent', 0, 0], ['child', 1, 1]])
  })

  it('resets completed and overdue states for tomorrow', () => {
    const day = map(payload([habit({ isCompleted: true, isOverdue: true, children: [habit({ id: 'child', isCompleted: true })] })], { dayOffset: 1 }))
    expect(day.tomorrow).toBe(true)
    expect(day.rows.every((row) => row.state === 'pending')).toBe(true)
    expect([day.completed, day.total]).toEqual([0, 1])
  })

  it.each([['nothing-scheduled', 'nothingScheduled'], ['all-done', 'allClear'], [null, 'allClear']])('maps empty reason %s', (emptyReason, key) => {
    expect(map(payload([], { emptyReason })).emptyKey).toBe(key)
  })

  it('formats the profile clock without guessing the locale clock', () => {
    expect(map(payload([habit()])).rows[0]?.time).toBe('09:05')
    expect(map(payload([habit()], { language: 'en', uses24HourClock: false })).rows[0]?.time).toBe('9:05 AM')
  })

  it('shares credentials safely across rotation, switch, logout and reinstall', () => {
    const observations = run('store', payload([habit()])) as Record<string, boolean>
    expect(Object.keys(observations)).toHaveLength(18)
    expect(observations).toMatchObject({ failedSwitchRevokesPriorAccount: true, rotationFailureKeepsSameAccount: true })
    expect(Object.values(observations).every(Boolean)).toBe(true)
  })
})
