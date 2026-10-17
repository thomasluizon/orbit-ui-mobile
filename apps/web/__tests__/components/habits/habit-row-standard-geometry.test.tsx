import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('habit row standard in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each((['light', 'dark'] as const).flatMap((mode) => [320, 1352].flatMap((width) =>
    [1, 2].map((scale) => ({ mode, width, scale })),
  )))('keeps the check and row geometry in $mode at $width with $scale text', async ({ mode, width, scale }) => {
    document.documentElement.style.fontSize = `${16 * scale}px`
    const mounted = render(<div className="habit-panel">
      {(['empty', 'done', 'overdue', 'bad'] as const).map((state) => <HabitRow key={state}
        habit={createMockHabit({ title: `Habit ${state}`, isBadHabit: state === 'bad' })} state={state} />)}
      <HabitRow habit={createMockHabit({ title: 'Child' })} depth={1} />
      <HabitRow habit={createMockHabit({ title: 'Partial parent' })} hasChildren childProgress={{ done: 1, total: 3 }} />
      <HabitRow habit={createMockHabit({ title: 'Complete parent' })} hasChildren childProgress={{ done: 3, total: 3 }} state="done" />
      <HabitRow habit={createMockHabit({ title: 'Selected' })} selectMode />
      <HabitRow habit={createMockHabit({ title: 'Unavailable' })} completionReadOnly completionStatusUnavailable />
    </div>)
    const markup = mounted.container.innerHTML
    mounted.unmount()
    document.documentElement.style.removeProperty('font-size')
    const page = await browser.newPage({ viewport: { width, height: 1500 } })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;padding:16px;background:var(--bg)}</style>${markup}`)
      const expectedPaint = await page.evaluate(() => {
        const reference = document.createElement('span')
        reference.style.background = 'var(--bg-card)'
        reference.style.boxShadow = 'inset 0 0 0 1px var(--hairline)'
        document.body.append(reference)
        const paint = getComputedStyle(reference)
        const result = { fill: paint.backgroundColor, border: paint.boxShadow }
        reference.remove()
        return result
      })
      const rows = await page.locator('[data-testid="habit-row"]').evaluateAll((elements) => elements.map((row) => {
        const check = row.querySelector('[data-habit-check], [data-status]') as HTMLElement | null
        const paint = check && getComputedStyle(check)
        const body = getComputedStyle(row)
        const bounds = row.getBoundingClientRect()
        return { check: check && { width: check.getBoundingClientRect().width, height: check.getBoundingClientRect().height, radius: paint!.borderTopLeftRadius, border: paint!.boxShadow, background: paint!.backgroundColor }, radius: body.borderTopLeftRadius, border: body.boxShadow, background: body.backgroundColor, left: bounds.left, right: bounds.right }
      }))
      expect(rows).toHaveLength(9)
      for (const row of rows) {
        expect(row.check).toMatchObject({ width: 28, height: 28, radius: '12px' })
        expect(row.radius).toBe('20px')
        expect(row.border).toContain(expectedPaint.border)
        expect(row.background).toBe(expectedPaint.fill)
        expect(row.left).toBeGreaterThanOrEqual(16)
        expect(row.right).toBeLessThanOrEqual(width - 16)
      }
      const partial = await page.locator('[data-habit-title="Partial parent"] [data-habit-check] path').evaluate((element) => {
        const path = element as SVGPathElement
        return { perimeter: path.getTotalLength(), progress: Number.parseFloat(path.getAttribute('stroke-dasharray')!) }
      })
      expect(partial.progress / partial.perimeter).toBeCloseTo(1 / 3, 3)
      expect(await page.locator('[data-habit-title="Habit empty"] [data-personal-text]').evaluate((element) => getComputedStyle(element).fontSize)).toBe(`${17 * scale}px`)
      const toggle = page.getByRole('button', { name: 'habits.statusDot.empty, habits.logHabit: Habit empty', exact: true })
      await toggle.focus()
      const focus = await toggle.evaluate((element) => {
        const paint = getComputedStyle(element)
        const bounds = element.getBoundingClientRect()
        return { width: bounds.width, height: bounds.height, radius: paint.borderTopLeftRadius, outline: paint.outlineStyle, outlineWidth: paint.outlineWidth, offset: paint.outlineOffset,
          childOutlines: Array.from(element.querySelectorAll('*')).filter((child) => getComputedStyle(child).outlineStyle !== 'none').length }
      })
      expect(focus).toMatchObject({ width: 48, radius: '22px', outline: 'solid', outlineWidth: '2px', offset: '-10px', childOutlines: 0 })
      expect(focus.height).toBeGreaterThanOrEqual(48)
    } finally { await page.close() }
  })
})
