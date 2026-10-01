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
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import SearchPage from '@/app/(app)/search/page'
import { CommandPalette } from '@/components/command/command-palette'
import { useShellStore } from '@/stores/shell-store'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
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

async function expectMatchContrast(page: Awaited<ReturnType<Browser['newPage']>>, index: number, surface: string, labels: string[], context: Record<string, unknown>) {
  const row = page.locator('[cmdk-item]').nth(index)
  for (const state of ['rest', 'hover', 'focus']) {
    await page.mouse.move(0, 0)
    await page.locator('[cmdk-input]').focus()
    if (state === 'hover') await row.hover()
    if (state === 'focus' && surface === 'search') {
      await row.focus()
      expect(await row.evaluate((element) => element === document.activeElement)).toBe(true)
    }
    const measured = await row.evaluate((element, matchLabels) => {
      for (const animation of element.getAnimations()) animation.finish()
      const match = [...element.querySelectorAll('span')].find((span) => matchLabels.includes(span.firstChild?.textContent?.trim() ?? ''))!
      const layers = []
      for (let ancestor: Element | null = match; ancestor; ancestor = ancestor.parentElement) layers.unshift(getComputedStyle(ancestor).backgroundColor)
      return { label: getComputedStyle(match).color, fragment: match.querySelector('span') ? getComputedStyle(match.querySelector('span')!).color : null, layers, fontSize: getComputedStyle(match).fontSize }
    }, labels)
    const evidence = JSON.stringify({ ...context, surface, index, state, measured })
    expect(measured.fontSize).toBe('12px')
    expect(contrastOnSurface(measured.label, measured.layers), evidence).toBeGreaterThanOrEqual(4.5)
    if (measured.fragment) {
      expect(contrastOnSurface(measured.fragment, measured.layers), evidence).toBeGreaterThanOrEqual(4.5)
      expect(contrastOnSurface(measured.fragment, measured.layers), evidence).toBeGreaterThan(contrastOnSurface(measured.label, measured.layers))
    }
  }
}

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

  it.each([412, 1352].flatMap((width) => ['en', 'pt-BR'].flatMap((locale) =>
    (['light', 'dark'] as const).flatMap((theme) => ['search', 'palette'].map((surface) => ({ width, locale, theme, surface }))),
  )))('keeps match text readable on $surface in $theme at $width in $locale', async ({ width, locale, theme, surface }) => {
    mocks.wide = width >= WIDE_DESKTOP_BREAKPOINT
    const messages = locale === 'en' ? en : ptBR
    const habits = [
      createMockHabit({ id: 'walk', title: 'Walk', searchMatches: [{ field: 'title', value: null }] }),
      createMockHabit({ id: 'stretch', title: 'Stretch', searchMatches: [{ field: 'tag', value: 'walking' }] }),
    ]
    mocks.query.mockReturnValue({ data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: 2, totalPages: 1, currentPage: 1 }, isPending: false, isFetching: false, isSuccess: true, isError: false, refetch: vi.fn() })
    useShellStore.setState({ paletteOpen: surface === 'palette' })
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>{surface === 'search' ? <SearchPage /> : <CommandPalette navItems={[]} onCreateHabit={vi.fn()} />}</NextIntlClientProvider>)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'walk' } })
    await screen.findByText('“walking”')
    const themeVariables = resolveWebThemeVariables('orange', theme)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      for (const selectedIndex of [0, 1]) {
        if (selectedIndex === 1) fireEvent.keyDown(input, { key: 'ArrowDown' })
        const rows = screen.getAllByRole('option')
        expect(rows[selectedIndex]).toHaveAttribute('data-selected', 'true')
        expect(rows[1 - selectedIndex]).toHaveAttribute('data-selected', 'false')
        const markup = surface === 'palette' ? screen.getByRole('dialog').outerHTML : container.innerHTML
        await page.setContent(`<style>${stylesheet}</style>${markup}`)
        await page.evaluate((variables) => {
          for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value)
          document.body.style.backgroundColor = 'var(--bg)'
        }, themeVariables)
        for (const index of [0, 1]) await expectMatchContrast(page, index, surface, [messages.habits.search.matchTitle, messages.habits.search.matchTag], { theme, selectedIndex })
      }
    } finally { await page.close() }
  })

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
