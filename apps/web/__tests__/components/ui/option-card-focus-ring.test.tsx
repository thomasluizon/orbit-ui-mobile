import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { OptionCard } from '@/components/ui/option-card'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { compileAppStylesheet } from '@/__tests__/support/flow-layout'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

describe('option card rings under keyboard focus in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => cleanup())
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['dark', 'light'] as const)('keeps the selected ring directly inside the focus ring in %s, and shows focus alone on an option that is not selected', async (mode) => {
    const view = render(<div data-option-group="" className="grid grid-cols-2 gap-3">
      <OptionCard label="Saúde" selected onSelect={vi.fn()} />
      <OptionCard label="Casa" onSelect={vi.fn()} />
      <span data-probe="focus" style={{ color: 'var(--fg-1)' }} />
      <span data-probe="selected" style={{ color: 'var(--primary)' }} />
    </div>)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 360, height: 640 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="${mode}" style="${theme}"><style>${stylesheet}</style><body>${document.body.innerHTML}</body></html>`)
      const read = () => page.evaluate(() => {
        const colour = (probe: string) => getComputedStyle(document.querySelector(`[data-probe="${probe}"]`)!).color
        const cards = [...document.querySelectorAll<HTMLElement>('[data-option-card]')]
        return {
          focus: colour('focus'), selected: colour('selected'),
          cards: cards.map((card) => ({ shadow: getComputedStyle(card).boxShadow, focused: card.matches(':focus-visible') })),
        }
      })
      const rest = await read()
      expect(rest.cards[0]!.shadow).toBe(`${rest.selected} 0px 0px 0px 2px inset`)
      expect(rest.cards[1]!.shadow).toBe('none')

      await page.keyboard.press('Tab')
      const onSelected = await read()
      expect(onSelected.cards[0]!.focused).toBe(true)
      expect(onSelected.cards[0]!.shadow).toBe(`${onSelected.focus} 0px 0px 0px 2px inset, ${onSelected.selected} 0px 0px 0px 4px inset`)

      await page.keyboard.press('Tab')
      const onPlain = await read()
      expect(onPlain.cards[1]!.focused).toBe(true)
      expect(onPlain.cards[1]!.shadow).toBe(`${onPlain.focus} 0px 0px 0px 2px inset`)
      expect(onPlain.cards[0]!.shadow).toBe(`${onPlain.selected} 0px 0px 0px 2px inset`)
    } finally { await page.close(); view.unmount() }
  }, 30_000)
})
