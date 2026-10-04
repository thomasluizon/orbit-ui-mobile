import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
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
})
