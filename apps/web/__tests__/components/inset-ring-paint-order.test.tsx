import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { enUS } from 'date-fns/locale'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReactElement } from 'react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { neutralColors } from '@orbit/shared/theme'
import { buildCalendarDayMap } from '@orbit/shared/utils'
import { CalendarTimeGrid, type TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import { MilestoneShareCard } from '@/components/milestone-share/milestone-share-card'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

type Theme = 'dark' | 'light'
type EdgePoint = Readonly<{ edge: string; fromLeft: number | null; fromTop: number | null; covered: boolean }>

const columns: TimeGridColumn[] = Array.from({ length: 7 }, (_, index) => ({
  date: new Date(2026, 9, 5 + index),
  dateStr: `2026-10-${String(5 + index).padStart(2, '0')}`,
  isToday: false,
  isFuture: false,
}))
const dayMap = buildCalendarDayMap({
  habits: [null, '08:00', '21:00'].map((dueTime, index) => createMockHabitScheduleItem({
    id: `ring-${index}`, title: `Read ${index}`, dueTime, scheduledDates: columns.map((column) => column.dateStr),
  })), logs: {},
}, { from: columns[0]!.dateStr, to: columns[6]!.dateStr }, new Date(2026, 9, 8, 12))

const weekFrameEdges: EdgePoint[] = [
  { edge: 'top, above the day pane', fromLeft: 200, fromTop: 0.5, covered: true },
  { edge: 'left, beside the pinned head', fromLeft: 0.5, fromTop: 30, covered: true },
  { edge: 'left, beside the hour gutter', fromLeft: 0.5, fromTop: -60, covered: true },
  { edge: 'right', fromLeft: -0.5, fromTop: null, covered: false },
  { edge: 'bottom', fromLeft: null, fromTop: -0.5, covered: false },
]
const shareCardEdges: EdgePoint[] = [
  { edge: 'top', fromLeft: null, fromTop: 0.5, covered: true },
  { edge: 'left', fromLeft: 0.5, fromTop: null, covered: true },
  { edge: 'right', fromLeft: -0.5, fromTop: null, covered: true },
  { edge: 'bottom', fromLeft: null, fromTop: -0.5, covered: true },
]

function hairlineShadow(theme: Theme) {
  const [red, green, blue, alpha] = neutralColors[theme].hairline.match(/[\d.]+/g)!
  return `rgba(${red}, ${green}, ${blue}, ${alpha}) 0px 0px 0px 1px inset`
}

describe('Inset hairline ring paint order in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function probeRing(surface: ReactElement, options: Readonly<{ theme: Theme; width: number; frame: string; edges: EdgePoint[] }>) {
    const { container, unmount } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{surface}</NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: options.width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div style="display:flex;flex-direction:column;height:600px">${container.innerHTML}</div>`)
      await page.evaluate(({ theme, variables }) => {
        document.documentElement.className = theme
        for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value)
      }, { theme: options.theme, variables: resolveWebThemeVariables('orange', options.theme) })
      return await page.evaluate(({ frame: frameId, edges }) => {
        const frame = document.querySelector<HTMLElement>(`[data-testid="${frameId}"]`)!
        const box = frame.getBoundingClientRect()
        const name = (element: Element | null) => element?.getAttribute('data-testid')
          ?? `${element?.tagName.toLowerCase()}.${element?.getAttribute('class') ?? ''} ${element ? getComputedStyle(element).backgroundColor : ''}`
        const at = ({ fromLeft, fromTop }: { fromLeft: number | null; fromTop: number | null }) => {
          const left = fromLeft === null ? box.width / 2 : fromLeft < 0 ? box.width + fromLeft : fromLeft
          const top = fromTop === null ? box.height / 2 : fromTop < 0 ? box.height + fromTop : fromTop
          return document.elementFromPoint(box.left + left, box.top + top)
        }
        const inputTargets = Object.fromEntries(edges.map((point) => [point.edge, name(at(point))]))
        const hitRing = document.createElement('style')
        hitRing.textContent = `[data-testid="${frameId}"]::after { pointer-events: auto !important }`
        document.head.append(hitRing)
        const painters = Object.fromEntries(edges.map((point) => [point.edge, name(at(point))]))
        hitRing.remove()
        const ring = getComputedStyle(frame, '::after')
        return {
          painters, inputTargets,
          frameShadow: getComputedStyle(frame).boxShadow,
          frameRadius: getComputedStyle(frame).borderTopLeftRadius,
          ring: ['none', 'normal'].includes(ring.content) ? null : {
            shadow: ring.boxShadow, radius: ring.borderTopLeftRadius, pointerEvents: ring.pointerEvents,
            position: ring.position, inset: [ring.top, ring.right, ring.bottom, ring.left],
          },
        }
      }, { frame: options.frame, edges: options.edges })
    } finally {
      await page.close()
      unmount()
    }
  }

  function expectRingAboveChildren(probe: Awaited<ReturnType<typeof probeRing>>, options: Readonly<{ theme: Theme; frame: string; edges: EdgePoint[] }>) {
    const covered = options.edges.filter(({ covered: isCovered }) => isCovered).map(({ edge }) => edge)
    expect(covered.map((edge) => probe.inputTargets[edge]), 'a frame child sits flush with these edges, and the ring takes no pointer input').not.toContain(options.frame)
    expect(probe.painters, 'the frame ring paints above every frame child at each edge').toEqual(
      Object.fromEntries(options.edges.map(({ edge }) => [edge, options.frame])),
    )
    expect(probe.frameShadow, 'the frame does not draw a ring beneath its children').not.toContain('inset')
    expect(probe.ring).toEqual({
      shadow: hairlineShadow(options.theme), radius: probe.frameRadius, pointerEvents: 'none', position: 'absolute', inset: ['0px', '0px', '0px', '0px'],
    })
  }

  for (const theme of ['dark', 'light'] as const) {
    it.each([412, 1352])(`draws the ${theme} week frame hairline above the pinned head and the gutter at %ipx`, async (width) => {
      const options = { theme, width, frame: 'calendar-time-grid', edges: weekFrameEdges }
      const probe = await probeRing(<CalendarTimeGrid columns={columns} dayMap={dayMap} onSelectDay={vi.fn()} displayTime={(time) => time}
        dateFnsLocale={enUS} allDayLabel={en.calendar.timeGrid.noSetTime} nowLabel={en.calendar.timeGrid.now} timeZone="UTC" />, options)
      expectRingAboveChildren(probe, options)
    })

    it(`draws the ${theme} milestone share card hairline above its flush head block`, async () => {
      const options = { theme, width: 412, frame: 'milestone-share-card', edges: shareCardEdges }
      const probe = await probeRing(<MilestoneShareCard variant={{ kind: 'streak', streak: 30 }} referralUrl="" />, options)
      expectRingAboveChildren(probe, options)
    })
  }
})
