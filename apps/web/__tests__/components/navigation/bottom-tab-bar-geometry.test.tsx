import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { TAB_BAR_LABEL_MAX_FONT_SCALE } from '@orbit/shared/contracts/navigation'
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

  it('measures the common one-line limit from the shipped fonts in both locales', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      await page.setContent('<html></html>')
      await loadAppFonts(page)
      const nativeFont = readFileSync(require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf')).toString('base64')
      await page.addStyleTag({ content: `@font-face{font-family:NativeGeist;font-weight:500;src:url(data:font/ttf;base64,${nativeFont})}` })
      const widths = await page.evaluate(async (labels) => {
        await document.fonts.load('500 12px NativeGeist')
        const context = document.createElement('canvas').getContext('2d')!
        return ['Geist', 'NativeGeist'].flatMap((family) => {
          context.font = `500 12px ${family}`
          return labels.map((label) => ({ family, label, width: context.measureText(label).width }))
        })
      }, [en, ptBR].flatMap((messages) => ['today', 'calendar', 'progress', 'profile'].map((id) => messages.nav[id as 'today' | 'calendar' | 'progress' | 'profile'])))
      const densities = [1, 1.5, 2, 2.625, 3, 3.5, 4]
      const limits = widths.flatMap(({ family, width }) => family === 'NativeGeist'
        ? densities.map((density) => Math.floor(80 / width * 12 * density) / (12 * density))
        : [80 / width])
      const cap = Math.floor(Math.min(...limits) * 1000) / 1000
      expect(cap).toBe(TAB_BAR_LABEL_MAX_FONT_SCALE)
      const paintedWidths = (scale: number) => widths.flatMap(({ family, width }) => family === 'NativeGeist'
        ? densities.map((density) => width * Math.ceil(12 * scale * density) / (12 * density))
        : [width * scale])
      for (const width of paintedWidths(cap)) expect(width).toBeLessThanOrEqual(80)
      expect(Math.max(...paintedWidths(cap + 0.001))).toBeGreaterThan(80)
    } finally { await page.close() }
  })

  it.each([en, ptBR].flatMap((messages) => [320, 360, 384, 412].flatMap((width) => [1.3, 1.6, 2].map((textScale) => ({ messages, width, textScale })))))(
    'centres the full-size web viewer at $width and $textScale in $messages.nav.calendar',
    async ({ messages, width, textScale }) => {
      const page = await browser.newPage({ viewport: { width, height: 740 } })
      document.documentElement.style.fontSize = `${16 * textScale}px`
      const view = render(<BottomTabBar label={messages.nav.mainNavigation} activeId="hoje" onSelect={vi.fn()}
        items={SHELL_DESTINATION_IDS.map((id) => ({ id, href: `/${id}`, label: messages.nav[DESTINATION_ICONS[id].commandId],
          icon: ({ active }) => <DestinationIcon destination={id} active={active} /> }))} />)
      try {
        const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
        for (const id of SHELL_DESTINATION_IDS) {
          const label = messages.nav[DESTINATION_ICONS[id].commandId]
          const tab = view.getByRole('link', { name: label })
          vi.useFakeTimers()
          fireEvent.pointerDown(tab, { button: 0, pointerId: 1 })
          act(() => { vi.advanceTimersByTime(500) })
          const viewer = document.querySelector('[role="tooltip"]')!
          expect(viewer).not.toBeNull()
          const overlayMarkup = viewer.parentElement!.outerHTML
          fireEvent.pointerUp(tab, { pointerId: 1 })
          expect(document.querySelector('[role="tooltip"]')).toBeNull()
          vi.useRealTimers()
          await page.setContent(`<style>${stylesheet}:root{${theme}}html{font-size:${16 * textScale}px}</style>${view.container.innerHTML}${overlayMarkup}`)
          await loadAppFonts(page)
          const measured = await page.getByRole('tooltip', { name: label }).evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const label = element.querySelector('[data-tab-viewer-label]')!
            const range = document.createRange()
            range.selectNodeContents(label)
            const text = range.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right, centreX: bounds.x + bounds.width / 2, centreY: bounds.y + bounds.height / 2,
              fontSize: parseFloat(getComputedStyle(label).fontSize), lines: range.getClientRects().length,
              textLeft: text.left, textRight: text.right, iconWidth: element.querySelector('svg')!.getBoundingClientRect().width }
          })
          expect(measured.centreX).toBeCloseTo(width / 2, 1)
          expect(measured.centreY).toBeCloseTo(370, 1)
          expect(measured.textLeft).toBeGreaterThanOrEqual(measured.left)
          expect(measured.textRight).toBeLessThanOrEqual(measured.right)
          expect(measured.left).toBeGreaterThanOrEqual(16)
          expect(measured.right).toBeLessThanOrEqual(width - 16)
          expect(measured.fontSize).toBeCloseTo(12 * textScale, 3)
          expect(measured.iconWidth).toBeCloseTo(24 * textScale, 1)
          expect(measured.lines).toBe(1)
        }
      } finally {
        vi.useRealTimers()
        document.documentElement.style.removeProperty('font-size')
        view.unmount()
        await page.close()
      }
    },
  )

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

  it.each([en, ptBR].flatMap((messages) => [1, 1.3, 1.6, 2].flatMap((textScale) => (['dark', 'light'] as const).flatMap((mode) => [320, 360, 384, 412, 840].map((width) => ({ messages, textScale, mode, width }))))))(
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
              textOverflow: labelStyle.textOverflow, textLines: text.getClientRects().length, fontSize: parseFloat(labelStyle.fontSize),
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
          expect(measured.textLines).toBe(1)
          expect(measured.fontSize).toBeCloseTo(12 * Math.min(textScale, TAB_BAR_LABEL_MAX_FONT_SCALE), 3)
          expect(measured.lineHeight).toBeCloseTo(16 * Math.min(textScale, TAB_BAR_LABEL_MAX_FONT_SCALE), 3)
          expect(measured.labelHeight).toBe(measured.lineHeight)
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
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      } finally { await page.close() }
    },
  )
})
