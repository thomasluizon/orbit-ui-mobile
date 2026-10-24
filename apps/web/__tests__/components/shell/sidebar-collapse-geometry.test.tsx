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

  it.each(cases.filter(({ height }) => height === 600))('shows the Astra name with sibling row treatment at $width in $locale and $theme', async ({ locale, width, height, theme }) => {
    const messages = locale === 'en' ? en : ptBR
    const props = {
      items: SHELL_DESTINATION_IDS.map(id => ({ id, href: '/', label: messages.nav[DESTINATION_ICONS[id].labelKey.split('.')[1] as keyof typeof messages.nav], icon: id })),
      activeId: 'hoje', navLabel: messages.nav.mainNavigation,
      astraRow: { label: messages.nav.astra, onOpen: vi.fn() },
      conversation: <button type="button">Close conversation</button>, conversationLabel: messages.nav.astra,
    }
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}><ShellWide {...props} /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      for (const open of [false, true]) {
        view.rerender(<NextIntlClientProvider locale={locale} messages={messages}><ShellWide {...props} conversationOpen={open} /></NextIntlClientProvider>)
        await page.setContent(`<html class="${theme}"><style>${stylesheet}</style>${view.container.innerHTML}</html>`)
        await page.evaluate(variables => {
          for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value)
        }, resolveWebThemeVariables('orange', theme))
        await page.mouse.move(0, 0)
        const row = page.getByRole('button', { name: 'Astra', exact: true })
        await row.evaluate(async element => {
          element.getBoundingClientRect()
          await Promise.all(element.getAnimations().map(animation => animation.finished))
        })
        expect(await row.innerText()).toBe('Astra')
        expect(await row.getAttribute('aria-expanded')).toBe(String(open))
        const anatomy = await page.locator('[data-shell-sidebar] nav').evaluate(element => {
          return [...element.children].map(target => {
            const label = target.querySelector('span')!
            const bounds = target.getBoundingClientRect()
            const textBounds = label.getBoundingClientRect()
            const style = getComputedStyle(target)
            return { height: bounds.height, width: bounds.width, radius: style.borderRadius, padding: style.paddingInline,
              gap: style.gap, font: style.fontSize, weight: style.fontWeight, color: style.color,
              textHeight: textBounds.height, textOffset: textBounds.left - bounds.left }
          })
        })
        const [astra, today, calendar] = anatomy
        expect(astra!.textHeight).toBeGreaterThan(1)
        expect(astra).toEqual({ ...calendar, color: astra!.color })
        expect(astra!.height).toBe(48)
        expect(astra!.color === today!.color).toBe(false)
        const peer = page.getByRole('link', { name: messages.nav.calendar, exact: true })
        for (const target of [row, peer]) {
          await target.evaluate(element => {
            element.addEventListener('click', () => element.setAttribute('data-press-activated', 'true'), { once: true })
          })
          await target.focus()
          expect(await target.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
          await target.hover()
          await target.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)) })
          expect(await target.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
          await page.mouse.down()
          await target.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)) })
          expect(await target.evaluate(element => getComputedStyle(element).scale)).toBe('0.96')
          await page.mouse.move(0, 0)
          await page.mouse.up()
          expect(await target.getAttribute('data-press-activated'), 'measuring a press must not activate the control').toBeNull()
        }
      }
    } finally { await page.close(); view.unmount() }
  })

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
