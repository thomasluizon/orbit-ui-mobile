import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { DESTINATION_ICONS, SHELL_DESTINATION_IDS } from '@orbit/shared/utils'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { ShellWide } from '@/components/shell/shell-wide'
import { NotificationBellDisplay } from '@/components/navigation/notification-bell'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { useShellStore } from '@/stores/shell-store'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => true }))

const cases = (['en', 'pt-BR'] as const).flatMap(locale => [1024, 1440].flatMap(width =>
  [600, 900].flatMap(height => (['dark', 'light'] as const).map(theme => ({ locale, width, height, theme }))),
))

describe('collapsed sidebar geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  beforeEach(() => {
    localStorage.clear()
    useShellStore.setState(useShellStore.getInitialState())
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('keeps every target inside the rail at $width x $height in $locale and $theme', async ({ locale, width, height, theme }) => {
    const messages = locale === 'en' ? en : ptBR
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <ShellWide items={SHELL_DESTINATION_IDS.map(id => ({ id, href: '/', label: messages.nav[DESTINATION_ICONS[id].labelKey.split('.')[1] as keyof typeof messages.nav], icon: id }))}
        activeId="hoje" navLabel={messages.nav.mainNavigation} astraRow={{ label: messages.chat.title, onOpen: vi.fn() }}
        paletteLabel={messages.nav.search} paletteHint="Ctrl K" onPalette={vi.fn()}
        onCreate={vi.fn()} createLabel={messages.nav.createHabit} account="Person" accountEmail="person@example.test"
        notifications={<NotificationBellDisplay count={12} countPlacement="corner" onClick={vi.fn()} />} />
    </NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: messages.shell.collapseSidebar }))
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(`<html class="${theme}"><style>${stylesheet}</style>${view.container.innerHTML}</html>`)
      await page.evaluate(variables => {
        for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value)
      }, resolveWebThemeVariables('orange', theme))
      const measured = await page.evaluate(() => {
        const sidebar = document.querySelector<HTMLElement>('[data-shell-sidebar]')!
        return {
          width: sidebar.getBoundingClientRect().width,
          overflow: sidebar.scrollWidth > sidebar.clientWidth,
          targets: [...sidebar.querySelectorAll('button, a[href]')].map(element => {
            const bounds = element.getBoundingClientRect()
            return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right }
          }),
        }
      })
      expect(measured.width).toBe(96)
      expect(measured.overflow).toBe(false)
      expect(measured.targets).toHaveLength(10)
      for (const target of measured.targets) {
        expect(target.width).toBeGreaterThanOrEqual(48)
        expect(target.height).toBeGreaterThanOrEqual(48)
        expect(target.left).toBeGreaterThanOrEqual(0)
        expect(target.right).toBeLessThanOrEqual(96)
      }
      const toggle = page.locator('[data-shell-sidebar-toggle]')
      await page.keyboard.press('Tab')
      await toggle.focus()
      const focus = await toggle.evaluate(element => {
        const style = getComputedStyle(element)
        return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth) }
      })
      expect(focus.outline).not.toBe('none')
      expect(focus.width).toBeGreaterThanOrEqual(2)
      for (const state of ['rest', 'hover']) {
        if (state === 'hover') await toggle.hover()
        const paint = await toggle.evaluate(element => {
          element.getAnimations().forEach(animation => animation.finish())
          const layers: string[] = []
          for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) layers.unshift(getComputedStyle(ancestor).backgroundColor)
          return { color: getComputedStyle(element).color, layers }
        })
        expect(contrastOnSurface(paint.color, paint.layers), state).toBeGreaterThanOrEqual(3)
      }
    } finally { await page.close() }
  })
})
