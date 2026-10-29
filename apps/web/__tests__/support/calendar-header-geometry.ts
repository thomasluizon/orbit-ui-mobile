import { afterAll, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { collectSegmentCallSites } from '../../../../packages/shared/src/test-support/segmented-control-inventory'
import { closeChrome, type registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

export function seededDayMap(prefix: string) {
  const completed: CalendarDayEntry = { habitId: 'walk', title: 'Caminhar', status: 'completed', isBadHabit: false, dueTime: null, isOneTime: false }
  const missed: CalendarDayEntry = { ...completed, habitId: 'read', title: 'Ler', status: 'missed' }
  return new Map([[`${prefix}-02`, [completed]], [`${prefix}-03`, [completed, missed]], [`${prefix}-04`, [missed]]])
}

export const calendarKeys = collectSegmentCallSites(resolve(process.cwd(), '../..'), 'web').find((site) => site.path === 'app/(app)/calendar/page.tsx')!.optionKeys

export function calendarGeometryHarness(registerLaunch: typeof registerChromeLaunchHook) {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerLaunch(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  return { get browser() { return browser }, get stylesheet() { return stylesheet } }
}
