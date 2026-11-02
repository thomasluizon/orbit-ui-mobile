import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ShellWide } from '@/components/shell/shell-wide'
import { FlowShell } from '@/components/shell/flow-shell'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { clearPendingNotificationDeletes, queuePendingNotificationDelete } from '@/lib/pending-notification-deletes'
import { measureToastStack } from '@/e2e/layout/toast-stack-geometry'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { Toast } from '@/components/ui/toast'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('shared toast geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 1352].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    (['destination', 'flow'] as const).map(shell => ({ width, locale, shell })),
  )))('separates queued deletes without moving one notice at $width in $locale $shell', async ({ width, locale, shell }) => {
    const words = locale === 'en' ? en : ptBR
    const notice = <><UpdateAvailableBanner inset={false} /><NotificationDeleteNotice /></>
    const view = render(<NextIntlClientProvider locale={locale} messages={words} timeZone="UTC">
      {shell === 'flow' ? <FlowShell notice={notice}>Form</FlowShell> :
        <ShellWide items={[]} activeId="hoje" navLabel={words.nav.mainNavigation}
          astraRow={{ label: 'Astra', onOpen: () => {} }} notice={notice}>Notifications</ShellWide>}
    </NextIntlClientProvider>)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 1200 } })
    try {
      let singleHeight = 0
      for (const count of [1, 2, 3]) {
        act(() => { queuePendingNotificationDelete(`stack-${count}`, () => {}) })
        await act(async () => { await vi.dynamicImportSettled() })
        await page.setContent(`<html class="dark"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
        await loadAppFonts(page)
        const measured = await page.locator('[data-shell-notice-content]').evaluate(measureToastStack)
        expect(measured).toHaveLength(count)
        expect(measured[0]!.topInset).toBe(0)
        expect(measured.at(-1)!.bottomInset).toBe(0)
        if (count === 1) singleHeight = measured[0]!.height
        for (const [index, toast] of measured.entries()) {
          expect(toast.height).toBe(singleHeight)
          if (index) expect(toast.gap).toBe(12)
          expect(toast.actionOffset).not.toBeNull()
          expect(Math.abs(toast.actionOffset!)).toBeLessThanOrEqual(1)
          expect(Math.abs(toast.closeOffset)).toBeLessThanOrEqual(1)
        }
      }
    } finally { view.unmount(); clearPendingNotificationDeletes(); await page.close() }
  })

  it.each([412, 1352])('separates a failed delete, pending delete and update banner at %ipx', async (width) => {
    vi.useFakeTimers()
    queuePendingNotificationDelete('failed-stack', () => { throw new Error('Delete failed') })
    vi.advanceTimersByTime(5000)
    vi.useRealTimers()
    queuePendingNotificationDelete('pending-stack', () => {})
    useVersionGateStore.setState({ upgradeRequired: true, updateDismissed: false })
    const view = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <ShellWide nav={false} notice={<><UpdateAvailableBanner inset={false} /><NotificationDeleteNotice /></>} />
    </NextIntlClientProvider>)
    await act(async () => { await vi.dynamicImportSettled() })
    const markup = view.container.innerHTML
    view.unmount()
    clearPendingNotificationDeletes()
    useVersionGateStore.setState({ upgradeRequired: false, updateDismissed: false })
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 1200 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${markup}`)
      await loadAppFonts(page)
      const slot = page.locator('[data-shell-notice-content]')
      const measured = await slot.evaluate(measureToastStack)
      expect(measured).toHaveLength(2)
      expect(measured[1]!.gap).toBe(12)
      expect(await slot.evaluate(element => {
        const banner = element.querySelector('[data-update-banner]')!.getBoundingClientRect()
        const toast = element.querySelector('[data-kind]')!.getBoundingClientRect()
        return toast.top - banner.bottom
      })).toBe(12)
    } finally { await page.close() }
  })

  it('centres a sheet-hosted action without changing its outlined placement', async () => {
    useUIStore.setState({ openOverlayIds: ['modal:toast-stack'] })
    useAppToastStore.getState().showQueued(ptBR.notifications.deleteQueued, ptBR.notifications.deleteUndo, () => {})
    const view = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <div data-sheet-toast=""><AppToastHost placement="modal" modalId="modal:toast-stack" /></div>
    </NextIntlClientProvider>)
    await act(async () => { await vi.dynamicImportSettled() })
    const markup = view.container.innerHTML
    view.unmount()
    useAppToastStore.setState({ currentToast: null, queue: [] })
    useUIStore.setState({ openOverlayIds: [] })
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${markup}`)
      await loadAppFonts(page)
      const measured = await page.locator('[data-sheet-toast]').evaluate(measureToastStack)
      expect(measured).toHaveLength(1)
      expect(Math.abs(measured[0]!.actionOffset!)).toBeLessThanOrEqual(1)
      expect(Math.abs(measured[0]!.closeOffset)).toBeLessThanOrEqual(1)
      expect(await page.locator('[data-kind]').evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none')
    } finally { await page.close() }
  })

  it('keeps page controls outside the toast frame reachable', async () => {
    useAppToastStore.getState().showInfo(en.toast.errors.notFound)
    const view = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <button data-page-control style={{ position: 'fixed', left: 16, bottom: 16, width: 48, height: 48 }}>{en.common.retry}</button>
      <AppToastHost placement="page" />
    </NextIntlClientProvider>)
    await act(async () => { await vi.dynamicImportSettled() })
    const markup = view.container.innerHTML
    view.unmount()
    useAppToastStore.setState({ currentToast: null, queue: [] })
    const page = await browser.newPage({ viewport: { width: 844, height: 400 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${markup}`)
      expect(await page.locator('[data-kind]').count()).toBe(1)
      const reachable = await page.locator('[data-page-control]').evaluate(control => {
        const bounds = control.getBoundingClientRect()
        return control.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2))
      })
      expect(reachable).toBe(true)
    } finally { await page.close() }
  })

  it.each([320, 360, 384, 412, 1352].flatMap(width => (['dark', 'light'] as const).flatMap(mode =>
    (['en', 'pt-BR'] as const).map(locale => ({ width, mode, locale })),
  )))('keeps every variant closeable and inside one frame at $width in $locale $mode', async ({ width, mode, locale }) => {
    const words = locale === 'en' ? en : ptBR
    const message = words.toast.errors.notFound
    const view = render(<NextIntlClientProvider locale={locale} messages={words} timeZone="UTC">
      <ShellWide items={[]} activeId="hoje" navLabel={words.nav.mainNavigation}
        astraRow={{ label: 'Astra', onOpen: () => {} }} notice={<>
        <Toast kind="neutral" message={message} />
        <Toast kind="neutral" message={message} actionLabel={words.notifications.deleteUndo} onAction={() => {}} />
        <Toast kind="neutral" message={message} actionLabel={words.common.retry} actionIcon="refresh" onAction={() => {}} />
        <Toast kind="working" message={message} />
        <Toast kind="done" message={message} onDone={() => {}} />
        <Toast kind="lost" message={message} detail={words.common.syncChangeDroppedDetail} actionLabel={words.common.retry} onAction={() => {}} />
        <Toast outlined kind="neutral" message={message} />
      </>}>
        <div className="px-4"><div data-toast-column-reference="" /></div>
      </ShellWide>
    </NextIntlClientProvider>)
    const markup = view.container.innerHTML
    view.unmount()
    const page = await browser.newPage({ viewport: { width, height: 1200 } })
    try {
      await page.setContent(`<html class="${mode}"><style>${stylesheet}</style><body>${markup}</body></html>`)
      await loadAppFonts(page)
      const measurements = await page.locator('[data-kind]').evaluateAll((surfaces, closeLabel) => surfaces.map(surface => {
        const bounds = surface.getBoundingClientRect()
        const column = document.querySelector('[data-toast-column-reference]')!.getBoundingClientRect()
        const style = getComputedStyle(surface)
        const message = surface.querySelector<HTMLElement>('[data-toast-message]')!
        const type = getComputedStyle(message)
        const close = surface.querySelector<HTMLButtonElement>(`button[aria-label="${closeLabel}"]`)
        const target = close?.getBoundingClientRect()
        const hitPadding = close ? -parseFloat(getComputedStyle(close, '::after').left) : 0
        const controls = [...surface.querySelectorAll('button')].map(button => button.getBoundingClientRect())
        return {
          width: bounds.width, left: bounds.left, right: bounds.right,
          columnWidth: column.width, columnLeft: column.left, columnRight: column.right,
          padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
          radius: style.borderRadius, columnGap: style.columnGap,
          fontSize: type.fontSize, lineHeight: type.lineHeight, fontWeight: type.fontWeight,
          closeName: close?.getAttribute('aria-label'), closeWidth: (target?.width ?? 0) + hitPadding * 2,
          closeHeight: (target?.height ?? 0) + hitPadding * 2,
          fits: controls.every(control => control.left >= bounds.left && control.right <= bounds.right),
          copyFits: message.scrollWidth <= message.clientWidth,
        }
      }), words.common.close)
      expect(measurements).toHaveLength(7)
      for (const measured of measurements) {
        expect(measured).toMatchObject({
          width: measured.columnWidth, left: measured.columnLeft, right: measured.columnRight,
          padding: ['16px', '16px', '16px', '16px'], radius: '20px', columnGap: '12px',
          fontSize: '14px', lineHeight: '20px', fontWeight: '500',
          closeName: words.common.close, closeWidth: 48, closeHeight: 48, fits: true, copyFits: true,
        })
      }
    } finally { await page.close() }
  })
})
