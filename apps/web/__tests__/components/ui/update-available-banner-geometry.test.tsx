import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { ShellWide } from '@/components/shell/shell-wide'
import { Sheet } from '@/components/ui/sheet'
import { useDesktopUpdateStore } from '@/stores/desktop-update-store'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const mocks = vi.hoisted(() => ({ translate: (key: string, _values?: Record<string, string>) => key }))
vi.mock('next-intl', async (importOriginal) => ({
  ...await importOriginal<typeof import('next-intl')>(),
  useTranslations: () => mocks.translate,
}))

describe('Update notice geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['appUpdated', 'accountChanged', 'upgrade'] as const)('keeps the sheet $reason notice inside its safe content gutters', async (reason) => {
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    useDesktopUpdateStore.setState({ notice: null, restart: null, later: null })
    const view = render(<Sheet title="Options"><p>Content</p></Sheet>)
    await act(async () => {})
    act(() => {
      if (reason === 'upgrade') useVersionGateStore.getState().markUpgradeRequired('1.5.0')
      else useVersionGateStore.getState().requireReload(reason)
    })
    const dialog = document.querySelector('[role="dialog"]')!
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
    try {
      const session = await page.context().newCDPSession(page)
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 28, right: 64 } })
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      const geometry = await page.locator('[data-update-banner]').evaluate(host => {
        const style = getComputedStyle(host)
        const panel = host.closest('[role="dialog"]')!.getBoundingClientRect()
        const surface = host.firstElementChild!.getBoundingClientRect()
        return { left: surface.left - panel.left, right: panel.right - surface.right,
          paddingLeft: parseFloat(style.paddingLeft), paddingRight: parseFloat(style.paddingRight) }
      })
      expect(geometry).toEqual({ left: 28 + 24, right: 64 + 24, paddingLeft: 28 + 24, paddingRight: 64 + 24 })
    } finally { await page.close(); view.unmount() }
  })

  it.each([393, 1280].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    (['appUpdated', 'accountChanged', 'upgrade', 'desktopWeb', 'desktopShell', 'desktopDownloading', 'desktopFailed'] as const).flatMap(reason => [true, false].map(shell => ({ width, locale, reason, shell }))),
  )))('$reason is rounded and inset at $width in $locale (shell: $shell)', async ({ width, locale, reason, shell }) => {
    const messages = locale === 'en' ? en : ptBR
    const translate = createTranslator({ locale, messages })
    mocks.translate = (key, values) => translate(key as Parameters<typeof translate>[0], values)
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    useDesktopUpdateStore.setState({ notice: null, restart: null, later: null })
    const view = render(shell
      ? <ShellWide nav={false} notice={<UpdateAvailableBanner inset={false} />}><h1>Orbit</h1></ShellWide>
      : <div data-update-notice-host=""><UpdateAvailableBanner /></div>)
    await act(async () => {})
    act(() => {
      if (reason === 'desktopWeb' || reason === 'desktopShell' || reason === 'desktopDownloading' || reason === 'desktopFailed') {
        useDesktopUpdateStore.setState({ notice: {
          kind: reason === 'desktopWeb' ? 'web' : 'shell',
          phase: reason === 'desktopDownloading' ? 'downloading' : reason === 'desktopFailed' ? 'failed' : 'available',
        } })
      } else if (reason === 'upgrade') useVersionGateStore.getState().markUpgradeRequired('1.5.0')
      else useVersionGateStore.getState().requireReload(reason)
    })
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.locator('[data-update-banner] > div').evaluate(surface => {
        const bounds = surface.getBoundingClientRect()
        const host = surface.closest<HTMLElement>('[data-shell-notice], [data-update-notice-host]')!
        const column = host.getBoundingClientRect()
        const style = getComputedStyle(surface)
        const paragraph = surface.querySelector('p')!
        const text = paragraph.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(paragraph)
        const fragments = [...range.getClientRects()].filter(rect => rect.width > 0)
        const buttons = [...surface.querySelectorAll('button')].map(button => button.getBoundingClientRect())
        return {
          radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius],
          start: bounds.left - column.left, end: column.left + host.clientWidth - bounds.right,
          lines: new Set(fragments.map(rect => Math.round(rect.top))).size,
          textFits: fragments.every(rect => rect.left >= text.left - 1 && rect.right <= text.right + 1),
          actionEnd: bounds.right - buttons.at(-1)!.right,
          actionsFit: buttons.every(button => button.left >= bounds.left && button.right <= bounds.right),
        }
      })
      expect.soft(geometry.radii).toEqual(['20px', '20px', '20px', '20px'])
      expect.soft(geometry.start).toBe(16)
      expect.soft(geometry.end).toBe(16)
      expect.soft(geometry.actionEnd).toBe(16)
      expect.soft(geometry.actionsFit).toBe(true)
      expect.soft(geometry.textFits).toBe(true)
      if (reason !== 'upgrade') expect.soft(geometry.lines).toBeLessThanOrEqual(2)
    } finally { await page.close(); view.unmount() }
  })
})
