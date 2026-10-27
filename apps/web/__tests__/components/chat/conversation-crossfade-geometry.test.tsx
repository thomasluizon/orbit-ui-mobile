import { act, cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { motionDurations } from '@orbit/shared/theme'
import { ConversationCrossfade } from '@/components/chat/conversation-motion'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => preference.reduced }))

describe('conversation refresh geometry during the outgoing fade', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 1352].flatMap(width => [false, true].map(growing => ({ width, growing }))))('keeps the outgoing paint before the next item at $width, growing $growing', async ({ width, growing }) => {
    preference.reduced = false
    vi.useFakeTimers()
    const content = (revision: string, height: number) => <div style={{ display: 'grid', gap: 16 }}>
      <ConversationCrossfade changeKey={revision}><div data-testid={revision} style={{ height }}>{revision}</div></ConversationCrossfade>
      <div data-testid="next" style={{ height: 48 }}>Next message</div>
    </div>
    const { container, rerender } = render(content('previous', growing ? 48 : 240))
    rerender(content('current', growing ? 240 : 48))
    act(() => { vi.advanceTimersByTime(motionDurations.micro / 2) })
    expect(container.querySelector('[inert]')).toHaveTextContent('previous')
    const markup = container.innerHTML
    act(() => { vi.advanceTimersByTime(motionDurations.micro / 2) })
    expect(container.querySelector('[inert]')).toBeNull()
    vi.useRealTimers()
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div style="max-width:740px;margin-inline:auto">${markup}</div>`)
      const bounds = await page.evaluate(() => {
        const departing = document.querySelector<HTMLElement>('[inert]')!
        const snapshot = departing.querySelector<HTMLElement>('[data-testid="previous"]')!.getBoundingClientRect()
        const overlay = departing.getBoundingClientRect()
        const current = document.querySelector<HTMLElement>('[data-testid="current"]')!.getBoundingClientRect()
        const next = document.querySelector<HTMLElement>('[data-testid="next"]')!.getBoundingClientRect()
        const clipped = ['hidden', 'clip'].includes(getComputedStyle(departing).overflowY)
        return { paintedBottom: clipped ? Math.min(snapshot.bottom, overlay.bottom) : snapshot.bottom, overlayBottom: overlay.bottom, currentBottom: current.bottom, nextTop: next.top }
      })
      expect(bounds.paintedBottom).toBeLessThanOrEqual(bounds.currentBottom)
      expect(bounds.overlayBottom).toBe(bounds.currentBottom)
      expect(bounds.nextTop - bounds.currentBottom).toBe(16)
      expect(bounds.paintedBottom).toBeLessThan(bounds.nextTop)
    } finally { await page.close() }
  })
})
