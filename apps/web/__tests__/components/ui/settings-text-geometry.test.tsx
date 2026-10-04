import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { SettingsRow } from '@/components/ui/settings-row'
import { SettingsGroupRow } from '@/components/ui/settings-group'
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

  it.each([['SettingsRow', SettingsRow], ['SettingsGroupRow', SettingsGroupRow]] as const)('renders every product label line at 200% text in %s', async (_name, Row) => {
    const { container } = render(<div style={{ width: 320 }}>
      <Row label="Sincronizar calendário com todos os compromissos da semana" accessory="none" />
    </div>)
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:32px}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const label = [...document.querySelectorAll('span')].find((element) => element.firstChild?.nodeType === Node.TEXT_NODE)!
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

  it.each([['SettingsRow', SettingsRow], ['SettingsGroupRow', SettingsGroupRow]] as const)('gives typed text the full width and removes the two-line clamp after disclosure in %s', async (_name, Row) => {
    const title = 'Caminhar pelo bairro depois do trabalho e conversar com todos os amigos durante os encontros da semana'
    const { container, getByRole } = render(<div style={{ width: 320 }}>
      <Row label={title} textMode="personal" accessory="none" />
    </div>)
    const disclosure = getByRole('button', { name: title })
    const page = await browser.newPage()
    const readGeometry = async () => {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      return page.locator('[data-slot="settings-row-label"]').evaluate((label) => {
        const row = label.closest('button')!
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
