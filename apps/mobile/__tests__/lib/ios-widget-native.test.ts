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

describe.skipIf(process.platform !== 'darwin')('compiled WidgetKit state and session storage', () => {
  let directory: string
  let executable: string
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'orbit-widget-native-'))
    executable = join(directory, 'widget-tests')
    execFileSync('/usr/bin/xcrun', ['swiftc', '-o', executable,
      resolve('modules/orbit-widget/ios/Shared/WidgetState.swift'),
      resolve('modules/orbit-widget/ios/Shared/WidgetStore.swift'),
      resolve('__tests__/support/ios-widget-driver.swift')], { encoding: 'utf8', timeout: 60000 })
  }, 65000)
  afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }) })
  function run(mode: string, snapshot: ReturnType<typeof payload>) {
    return JSON.parse(execFileSync(executable, [mode], { input: JSON.stringify(snapshot), encoding: 'utf8' })) as unknown
  }
  const map = (snapshot: ReturnType<typeof payload>) => run('map', snapshot) as NativeDay

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
