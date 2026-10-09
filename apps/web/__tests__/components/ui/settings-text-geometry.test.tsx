import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { renderSettingsRowMarkup } from '../../../e2e/layout/settings-row-markup'
import { ListRow } from '@/components/ui/list-row'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('settings text geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['SettingsRow', 'SettingsGroupRow'])('renders every product label line at 200% text in %s', async (name) => {
    const title = 'Sincronizar calendário com todos os compromissos da semana'
    const markup = renderSettingsRowMarkup([title])
    const page = await browser.newPage()
    try {
      await page.setViewportSize({ width: 320, height: 915 })
      await page.setContent(`<style>${stylesheet}html{font-size:32px}</style>${markup}`)
      await loadAppFonts(page)
      const geometry = await page.getByText(title, { exact: true }).nth(name === 'SettingsRow' ? 0 : 1).evaluate((label) => {
        const style = getComputedStyle(label)
        return { fontSize: parseFloat(style.fontSize), clamp: style.webkitLineClamp, height: label.clientHeight, scrollHeight: label.scrollHeight, lineHeight: parseFloat(style.lineHeight), overflowWrap: style.overflowWrap }
      })
      expect(geometry.fontSize).toBe(34)
      expect(geometry.clamp).toBe('none')
      expect(geometry.height).toBeGreaterThan(2 * geometry.lineHeight)
      expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height)
      expect(geometry.overflowWrap).toBe('break-word')
    } finally { await page.close() }
  })

  for (const width of [320, 360, 384, 412]) {
    it.each([['en', en], ['pt-BR', ptBR]] as const)(`renders the layout guard's controls and typed text in %s at ${width}px`, async (_locale, words) => {
      const title = 'Caminhar pelo bairro depois do trabalho e conversar com todos os amigos durante os encontros da semana'
      const labels = [words.profile.analytics.title, words.profile.marketingEmails.title, words.trial.expired.calendarSync, words.trial.expired.proactiveAstra]
      const markup = renderSettingsRowMarkup(labels, title)
      const page = await browser.newPage()
      try {
        await page.setViewportSize({ width, height: 915 })
        await page.setContent(`<style>${stylesheet}</style>${markup}`)
        await loadAppFonts(page)
        for (const scale of [1, 1.3, 1.31, 2]) {
          await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
          for (const text of labels) {
            const geometry = await page.getByText(text, { exact: true }).evaluate((label) => ({
              fontSize: parseFloat(getComputedStyle(label).fontSize), clamp: getComputedStyle(label).webkitLineClamp,
              height: label.clientHeight, scrollHeight: label.scrollHeight,
            }))
            expect(geometry.fontSize).toBeCloseTo(17 * scale, 1)
            expect(geometry.clamp).toBe('none')
            expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height)
          }
          const typed = await page.getByText(title, { exact: true }).evaluate((label) => {
            const row = (label.closest('[data-personal-text-content]') ?? label.closest('button'))!
            const style = getComputedStyle(row)
            const labelStyle = getComputedStyle(label)
            return { width: label.getBoundingClientRect().width, available: row.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd), clamp: labelStyle.webkitLineClamp, height: label.clientHeight, scrollHeight: label.scrollHeight, lineHeight: parseFloat(labelStyle.lineHeight) }
          })
          expect(typed.width).toBeCloseTo(typed.available, 0)
          expect(typed.clamp).toBe('2')
          expect(typed.height).toBeLessThanOrEqual(2 * typed.lineHeight + 1)
          expect(typed.scrollHeight).toBeGreaterThan(typed.height)
        }
      } finally { await page.close() }
    })
  }

  it.each([['ListRow', ListRow]] as const)('gives typed text the full width and removes the two-line clamp after disclosure in %s', async (_name, Row) => {
    const title = 'Caminhar pelo bairro depois do trabalho e conversar com todos os amigos durante os encontros da semana'
    const { container, getByRole } = render(<div style={{ width: 320 }}>
      <Row title={title} textMode="personal" chevron={false} />
    </div>)
    const disclosure = getByRole('button', { name: title })
    const page = await browser.newPage()
    const readGeometry = async () => {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      return page.locator('[data-slot="list-row-title"]').evaluate((label) => {
        const row = (label.closest('[data-personal-text-content]') ?? label.closest('button'))!
        const style = getComputedStyle(row)
        const labelStyle = getComputedStyle(label)
        return { width: label.getBoundingClientRect().width, available: row.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd), clamp: labelStyle.webkitLineClamp, height: label.clientHeight, scrollHeight: label.scrollHeight, lineHeight: parseFloat(labelStyle.lineHeight) }
      })
    }
    try {
      const collapsed = await readGeometry()
      expect(collapsed.width).toBeCloseTo(collapsed.available, 0)
      expect(collapsed.clamp).toBe('2')
      expect(collapsed.height).toBeLessThanOrEqual(2 * collapsed.lineHeight + 1)
      expect(collapsed.scrollHeight).toBeGreaterThan(collapsed.height)
      fireEvent.click(disclosure)
      const expanded = await readGeometry()
      expect(expanded.clamp).toBe('none')
      expect(expanded.scrollHeight).toBeLessThanOrEqual(expanded.height)
    } finally { await page.close() }
  })

})
