import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import type { FreezeBankWords } from '@orbit/shared/contracts/display'
import { FreezeBank } from '@/components/ui/freeze-bank'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const words: FreezeBankWords = {
  active: 'Active',
  frozen: 'Frozen',
  missed: 'Missed',
  today: 'Today',
  legendLabel: 'Streak day legend',
  bankedLabel: 'Banked',
  usedLabel: 'Used this month',
  nextLabel: 'Next freeze',
  nextProgressLabel: 'Progress to next freeze',
  nextFreezeProgress: '4 of 7 streak days',
  protectedLabel: 'Protected days',
  protectedEmpty: 'No protected days yet',
  protectedDay: 'Protected',
  protectedToday: 'Protected today',
}

const baseProps = {
  banked: 1,
  ceiling: 3,
  usedThisMonth: 1,
  daysTowardNext: 4,
  earnRateDays: 7,
  tierValue: 'Silver',
  tierLabel: 'Streak tier',
  longestValue: 21,
  longestLabel: 'Best streak',
  protectedDays: [],
  words,
} as const

describe('FreezeBank', () => {
  it('keeps bank bookkeeping inline and discloses the three named marks', () => {
    render(<FreezeBank {...baseProps} />)
    expect(screen.getByText('Banked')).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
    expect(screen.getByText('Best streak')).toBeInTheDocument()
    expect(screen.getByText('Silver')).toBeInTheDocument()
    expect(screen.getByText('4 of 7 streak days')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '7')
    expect(screen.getByText('No protected days yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Streak day legend' }))
    const legend = screen.getByRole('dialog')
    expect(legend).toHaveTextContent('Active')
    expect(legend).toHaveTextContent('Frozen')
    expect(legend).toHaveTextContent('Missed')
    expect(legend).not.toHaveTextContent('Today')

  })

  it('omits the entire earning row while full and resumes after the bank drops', () => {
    const { container, rerender } = render(<FreezeBank {...baseProps} banked={3} />)
    expect(screen.getByText('Banked')).toBeInTheDocument()
    expect(container.querySelector('[data-progress-state="resting"]')).toBeInTheDocument()
    expect(screen.queryByText('Next freeze')).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    rerender(<FreezeBank {...baseProps} banked={2} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
  })
})

describe('FreezeBank rendered spacing', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each([320, 412, 840, 1352].flatMap((width) => (['dark', 'light'] as const).map((mode) => ({ width, mode }))))('keeps 16 between bank groups and tiles at $width in $mode', async ({ width, mode }) => {
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      for (const banked of [2, 3]) {
        const { container, unmount } = render(<FreezeBank {...baseProps} banked={banked} />)
        const html = container.innerHTML
        unmount()
        await page.setContent(`<style>${stylesheet}</style><div class="${mode}" style="padding:16px">${html}</div>`)
        const geometry = await page.locator('[data-component="freeze-bank"]').evaluate((element) => {
          const groups = Array.from(element.children).map((group) => group.getBoundingClientRect())
          const tiles = Array.from(element.children[1]!.children).map((tile) => tile.getBoundingClientRect())
          return {
            groupGaps: groups.slice(1).map((current, index) => current.top - groups[index]!.bottom),
            tileGap: tiles[1]!.top >= tiles[0]!.bottom
              ? tiles[1]!.top - tiles[0]!.bottom : tiles[1]!.left - tiles[0]!.right,
          }
        })
        expect.soft(geometry.groupGaps).toEqual([16, 16, 16])
        expect.soft(geometry.tileGap).toBe(16)
      }
    } finally { await page.close() }
  })
})
