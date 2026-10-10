import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { expectFillShape, expectInteractionFill } from '@/e2e/layout/label-interaction-fill'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('personal checkbox interaction fills in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 360, 384, 412, 600].flatMap((width) => [en, ptBR].flatMap((words) => [1, 2].map((textScale) => ({ width, words, textScale })))))('aligns compact options and grows rows at $width, scale $textScale', async ({ width, words, textScale }) => {
    const markup = renderToStaticMarkup(<div style={{ padding: 24 }}>
      <h2>{words.calendar.options}</h2>
      <CheckRow placement="column" label={words.calendar.showRecurring} checked onChange={vi.fn()} />
      <ListRow placement="column" textMode="label" title={words.calendar.googleCalendar} onClick={vi.fn()} />
      <ListRow placement="column" textMode="label" title={words.calendar.legendTitle} onClick={vi.fn()} />
    </div>)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${variables}"><style>${stylesheet}:root { font-size: ${16 * textScale}px; }</style><body>${markup}</body></html>`)
      await loadAppFonts(page)
      for (const label of [words.calendar.showRecurring, words.calendar.googleCalendar, words.calendar.legendTitle]) {
        const control = page.getByRole(label === words.calendar.showRecurring ? 'checkbox' : 'button', { name: label, exact: true })
        const geometry = await control.evaluate((element) => {
          const label = element.querySelector('[data-slot="list-row-title"]') ?? element.querySelector('[data-slot="list-row-content"] > span')!
          const range = document.createRange()
          range.selectNodeContents(label)
          const style = getComputedStyle(label)
          const tick = element.querySelector('svg')?.getBoundingClientRect()
          return { left: range.getBoundingClientRect().left, height: element.getBoundingClientRect().height, lines: range.getClientRects().length, fontSize: style.fontSize, fontWeight: style.fontWeight, clipped: label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth, tickCenter: tick ? tick.top + tick.height / 2 : undefined, firstLineCenter: label.getBoundingClientRect().top + Number.parseFloat(style.lineHeight) / 2 }
        })
        expect(geometry.left).toBe(24)
        expect(geometry.height).toBeGreaterThanOrEqual(52)
        expect(geometry.clipped).toBe(false)
        expect(geometry.fontSize).toBe(`${17 * textScale}px`)
        expect(geometry.fontWeight).toBe('400')
        if (textScale === 1) expect(geometry.lines).toBe(1)
        else {
          expect(geometry.height).toBeGreaterThan(52)
          if (label === words.calendar.showRecurring) expect(geometry.tickCenter).toBeCloseTo(geometry.firstLineCenter, 0)
        }
        await expectInteractionFill(control)
      }
    } finally { await page.close() }
  })

  it.each([412, 1352].flatMap((width) => [false, true].flatMap((checked) => (['light', 'dark'] as const).map((mode) => ({ width, checked, mode })))))('pads both controls in $mode at $width, checked $checked', async ({ width, checked, mode }) => {
    const markup = renderToStaticMarkup(<CheckRow label="Family calendar" textMode="personal" checked={checked} onChange={vi.fn()} onOpenLabel={vi.fn()} />)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="${mode}" style="${variables}"><style>${stylesheet}</style><body style="padding:32px">${markup}</body></html>`)
      const checkbox = page.getByRole('checkbox', { name: 'Family calendar', exact: true })
      const label = page.getByRole('button', { name: 'Family calendar', exact: true })
      await expectInteractionFill(checkbox)
      await expectInteractionFill(label)
      const contents = await checkbox.evaluate((control) => {
        const fill = control.querySelector('[data-press-fill]')!
        return { checkboxInFill: Boolean(fill.querySelector('[data-slot="checkbox-box"]')), graphicCount: fill.querySelectorAll('svg').length }
      })
      expect(contents.checkboxInFill).toBe(true)
      expect(contents.graphicCount).toBeGreaterThan(0)
      const bounds = (await checkbox.boundingBox())!
      await checkbox.evaluate((element) => element.addEventListener('click', () => element.setAttribute('data-activated', 'true')))
      await page.mouse.click(bounds.x - 8, bounds.y + bounds.height / 2)
      expect(await checkbox.getAttribute('data-activated')).toBe('true')
      await checkbox.evaluate((element) => element.removeAttribute('data-activated'))
      await checkbox.focus()
      await page.keyboard.press('Space')
      await checkbox.evaluate(async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)) })
      await expectFillShape(checkbox, 'focus')
      expect(await checkbox.getAttribute('data-activated')).toBe('true')
    } finally { await page.close() }
  })
})
