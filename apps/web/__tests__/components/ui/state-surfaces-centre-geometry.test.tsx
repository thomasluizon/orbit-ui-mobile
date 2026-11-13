import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { EmptyState } from '@/components/ui/empty-state'
import { FailureScreen } from '@/components/ui/failure-screen'
import NotFound from '@/app/not-found'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'
import { PillButton } from '@/components/ui/pill-button'
import { ThrottleScreen } from '@/components/ui/throttle-screen'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { DESTINATION_MAIN_CLASS_NAME } from '@/components/shell/destination-shell'
import { useThrottleStore } from '@/stores/throttle-store'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))

const HEADER_HEIGHT = 60
const TAB_BAR_HEIGHT = 80

function throttled() {
  return { data: { status: 429, retryAfterUtc: new Date(Date.now() + 60_000).toISOString() } }
}

/** A surface inside the compact shell owns the region between the shell header and the tab bar. */
function InShell({ children }: Readonly<{ children: ReactElement }>) {
  return <div className="flex h-dvh flex-col" style={{ ['--shell-scroller-end' as string]: '0px' }}>
    <div data-free-top="" style={{ height: HEADER_HEIGHT, flexShrink: 0 }} />
    <div data-shell-scroller="" className="flex min-h-0 flex-1 flex-col overflow-y-auto"><div className={DESTINATION_MAIN_CLASS_NAME}>{children}</div></div>
    <nav data-free-bottom="" style={{ height: TAB_BAR_HEIGHT, flexShrink: 0 }} />
  </div>
}

const surfaces: { name: string; block: string; element: () => ReactElement }[] = [
  { name: 'empty', block: '[data-empty-state]', element: () => <InShell><ShellCentredRegion><EmptyState title={ptBr.goals.empty} action={<PillButton>{ptBr.goals.create}</PillButton>} /></ShellCentredRegion></InShell> },
  { name: 'error', block: '.error-surface', element: () => <InShell><FailureScreen error={new Error('boom')} retry={vi.fn()} /></InShell> },
  { name: 'failure', block: '.error-surface', element: () => <main className="flex min-h-dvh flex-col pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)]"><FailureScreen error={new Error('boom')} retry={vi.fn()} /></main> },
  { name: 'offline', block: '[data-empty-state]', element: () => <InShell><ChatEmptyState mascotState="descansando" browseAction={<PillButton variant="ghost">{ptBr.common.create}</PillButton>} /></InShell> },
  { name: 'not found', block: '.error-surface', element: () => <NotFound /> },
  { name: 'throttle', block: '.error-surface', element: () => <ThrottleScreen /> },
]

const cases = surfaces.flatMap((surface) => [320, 360, 384, 412].map((width) => ({ ...surface, width })))

describe('state surface centring in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    if (!('showModal' in HTMLDialogElement.prototype)) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  })
  afterEach(() => { cleanup(); useThrottleStore.getState().clear(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres the $name block within 1px of its free area at $width px', async ({ name, block, element, width }) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1] ?? Infinity), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    if (name === 'throttle') useThrottleStore.getState().show(429, throttled().data)
    const view = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr} timeZone="UTC">{element()}</NextIntlClientProvider>)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
      const geometry = await page.evaluate((selector) => {
        const dialog = document.querySelector('dialog')
        if (dialog && !dialog.open) dialog.showModal()
        const top = document.querySelector('[data-free-top]')?.getBoundingClientRect().bottom ?? 0
        const bottom = document.querySelector('[data-free-bottom]')?.getBoundingClientRect().top ?? window.innerHeight
        const owner = document.querySelector(selector)!
        const parts = owner.matches('.error-surface') ? [...owner.children].map((child) => child.getBoundingClientRect()) : [owner.getBoundingClientRect()]
        return { free: { top, bottom }, block: { top: Math.min(...parts.map((part) => part.top)), bottom: Math.max(...parts.map((part) => part.bottom)) } }
      }, block)
      const freeCentre = (geometry.free.top + geometry.free.bottom) / 2
      const blockCentre = (geometry.block.top + geometry.block.bottom) / 2
      expect(Math.abs(blockCentre - freeCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    } finally { await page.close(); view.unmount() }
  })
})
