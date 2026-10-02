import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ActionRow } from '@/components/ui/action-row'
import { PillButton } from '@/components/ui/pill-button'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('ActionRow (web)', () => {
  it.each([false, true])('keeps intrinsic actions trailing with inline=%s', (inline) => {
    render(<ActionRow><button type="button">Cancel</button><button type="button">Confirm</button></ActionRow>)
    const pair = screen.getByRole('button', { name: 'Confirm' }).parentElement!

    expect(pair).toHaveAttribute('data-slot', 'action-row')
    expect(pair.style.flexDirection).toBe('row')
    expect(pair.style.justifyContent).toBe('flex-end')
    expect(pair.style.alignItems).toBe('center')
    expect(pair.style.maxWidth).toBe('100%')
    expect(pair.style.width).toBe('100%')
    expect(pair.style.marginInline).toBe('')
  })

  describe('footer bounds in Chromium', () => {
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    let stylesheet: string

    registerChromeLaunchHook(beforeAll, async (launch) => {
      browserLaunch = launch
      browser = await browserLaunch
    })

    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
      stylesheet = compiled.css
    })

    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    it.each([en, ptBR].flatMap((catalog) => [240, 320, 412, 740, 1352].flatMap((width) => [false, true].map((inline) => ({ catalog, width, inline })))))('keeps import actions within a $width px footer with inline=$inline', async ({ catalog, width, inline }) => {
      const { container } = render(
        <footer className="orbit-sheet-actions" style={{ width }}>
          <ActionRow>
            <PillButton size="sm" variant="ghost">{catalog.onboarding.wizard.importNotNow}</PillButton>
            <PillButton size="sm">{catalog.onboarding.wizard.importButton}</PillButton>
          </ActionRow>
        </footer>,
      )
      const page = await browser.newPage()
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const measured = await page.evaluate(() => {
          const footer = document.querySelector('footer')!
          const bounds = footer.getBoundingClientRect()
          const styles = getComputedStyle(footer)
          const left = bounds.left + Number.parseFloat(styles.paddingLeft)
          const right = bounds.right - Number.parseFloat(styles.paddingRight)
          const buttons = [...footer.querySelectorAll('button')].map((button) => {
            const action = button.getBoundingClientRect()
            return { left: action.left, right: action.right, height: action.height, width: action.width, top: action.top }
          })
          return { left, right, buttons }
        })
        for (const button of measured.buttons) {
          expect(button.left).toBeGreaterThanOrEqual(measured.left)
          expect(button.right).toBeLessThanOrEqual(measured.right)
          expect(button.height).toBeGreaterThanOrEqual(44)
          expect(button.width).toBeLessThan(measured.right - measured.left)
        }
        expect(measured.buttons.at(-1)!.right).toBeCloseTo(measured.right, 1)
        expect(measured.buttons[0]!.height).toBe(measured.buttons[1]!.height)
        if (measured.buttons[0]!.width + measured.buttons[1]!.width + 12 <= measured.right - measured.left) {
          expect(measured.buttons[0]!.top).toBe(measured.buttons[1]!.top)
          expect(measured.buttons[1]!.left - measured.buttons[0]!.right).toBeCloseTo(12, 1)
        } else {
          expect(measured.buttons[0]!.right).toBeCloseTo(measured.right, 1)
          expect(measured.buttons[1]!.top - measured.buttons[0]!.top - measured.buttons[0]!.height).toBeCloseTo(12, 1)
        }
      } finally {
        await page.close()
      }
    })
  })
})
