import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { normalizeHabitQueryData } from '@orbit/shared/utils'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { ShellWide } from '@/components/shell/shell-wide'
import { CommandPalette } from '@/components/command/command-palette'
import { useShellStore } from '@/stores/shell-store'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => true }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: () => ({
  data: normalizeHabitQueryData([makeHabitScheduleItem()]),
  isPending: false, isFetching: false, isSuccess: true, isError: false, refetch: vi.fn(),
}) }))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: vi.fn(), isPending: false }), useSkipHabit: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))

const cases = [1100, 1352, 1440].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) =>
  ['Ctrl K', '⌘K'].flatMap((hint) => (['dark', 'light'] as const).map((theme) => ({ width, locale, hint, theme }))),
))

describe('sidebar and palette keycap geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const font = readFileSync(require.resolve('@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf')).toString('base64')
    stylesheet += `\n@font-face { font-family: 'Geist Mono'; src: url(data:font/ttf;base64,${font}); } :root { --font-geist-mono: 'Geist Mono'; }`
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('mirrors the icon and shares footer paint at $width in $locale with $hint in $theme', async ({ width, locale, hint, theme }) => {
    const messages = locale === 'en' ? en : ptBR
    useShellStore.setState({ paletteOpen: false })
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <ShellWide items={[]} activeId="hoje" navLabel={messages.nav.mainNavigation}
        paletteLabel={messages.nav.search} paletteHint={hint}
        onPalette={() => useShellStore.getState().setPaletteOpen(true)} />
      <CommandPalette navItems={[]} onCreateHabit={vi.fn()} />
    </NextIntlClientProvider>)
    const sidebar = container.querySelector('[data-shell-sidebar]')!
    const control = sidebar.querySelector('button')!
    expect(control.querySelector('kbd')).toHaveTextContent(hint)
    fireEvent.click(control)
    const palette = await screen.findByRole('dialog', { name: messages.command.title })
    expect([...palette.querySelectorAll('kbd')].map((key) => key.textContent)).toEqual(['↑↓', '↵', 'esc'])
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.setContent(`<html class="${theme}"><style>${stylesheet}</style>${sidebar.outerHTML}${palette.outerHTML}</html>`)
      await page.evaluate((variables) => {
        for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value)
      }, resolveWebThemeVariables('orange', theme))
      await page.evaluate(() => document.fonts.ready)
      const measured = await page.evaluate(() => {
        const button = document.querySelector('[data-shell-sidebar] button')!
        const field = button.getBoundingClientRect()
        const icon = button.querySelector('svg')!.getBoundingClientRect()
        const keycap = button.querySelector('kbd')!
        const bounds = keycap.getBoundingClientRect()
        const probe = document.createElement('span')
        probe.style.color = 'var(--fg-3)'
        probe.style.boxShadow = 'inset 0 0 0 1px var(--hairline)'
        button.append(probe)
        const paint = (element: Element) => {
          const style = getComputedStyle(element)
          return { height: element.getBoundingClientRect().height, padding: style.padding, radius: style.borderRadius,
            background: style.backgroundColor, shadow: style.boxShadow, font: style.fontFamily, size: style.fontSize, color: style.color }
        }
        return {
          icon: { leading: icon.left - field.left, top: icon.top - field.top, bottom: field.bottom - icon.bottom },
          keycap: { trailing: field.right - bounds.right, top: bounds.top - field.top, bottom: field.bottom - bounds.bottom },
          sidebar: paint(keycap), footer: [...document.querySelectorAll('[role="dialog"] kbd')].map(paint),
          expectedColor: getComputedStyle(probe).color, expectedShadow: getComputedStyle(probe).boxShadow,
          markedCount: document.querySelectorAll('kbd[data-keycap]').length,
        }
      })
      expect.soft(measured.icon).toEqual({ leading: 12, top: 14, bottom: 14 })
      expect.soft(Math.abs(measured.keycap.trailing - measured.icon.leading)).toBeLessThanOrEqual(0.5)
      expect.soft(Math.abs(measured.keycap.top - measured.icon.top)).toBeLessThanOrEqual(0.5)
      expect.soft(Math.abs(measured.keycap.bottom - measured.icon.bottom)).toBeLessThanOrEqual(0.5)
      expect.soft(measured.sidebar.font).toContain('Geist Mono')
      expect.soft(measured.sidebar).toEqual({ height: 20, padding: '0px 4px', radius: '8px', background: 'rgba(0, 0, 0, 0)',
        shadow: measured.expectedShadow, font: measured.sidebar.font, size: '12px', color: measured.expectedColor })
      for (const keycap of measured.footer) expect.soft(keycap).toEqual(measured.sidebar)
      expect.soft(measured.markedCount).toBe(4)
      for (const state of ['rest', 'hover', 'press']) {
        if (state !== 'rest') await page.locator('[data-shell-sidebar] button').hover()
        if (state === 'press') await page.mouse.down()
        try {
          const paint = await page.locator('[data-shell-sidebar] button kbd').evaluate((keycap) => {
            keycap.parentElement!.getAnimations().forEach((animation) => animation.finish())
            const layers: string[] = []
            for (let ancestor: Element | null = keycap; ancestor; ancestor = ancestor.parentElement) layers.unshift(getComputedStyle(ancestor).backgroundColor)
            return { color: getComputedStyle(keycap).color, layers }
          })
          expect.soft(contrastOnSurface(paint.color, paint.layers), `${theme} ${state}`).toBeGreaterThanOrEqual(4.5)
        } finally { if (state === 'press') await page.mouse.up() }
      }
    } finally { await page.close() }
  })
})
