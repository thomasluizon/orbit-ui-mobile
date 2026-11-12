import { settleAnimations } from '@/e2e/layout/settle-animations'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DateField } from '@/components/ui/date-field'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { Sheet } from '@/components/ui/sheet'
import { buildYearRange } from '@orbit/shared/utils'
import { controlContrast } from '@orbit/shared/__tests__/contrast'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 0 } }) }))
Element.prototype.scrollIntoView = vi.fn()

const BODY_INSETS_BY_WIDTH = new Map([
  [320, 4], [324, 8], [332, 12], [339, 12], [340, 16], [344, 16],
  [352, 16], [355, 16], [356, 24], [412, 24], [640, 24], [915, 24],
])

describe('DateField sheet geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['dark', 'light'] as const)('distinguishes empty trigger text from a selected date in %s mode', async (theme) => {
    const { container } = render(<>
      <DateField value="" placeholder="31/12/2026" onChange={vi.fn()} />
      <DateField value="" onChange={vi.fn()} />
      <DateField value="2025-06-15" onChange={vi.fn()} />
    </>)
    const page = await browser.newPage()
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', theme)).map(([name, value]) => `${name}: ${value};`).join(' ')
      await page.setContent(`<style>${stylesheet} :root { ${variables} }</style>${container.innerHTML}`)
      const measured = await page.evaluate(() => {
        const reference = document.createElement('span')
        document.body.append(reference)
        reference.style.color = 'var(--fg-3)'
        const placeholderColor = getComputedStyle(reference).color
        reference.style.color = 'var(--fg-1)'
        const valueColor = getComputedStyle(reference).color
        const triggers = [...document.querySelectorAll('button')].map((button) => ({
          color: getComputedStyle(button.querySelector('span')!).color,
          radius: getComputedStyle(button).borderRadius,
        }))
        return { placeholderColor, valueColor, triggers }
      })
      expect(measured.placeholderColor).not.toBe(measured.valueColor)
      expect(measured.triggers.map((trigger) => trigger.color)).toEqual([
        measured.placeholderColor, measured.placeholderColor, measured.valueColor,
      ])
      expect(measured.triggers.map((trigger) => trigger.radius)).toEqual(['12px', '12px', '12px'])
    } finally { await page.close() }
  })

  async function openPaintPage(markup: string, mode: 'dark' | 'light', options: { hasTouch?: boolean; reducedMotion?: 'reduce' | 'no-preference' } = {}) {
    const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}: ${value};`).join(' ')
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: options.hasTouch ?? false, reducedMotion: options.reducedMotion ?? 'no-preference' })
    await page.setContent(`<!doctype html><style>${stylesheet} :root { ${variables} color-scheme: ${mode}; } body { margin: 0; padding: 24px; background: var(--bg); }</style>${markup}`)
    const tokens = await page.evaluate(() => {
      const probe = document.createElement('span')
      document.body.append(probe)
      const paint = (name: string) => { probe.style.backgroundColor = `var(${name})`; return getComputedStyle(probe).backgroundColor }
      const resolved = { canvas: paint('--bg'), field: paint('--bg-field'), opaqueHover: paint('--bg-hover-opaque'), hover: paint('--bg-hover'), border: paint('--border-control'), primary: paint('--primary') }
      probe.remove()
      return resolved
    })
    return { page, tokens }
  }

  function readTriggerPaint(button: Element) {
    const fill = button.querySelector('[data-press-fill]')!
    const fillStyle = getComputedStyle(fill)
    const style = getComputedStyle(button)
    const perimeter = getComputedStyle(button, '::after')
    const rings = [...perimeter.boxShadow.matchAll(/(rgba?\([^)]+\)) 0px 0px 0px ([\d.]+)px inset/g)]
      .filter((match) => Number(match[2]) > 0 && !/rgba\([^)]*, 0\)$/.test(match[1]!))
      .map((match) => ({ color: match[1]!, width: Number(match[2]) }))
    return {
      field: style.backgroundColor,
      fill: fillStyle.display === 'none' ? 'none' : fillStyle.backgroundColor,
      fillDuration: Number.parseFloat(fillStyle.transitionDuration),
      rings,
      outline: { style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor },
      layers: { isolation: style.isolation, position: style.position, fillPosition: fillStyle.position, fillZ: fillStyle.zIndex, ringPosition: perimeter.position, ringZ: perimeter.zIndex },
    }
  }

  it.each(['dark', 'light'] as const)('layers the opaque hover fill under the control border on a fine pointer hover and press in %s mode', async (mode) => {
    const { container } = render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    const { page, tokens } = await openPaintPage(container.innerHTML, mode)
    try {
      const trigger = page.getByRole('button')
      const rest = await trigger.evaluate(readTriggerPaint)
      expect(rest.layers).toEqual({ isolation: 'isolate', position: 'relative', fillPosition: 'absolute', fillZ: '-10', ringPosition: 'absolute', ringZ: 'auto' })
      expect(rest.field).toBe(tokens.field)
      expect(rest.fill).toBe('rgba(0, 0, 0, 0)')
      expect(rest.rings).toEqual([{ color: tokens.border, width: 1 }])
      await trigger.hover()
      await trigger.evaluate(settleAnimations)
      const hovered = await trigger.evaluate(readTriggerPaint)
      expect(hovered.fill).toBe(tokens.opaqueHover)
      expect(hovered.field).toBe(rest.field)
      expect(hovered.rings).toEqual(rest.rings)
      expect(rest.fillDuration).toBeCloseTo(0.24)
      expect(controlContrast(tokens.border, hovered.fill, [tokens.canvas, rest.field]).step).toBeGreaterThanOrEqual(1.25)
      await page.mouse.down()
      await trigger.evaluate(settleAnimations)
      const pressed = await trigger.evaluate(readTriggerPaint)
      expect(pressed.fill).toBe(tokens.opaqueHover)
      expect(pressed.rings).toEqual(rest.rings)
      await page.mouse.move(0, 0)
      await page.mouse.up()
      await trigger.evaluate(settleAnimations)
      expect((await trigger.evaluate(readTriggerPaint)).fill).toBe('rgba(0, 0, 0, 0)')
      await trigger.blur()
      await page.keyboard.press('Shift')
      await trigger.focus()
      expect(await trigger.evaluate((button) => button.matches(':focus-visible'))).toBe(true)
      const focused = await trigger.evaluate(readTriggerPaint)
      expect(focused.outline).toEqual({ style: 'solid', width: '2px', offset: '-2px', color: tokens.primary })
      expect(focused.rings).toEqual([])
    } finally { await page.close() }
  })

  it.each(['dark', 'light'] as const)('paints every date picker press fill on a touch pointer without latching hover in %s mode', async (mode) => {
    const { container } = render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    const triggerPage = await openPaintPage(container.innerHTML, mode, { hasTouch: true })
    try {
      const { page, tokens } = triggerPage
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)
      const trigger = page.getByRole('button')
      await trigger.hover()
      expect((await trigger.evaluate(readTriggerPaint)).fill).toBe('rgba(0, 0, 0, 0)')
      await page.mouse.down()
      await trigger.evaluate(settleAnimations)
      const pressed = await trigger.evaluate(readTriggerPaint)
      expect(pressed.fill).toBe(tokens.opaqueHover)
      expect(pressed.rings).toEqual([{ color: tokens.border, width: 1 }])
      await page.mouse.move(0, 0)
      await page.mouse.up()
    } finally { await triggerPage.page.close() }

    fireEvent.click(screen.getByRole('button'))
    const dialog = await screen.findByRole('dialog')
    const { page, tokens } = await openPaintPage(dialog.outerHTML, mode, { hasTouch: true })
    try {
      await page.locator('.orbit-sheet-panel').evaluate(settleAnimations)
      const controls = [page.locator('button[data-day="2025-06-10"]'), page.locator('button[data-day="2025-06-15"]'),
        ...['common.previousMonth', 'common.selectYear', 'common.nextMonth'].map((label) => page.getByRole('button', { name: label, exact: true }))]
      for (const control of controls) {
        const resting = await control.evaluate((button) => getComputedStyle(button).backgroundColor)
        expect(resting).toBe('rgba(0, 0, 0, 0)')
        await control.hover()
        expect(await control.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(resting)
        await page.mouse.down()
        await control.evaluate(settleAnimations)
        expect(await control.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(tokens.hover)
        await page.mouse.move(0, 0)
        await page.mouse.up()
        await control.evaluate(settleAnimations)
        expect(await control.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(resting)
      }
    } finally { await page.close() }
  })

  it('keeps the trigger fill off a disabled trigger and shows it without delay under reduced motion', async () => {
    const { container } = render(<>
      <DateField value="2025-06-15" disabled onChange={vi.fn()} />
      <fieldset disabled><DateField value="2025-06-15" onChange={vi.fn()} /></fieldset>
      <DateField value="2025-06-15" onChange={vi.fn()} />
    </>)
    const { page, tokens } = await openPaintPage(container.innerHTML, 'dark', { reducedMotion: 'reduce' })
    try {
      const triggers = page.locator('button[aria-haspopup="dialog"]')
      for (const index of [0, 1]) {
        const trigger = triggers.nth(index)
        expect(await trigger.isDisabled()).toBe(true)
        await trigger.hover({ force: true })
        await page.mouse.down()
        expect((await trigger.evaluate(readTriggerPaint)).fill).toBe('none')
        await page.mouse.move(0, 0)
        await page.mouse.up()
      }
      const enabled = triggers.nth(2)
      await enabled.hover()
      await enabled.evaluate(settleAnimations)
      const hovered = await enabled.evaluate(readTriggerPaint)
      expect(hovered.fillDuration).toBeLessThanOrEqual(0.001)
      expect(hovered.fill).toBe(tokens.opaqueHover)
    } finally { await page.close() }
  })

  it.each([{ left: 28, right: 64 }, { left: 64, right: 28 }])('keeps seven 44px date targets after $left/$right side insets', async ({ left, right }) => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const dialog = await screen.findByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
    try {
      const session = await page.context().newCDPSession(page)
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left, right } })
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await page.locator('.orbit-sheet-panel').evaluate(settleAnimations)
      const geometry = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const style = getComputedStyle(body)
        const bounds = body.getBoundingClientRect()
        const panel = body.closest('[role="dialog"]')!.getBoundingClientRect()
        return { paddingLeft: bounds.left - panel.left + parseFloat(style.paddingLeft), paddingRight: panel.right - bounds.right + parseFloat(style.paddingRight),
          targets: [...body.querySelectorAll('button[data-day]')].map(button => {
            const bounds = button.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right, width: bounds.width,
              hit: button.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)) }
          }) }
      })
      expect(geometry.paddingLeft).toBe(left + 4)
      expect(geometry.paddingRight).toBe(right + 4)
      expect(geometry.targets).toHaveLength(42)
      for (const target of geometry.targets) {
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.left).toBeGreaterThanOrEqual(left + 4)
        expect(target.right).toBeLessThanOrEqual(412 - right - 4)
        expect(target.hit).toBe(true)
      }
    } finally { await page.close() }
  })

  it.each([...BODY_INSETS_BY_WIDTH.keys()])('keeps all seven 44px columns inside the body at %ipx', async (width) => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const dialog = await screen.findByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await loadAppFonts(page)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 915 })
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }))
      await page.locator('.orbit-sheet-panel').evaluate(settleAnimations)
      const measured = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const bounds = body.getBoundingClientRect()
        const style = getComputedStyle(body)
        return {
          left: bounds.left + parseFloat(style.paddingLeft),
          right: bounds.right - parseFloat(style.paddingRight),
          padding: parseFloat(style.paddingLeft),
          rightPadding: parseFloat(style.paddingRight),
          bottomPadding: parseFloat(style.paddingBottom),
          clientWidth: body.clientWidth,
          scrollWidth: body.scrollWidth,
          targets: [...document.querySelectorAll<HTMLButtonElement>('button[data-day]')].map((button) => {
            const target = button.getBoundingClientRect()
            const hit = document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2)
            return { left: target.left, right: target.right, width: target.width, height: target.height, reachable: button.contains(hit) }
          }),
        }
      })
      expect(measured.targets).toHaveLength(42)
      expect(measured.scrollWidth).toBe(measured.clientWidth)
      expect(measured.bottomPadding).toBe(24)
      expect([24, 16, 12, 8, 4]).toContain(measured.padding)
      expect(measured.padding).toBe(BODY_INSETS_BY_WIDTH.get(width))
      expect(measured.rightPadding).toBe(measured.padding)
      for (const target of measured.targets) {
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.height).toBeGreaterThanOrEqual(44)
        expect(target.left).toBeGreaterThanOrEqual(measured.left - 0.01)
        expect(target.right).toBeLessThanOrEqual(measured.right + 0.01)
        expect(target.reachable).toBe(true)
      }
      if (width >= 356) expect(measured.padding).toBe(24)
    } finally { await page.close() }
  })


  it.each([320, 412])('has one year scroll owner in a %ipx tall viewport', async (height) => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    const dialog = await screen.findByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 640, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await loadAppFonts(page)
      const years = buildYearRange(2025)
      await page.locator('.orbit-sheet-panel').evaluate(settleAnimations)
      const measured = await page.evaluate((years) => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const owners = [body, ...body.querySelectorAll<HTMLElement>('*')].filter((element) =>
          ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
        )
        const selected = [...body.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((button) => button.textContent === '2025')!
        const scroller = selected.parentElement!.parentElement!
        const rect = scroller.getBoundingClientRect()
        const bodyRect = body.getBoundingClientRect()
        const targets = years.map((year) => {
          const button = [...body.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((button) => button.textContent === String(year))!
          const bounds = button.getBoundingClientRect()
          return { width: bounds.width, height: bounds.height, top: bounds.top }
        })
        const reachable = [2025, years[0]!, years.at(-1)!].map((year) => {
          const button = [...body.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((button) => button.textContent === String(year))!
          button.scrollIntoView({ block: 'center', behavior: 'instant' })
          const bounds = button.getBoundingClientRect()
          const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
          return bounds.top >= rect.top && bounds.bottom <= rect.bottom && button.contains(hit)
        })
        return { owners: owners.length, contained: rect.top >= bodyRect.top && rect.bottom <= bodyRect.bottom, viewportHeight: rect.height, targets, reachable }
      }, years)
      expect(measured.owners).toBe(1)
      expect(measured.contained).toBe(true)
      expect(measured.viewportHeight).toBeGreaterThanOrEqual(48)
      expect(measured.targets).toHaveLength(years.length)
      expect(measured.targets[3]!.top - measured.targets[0]!.top).toBe(52)
      expect(measured.targets.every((target) => target.height === 48 && target.width >= 48)).toBe(true)
      expect(measured.reachable).toEqual([true, true, true])
    } finally { await page.close() }
  })

  it('keeps ordinary sheet content on the canonical 24px inset in a narrow window', async () => {
    render(<Sheet title="Title"><p>Short content</p></Sheet>)
    const dialog = await screen.findByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await loadAppFonts(page)
      await page.locator('.orbit-sheet-panel').evaluate(settleAnimations)
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-slot="sheet-body"]')!).paddingLeft)).toBe('24px')
    } finally { await page.close() }
  })
})
