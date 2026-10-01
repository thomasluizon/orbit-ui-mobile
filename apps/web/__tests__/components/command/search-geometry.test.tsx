import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'
import SearchPage from '@/app/(app)/search/page'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const mocks = vi.hoisted(() => ({ wide: false, query: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: () => mocks.query() }))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: vi.fn(), isPending: false }), useSkipHabit: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))

const cases = [320, 412, 640, 1352].flatMap((width) =>
  ['en', 'pt-BR'].flatMap((locale) => [1, 3].map((count) => ({ width, locale, count }))),
)

describe('search result geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('aligns $count result rows with the field at $width in $locale', async ({ width, locale, count }) => {
    mocks.wide = width >= WIDE_DESKTOP_BREAKPOINT
    const habits = Array.from({ length: count }, (_, index) => createMockHabit({ id: `walk-${index}`, title: `Walk ${index}`, searchMatches: [{ field: 'title', value: null }] }))
    mocks.query.mockReturnValue({ data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: count, totalPages: 1, currentPage: 1 }, isPending: false, isFetching: false, isSuccess: true, isError: false, refetch: vi.fn() })
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><SearchPage /></NextIntlClientProvider>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'walk' } })
    await screen.findByRole('option', { name: /Walk 0/ })
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const measured = await page.evaluate(() => {
        const input = document.querySelector('[cmdk-input]')!.getBoundingClientRect()
        return {
          field: { left: input.left, right: input.right },
          rows: [...document.querySelectorAll('[cmdk-item]')].map((row) => {
            const bounds = row.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right, height: bounds.height }
          }),
          documentWidth: document.documentElement.scrollWidth,
        }
      })
      expect(measured.rows).toHaveLength(count)
      expect(measured.field.left).toBe(16)
      expect(measured.field.right).toBe(Math.min(width, 620) - 16)
      expect(measured.documentWidth).toBe(width)
      for (const row of measured.rows) {
        expect(row.left, JSON.stringify(measured)).toBe(measured.field.left)
        expect(row.right, JSON.stringify(measured)).toBe(measured.field.right)
        expect(row.height).toBeGreaterThanOrEqual(44)
      }
    } finally { await page.close() }
  })
})
