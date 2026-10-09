import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Chip } from '@/components/ui/chip'
import { RadioRow } from '@/components/ui/select-check'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectControlAccentRings } from '@/e2e/layout/focus-indicators'
import { loadAppFonts } from './app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

const options = [{ value: 'Mês', label: 'Mês' }, { value: 'Semana', label: 'Semana' }, { value: 'Período', label: 'Período' }, { value: 'Agenda', label: 'Agenda' }] as const

describe('selection yields to keyboard focus', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  for (const theme of ['dark', 'light'] as const) {
    it(`unselected theme choice paints hover without an accent ring, ${theme}`, async () => {
      const page = await browser.newPage()
      try {
        await page.setContent(`<style>${stylesheet}:root { ${Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value};`).join('')} }</style><button class="orbit-profile-theme-choice">Theme</button><span style="background:var(--bg-hover)">Hover</span>`)
        const control = page.locator('button')
        await control.hover()
        const hoverFill = await page.locator('span').evaluate((element) => getComputedStyle(element).backgroundColor)
        await expect.poll(() => control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(hoverFill)
        expect(await inspectControlAccentRings(control)).toHaveLength(0)
      } finally { await page.close() }
    })
    for (const selected of [false, true]) {
      for (const surface of ['segment', 'chip', 'period', 'radio'] as const) {
        it(`${surface}, selected ${selected}, ${theme}`, async () => {
          const element = surface === 'segment'
            ? <SegmentedControl label="View" options={options} value={selected ? 'Mês' : 'Semana'} onChange={() => {}} fullWidth />
            : surface === 'radio'
              ? <RadioRow label="Radio" selected={selected} onSelect={() => {}} />
              : <Chip active={selected} variant={surface === 'period' ? 'period' : 'default'}>Chip</Chip>
          const page = await browser.newPage()
          try {
            await page.setContent(`<style>${stylesheet}:root { ${Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value};`).join('')} }</style>${render(element).container.innerHTML}`)
            await loadAppFonts(page)
            const control = page.locator('button').first()
            expect(await inspectControlAccentRings(control)).toHaveLength(selected ? 1 : 0)
            await control.hover()
            expect(await inspectControlAccentRings(control)).toHaveLength(selected ? 1 : 0)
            if (surface === 'segment' && !selected) return
            await page.keyboard.press('Tab')
            expect(await control.evaluate((button) => button.matches(':focus-visible'))).toBe(true)
            expect(await inspectControlAccentRings(control)).toHaveLength(1)
          } finally { cleanup(); await page.close() }
        })
      }
    }
  }

  it('keeps four inset segments and whole pt-BR labels at 320', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 706 } })
    try {
      await page.setContent(`<style>${stylesheet}:root { ${Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value};`).join('')} } body { margin:0; padding:16px; }</style>${render(<SegmentedControl label="View" options={options} value="Mês" onChange={() => {}} fullWidth />).container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.locator('[role="radiogroup"]').evaluate((track) => {
        const style = getComputedStyle(track)
        return { padding: style.padding, gap: style.gap, radius: style.borderRadius, shadow: style.boxShadow, labels: [...track.querySelectorAll('button span')].map((label) => {
          const range = document.createRange(); range.selectNodeContents(label)
          const rect = range.getBoundingClientRect()
          return { label: label.textContent, width: rect.width, available: label.getBoundingClientRect().width, top: label.getBoundingClientRect().top }
        }) }
      })
      process.stdout.write(`Segment label geometry: ${JSON.stringify(geometry)}\n`)
      expect(geometry).toMatchObject({ padding: '4px', gap: '4px', radius: '12px', shadow: 'none' })
      expect(new Set(geometry.labels.map((label) => label.top)).size).toBe(1)
      for (const label of geometry.labels) expect(label.width).toBeLessThanOrEqual(label.available)
    } finally { cleanup(); await page.close() }
  })
})
