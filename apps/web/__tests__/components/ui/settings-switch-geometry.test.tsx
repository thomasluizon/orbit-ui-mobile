import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { SettingsRow } from '@/components/ui/settings-row'
import { ListRow } from '@/components/ui/list-row'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { BarChart3 } from '@/components/ui/icons'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('settings switch centres in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it('keeps locked Astra labels in their existing text block', async () => {
    const title = ptBR.profile.proactiveAstra.title
    const { container } = render(<div style={{ width: 364 }}>
      <ListRow title={title} compact textMode="label" chevron={false} onClick={() => {}}
        trailing={<Badge>Pro</Badge>} />
    </div>)
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const height = await page.evaluate(() => document.querySelector('[data-slot="list-row-title"]')!.parentElement!.getBoundingClientRect().height)
      expect(height).toBeLessThanOrEqual(32)
    } finally { await page.close() }
  })

  for (const width of [412, 1280]) {
    it.each([ptBR.profile.analytics.title, ptBR.profile.proactiveAstra.title, ptBR.profile.aiSummary.title].flatMap((label) => [{ scale: 1, narrow: false }, { scale: 2, narrow: true }, { scale: 2, narrow: false }].map((scenario) => ({ label, ...scenario }))))(`aligns $label at ${width}px and text scale $scale with narrow=$narrow`, async ({ label, scale, narrow }) => {
      const title = ptBR.profile.analytics.title
      const { container } = render(<div style={{ width: narrow ? 288 : width - 48 }}>
        <SettingsRow label={title} icon={BarChart3} accessory="none" divider={false}>
          <Switch label={title} checked onChange={() => {}} />
        </SettingsRow>
        {[ptBR.profile.proactiveAstra.title, ptBR.profile.aiSummary.title].map((label) => (
          <ListRow key={label} title={label} compact textMode="label" chevron={false} readOnly
            trailing={<Switch label={label} checked onChange={() => {}} />} />
        ))}
      </div>)
      const page = await browser.newPage()
      try {
        await page.setViewportSize({ width, height: 915 })
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * scale}px}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[role="switch"]')).map((control) => {
          const row = control.closest('.orbit-list-row-shell') ?? control.parentElement!.parentElement!
          const label = row.querySelector('[data-slot="list-row-title"], [data-slot="settings-row-label"]')!
          const labelBounds = label.getBoundingClientRect()
          const switchBounds = control.getBoundingClientRect()
          return { label: label.textContent, height: row.getBoundingClientRect().height, labelHeight: labelBounds.height,
            lineHeight: parseFloat(getComputedStyle(label).lineHeight), fontSize: parseFloat(getComputedStyle(label).fontSize),
            offset: labelBounds.top + labelBounds.height / 2 - switchBounds.top - switchBounds.height / 2,
            topOffset: labelBounds.top - switchBounds.top, switchHeight: switchBounds.height }
        }))
        expect(rows).toHaveLength(3)
        const matches = rows.filter((row) => row.label === label)
        expect(matches).toHaveLength(1)
        for (const row of matches) {
          expect(row.fontSize).toBe(17 * scale)
          expect(row.switchHeight).toBeGreaterThanOrEqual(48)
          if (row.labelHeight <= row.lineHeight + 1) {
            expect.soft(Math.abs(row.offset), row.label).toBeLessThanOrEqual(1)
            if (scale === 1) expect.soft(row.height).toBe(52)
            else expect(row.height).toBeGreaterThanOrEqual(row.switchHeight)
          } else {
            expect(scale).toBe(2)
            expect(Math.abs(row.topOffset), row.label).toBeLessThanOrEqual(1)
            expect(row.height).toBeGreaterThan(52)
          }
        }
      } finally { await page.close() }
    })
  }
})
