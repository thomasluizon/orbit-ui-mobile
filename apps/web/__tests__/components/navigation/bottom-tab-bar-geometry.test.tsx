import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ShellWide } from '@/components/shell/shell-wide'
import { Composer } from '@/components/shell/composer'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { DestinationIcon } from '@/components/navigation/destination-icon'
import { DESTINATION_ICONS, SHELL_DESTINATION_IDS } from '@orbit/shared/utils'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'


vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('Bottom tab geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([en, ptBR].flatMap((messages) => [320, 360, 412].flatMap((width) => [true, false].map((withComposer) => ({ messages, width, withComposer })))))(
    'keeps shell tabs visible above the gesture inset at $width with 200% text and composer=$withComposer in $messages.nav.calendar',
    async ({ messages, width, withComposer }) => {
      const view = render(<ShellWide items={[]} activeId="hoje" navLabel={messages.nav.mainNavigation}
        astraRow={{ label: 'Astra', onOpen: vi.fn() }}
        compactComposer={withComposer ? <Composer state="idle" value="" words={messages.shell.composer} suggestions={[]}
          onChangeValue={vi.fn()} onSend={vi.fn()} /> : undefined}
        tabBar={<BottomTabBar label={messages.nav.mainNavigation} activeId="hoje" onSelect={vi.fn()}
          items={SHELL_DESTINATION_IDS.map((id) => ({ id, href: { hoje: '/', calendario: '/calendar', progresso: '/progress', perfil: '/profile' }[id],
            label: messages.nav[DESTINATION_ICONS[id].commandId], icon: ({ active }) => <DestinationIcon destination={id} active={active} /> }))} />}>
        <div style={{ height: 1600 }} />
      </ShellWide>)
      const page = await browser.newPage({ viewport: { width, height: 740 } })
      try {
        const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<style>${stylesheet}:root{${theme};--safe-bottom:24px}html{font-size:32px}</style>${view.container.innerHTML}`)
        await loadAppFonts(page)
        const tabs = await page.locator('[data-shell-tab-bar]').boundingBox()
        expect(tabs).not.toBeNull()
        expect(tabs!.y + tabs!.height).toBe(740 - 24)
        expect(tabs!.height).toBeGreaterThan(80)
        const scroller = await page.locator('[data-shell-scroller]').boundingBox()
        expect(scroller!.y + scroller!.height).toBeLessThanOrEqual(tabs!.y)
        if (withComposer) {
          const composer = await page.locator('[data-shell-pinned-slot]').boundingBox()
          expect(composer!.y + composer!.height).toBeLessThanOrEqual(tabs!.y)
        }
        const links = page.locator('[data-shell-tab-bar] a')
        expect(await links.count()).toBe(4)
        for (const link of await links.all()) {
          expect(await link.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const label = element.querySelector('span:last-child')!
            const text = document.createRange()
            text.selectNodeContents(label)
            return [...text.getClientRects()].every((line) => line.left >= bounds.left && line.right <= bounds.right && line.bottom <= bounds.bottom)
              && bounds.top >= 0 && bounds.bottom <= innerHeight - 24 && bounds.left >= 0 && bounds.right <= innerWidth
              && element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
          })).toBe(true)
        }
      } finally { await page.close(); view.unmount() }
    },
  )

  it.each([en, ptBR].flatMap((messages) => [1, 2].flatMap((textScale) => (['dark', 'light'] as const).flatMap((mode) => [320, 360, 412, 840].map((width) => ({ messages, textScale, mode, width }))))))(
    'keeps complete labels and separated targets at $width with $textScale text scale in $messages.nav.calendar and $mode mode',
    async ({ messages, textScale, mode, width }) => {
      const { container } = render(<BottomTabBar label={messages.nav.mainNavigation} activeId="hoje" onSelect={vi.fn()}
        items={SHELL_DESTINATION_IDS.map((id) => ({ id, href: { hoje: '/', calendario: '/calendar', progresso: '/progress', perfil: '/profile' }[id], label: messages.nav[DESTINATION_ICONS[id].commandId], icon: ({ active }) => <DestinationIcon destination={id} active={active} color={active ? 'var(--primary)' : 'var(--fg-3)'} /> }))} />)
      const page = await browser.newPage({ viewport: { width, height: 740 } })
      try {
        const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<html class="${mode}"><style>${stylesheet}:root{${theme}}html{font-size:${16 * textScale}px}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const bar = await page.locator('nav').boundingBox()
        expect(bar).not.toBeNull()
        if (textScale === 1) expect(bar!.height).toBe(80)
        const buttons = page.getByRole('link')
        expect(await buttons.count()).toBe(4)
        let indicatorTop: number | undefined
        for (const button of await buttons.all()) {
          const measured = await button.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const icon = element.querySelector('svg')!
            const iconBounds = icon.getBoundingClientRect()
            const indicator = icon.parentElement!
            const indicatorBounds = indicator.getBoundingClientRect()
            const label = element.querySelector('span:last-child')!
            const labelBounds = label.getBoundingClientRect()
            const labelStyle = getComputedStyle(label)
            const text = document.createRange()
            text.selectNodeContents(label)
            const textBounds = text.getBoundingClientRect()
            return {
              width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right,
              top: bounds.top, bottom: bounds.bottom, iconTop: iconBounds.top,
              indicatorWidth: indicatorBounds.width, indicatorHeight: indicatorBounds.height,
              indicatorTop: indicatorBounds.top, indicatorBottom: indicatorBounds.bottom,
              gap: labelBounds.top - indicatorBounds.bottom,
              lineHeight: parseFloat(labelStyle.lineHeight), labelHeight: labelBounds.height,
              textWidth: textBounds.width, labelWidth: labelBounds.width, whiteSpace: labelStyle.whiteSpace,
              textOverflow: labelStyle.textOverflow,
            }
          })
          expect(measured.width).toBeGreaterThanOrEqual(48)
          expect(measured.height).toBeGreaterThanOrEqual(48)
          expect(measured.iconTop - bar!.y).toBeGreaterThanOrEqual(16)
          expect(measured.indicatorWidth).toBe(56)
          expect(measured.indicatorHeight).toBe(32)
          indicatorTop ??= measured.indicatorTop
          expect(measured.indicatorTop).toBe(indicatorTop)
          expect(measured.gap).toBe(4)
          expect(measured.lineHeight).toBe(16 * textScale)
          if (textScale === 1) expect(measured.labelHeight).toBe(measured.lineHeight)
          else expect(measured.labelHeight).toBeGreaterThanOrEqual(measured.lineHeight)
          expect(measured.textWidth).toBeLessThanOrEqual(measured.labelWidth)
          expect(measured.left).toBeGreaterThanOrEqual(0)
          expect(measured.right).toBeLessThanOrEqual(width)
          expect(measured.bottom).toBeLessThanOrEqual(bar!.y + bar!.height)
          expect(measured.textOverflow).not.toBe('ellipsis')
          expect(measured.indicatorTop).toBeGreaterThan(bar!.y)
          const restingLabel = await button.locator('span:last-child').evaluate((element) => getComputedStyle(element).color)
          await button.hover()
          const hover = await button.evaluate((element) => {
            const indicator = element.querySelector('[data-tab-indicator]')!
            const style = getComputedStyle(indicator)
            const bounds = indicator.getBoundingClientRect()
            const probe = document.createElement('span')
            probe.style.backgroundColor = 'var(--bg-hover)'
            element.append(probe)
            const token = getComputedStyle(probe).backgroundColor
            probe.remove()
            return { buttonBackground: getComputedStyle(element).backgroundColor, background: style.backgroundColor, token,
              radius: Math.min(parseFloat(style.borderTopLeftRadius), bounds.width / 2, bounds.height / 2) }
          })
          expect(hover.background).toBe(hover.token)
          expect(hover.buttonBackground).toBe('rgba(0, 0, 0, 0)')
          expect(hover.radius).toBe(16)
          expect(await button.locator('svg').evaluate((element) => getComputedStyle(element.parentElement!).backgroundColor)).toBe(hover.token)
          await page.mouse.down()
          expect(await button.locator('svg').evaluate((element) => getComputedStyle(element.parentElement!).backgroundColor)).toBe(hover.token)
          await page.mouse.move(0, 0)
          await page.mouse.up()
          await button.hover()
          const colors = await button.evaluate((element) => {
            const icon = element.querySelector('svg')!
            const iconStyle = getComputedStyle(icon)
            return {
              canvas: getComputedStyle(element.closest('nav')!).backgroundColor,
              label: getComputedStyle(element.querySelector('span:last-child')!).color,
              indicator: getComputedStyle(icon.parentElement!).backgroundColor,
              icon: iconStyle.fill === 'none' ? iconStyle.stroke : iconStyle.fill,
            }
          })
          expect(colors.label).toBe(restingLabel)
          expect(contrastOnSurface(colors.label, [colors.canvas])).toBeGreaterThanOrEqual(4.5)
          expect(contrastOnSurface(colors.icon, [colors.canvas, colors.indicator])).toBeGreaterThanOrEqual(3)
          await page.keyboard.press('Tab')
          await button.focus()
          expect(await button.evaluate((element) => getComputedStyle(element, '::after').outlineStyle)).not.toBe('none')
          expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none')
        }
        const bounds = await buttons.evaluateAll((elements) => elements.map((element) => {
          const { left, right, top, bottom } = element.getBoundingClientRect()
          return { left, right, top, bottom }
        }))
        for (let index = 1; index < bounds.length; index++) {
          const current = bounds[index]!
          const previous = bounds[index - 1]!
          expect(current.top).toBe(previous.top)
          expect(current.bottom).toBe(previous.bottom)
          expect(current.left).toBeGreaterThanOrEqual(previous.right)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      } finally { await page.close() }
    },
  )
})
