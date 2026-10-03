import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { AccountDayValue } from '@orbit/shared/contracts/dates'
import { DayStrip } from '@/components/dates/day-strip'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const days: AccountDayValue[] = Array.from({ length: 14 }, (_, index) => (['active', 'frozen', 'missed', 'today'] as const)[index % 4]!)
const words = { active: 'active', frozen: 'protected', missed: 'missed', today: 'today' }

describe('DayStrip geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 360, 384, 412])('keeps all fourteen account cells square at %ipx', async (width) => {
    const { container } = render(<div style={{ width: width - 32 }}>
      <DayStrip scope="account" days={days} words={words} label="Account streak" />
    </div>)
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const geometry = await page.getByRole('group', { name: 'Account streak' }).evaluate((strip) => ({
        width: strip.getBoundingClientRect().width,
        scrollWidth: strip.scrollWidth,
        cells: [...strip.children].map((cell) => {
          const bounds = cell.getBoundingClientRect()
          return { width: bounds.width, height: bounds.height, left: bounds.left - strip.getBoundingClientRect().left, right: bounds.right - strip.getBoundingClientRect().left, radius: getComputedStyle(cell).borderTopLeftRadius }
        }),
      }))
      expect(geometry.width).toBe(width - 32)
      expect(geometry.scrollWidth).toBe(geometry.width)
      expect(geometry.cells).toHaveLength(14)
      geometry.cells.forEach((cell, index) => {
        expect(Math.abs(cell.width - cell.height)).toBeLessThanOrEqual(0.5)
        expect(cell.width).toBeCloseTo(Math.min(20, (width - 32 - 13 * 4) / 14), 1)
        expect(cell.radius).toBe('8px')
        expect(cell.right).toBeLessThanOrEqual(geometry.width + 0.5)
        if (index) expect(cell.left - geometry.cells[index - 1]!.right).toBeCloseTo(Math.max(4, (width - 32 - 14 * 20) / 13), 1)
      })
    } finally { await page.close() }
  })

  it.each([20, 24, 32])('preserves fitting account and habit cells at size %i', async (size) => {
    const { container } = render(<div style={{ width: 380 }}>
      <DayStrip scope="account" days={days.slice(0, 7)} size={size} words={words} label="Account streak" />
      <DayStrip scope="habit" days={['done', 'missed', 'not-scheduled']} size={size} words={{ done: 'done', missed: 'missed', notScheduled: 'rest' }} label="Habit history" />
    </div>)
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const bounds = await page.locator('[data-state]').evaluateAll((cells) => cells.map((cell) => {
        const rect = cell.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }))
      expect(bounds).toHaveLength(10)
      for (const cell of bounds) expect(cell).toEqual({ width: size, height: size })
    } finally { await page.close() }
  })
})
