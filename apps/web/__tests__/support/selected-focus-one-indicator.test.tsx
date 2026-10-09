import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
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
    it(`a selected inner DateField circle yields to its focused button, ${theme}`, async () => {
      const { container } = render(<button type="button"><span className="orbit-selection-ring orbit-selection-ring-hairline" data-selected>Today</span></button>)
      const page = await browser.newPage()
      try {
        await page.setContent(`<style>${stylesheet}:root { ${Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value};`).join('')} }</style>${container.innerHTML}`)
        const control = page.locator('button')
        expect(await inspectControlAccentRings(control)).toEqual(['span:shadow'])
        await page.keyboard.press('Tab')
        expect(await control.evaluate((button) => button.matches(':focus-visible'))).toBe(true)
        expect(await inspectControlAccentRings(control)).toEqual(['button:outline'])
        expect(await page.locator('span').evaluate((circle) => getComputedStyle(circle).boxShadow)).toBe('none')
        await page.keyboard.press('Tab')
        expect(await inspectControlAccentRings(control)).toEqual(['span:shadow'])
      } finally { cleanup(); await page.close() }
    })
    it(`selected theme choice keeps its foreground label under hovered keyboard focus, ${theme}`, async () => {
      const page = await browser.newPage()
      try {
        await page.setContent(`<style>${stylesheet}:root { ${Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value};`).join('')} }</style><button class="orbit-profile-theme-choice" data-selected>Theme</button><span style="color:var(--fg-1);background:var(--primary-dim)">Selected</span>`)
        const control = page.locator('button')
        await control.hover()
        await page.keyboard.press('Tab')
        expect(await control.evaluate((button) => button.matches(':focus-visible'))).toBe(true)
        const selectedStyle = await page.locator('span').evaluate((element) => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }))
        await expect.poll(() => control.evaluate((element) => getComputedStyle(element).color)).toBe(selectedStyle.color)
        expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(selectedStyle.background)
        expect(await inspectControlAccentRings(control)).toHaveLength(1)
      } finally { await page.close() }
    })
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

  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    for (const width of [320, 360, 384, 412]) {
      for (const fullWidth of [false, true]) {
        it(`contains label-sized segments in ${locale} at ${width}, fullWidth ${fullWidth}`, async () => {
          const choices = [{ value: 'month', label: words.calendar.view.month }, { value: 'week', label: words.calendar.view.week }, { value: 'range', label: words.calendar.view.range }, { value: 'agenda', label: words.calendar.view.agenda }] as const
          const page = await browser.newPage({ viewport: { width, height: 706 } })
          try {
            await page.setContent(`<style>${stylesheet} body { margin:0; padding:16px; }</style>${render(<SegmentedControl label="View" options={choices} value="month" onChange={() => {}} fullWidth={fullWidth} />).container.innerHTML}`)
            await loadAppFonts(page)
            const geometry = await segmentGeometry(page)
            expect(geometry).toMatchObject({ padding: '4px', gap: '4px', radius: '12px', shadow: 'none' })
            expect(new Set(geometry.labels.map((label) => label.top)).size).toBe(1)
            const remaining = geometry.labels.map((label) => label.segmentWidth - label.width)
            expect(Math.max(...remaining) - Math.min(...remaining)).toBeLessThan(0.1)
            for (const label of geometry.labels) {
              expect(label.fontSize).toBe('14px')
              expect(label.paddingLeft).toBe(8)
              expect(label.paddingRight).toBe(8)
              expect(label.width).toBeLessThanOrEqual(label.available)
              expect(label.lines).toBe(1)
              expect(label.height).toBeGreaterThanOrEqual(48)
            }
          } finally { cleanup(); await page.close() }
        })
      }
    }
  }

  it.each([false, true])('contains large schedule labels without clipping, fullWidth %s', async (fullWidth) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 706 } })
    const words = ptBR.onboarding.flow.when
    const choices = [{ value: 'fixed', label: words.fixedMode }, { value: 'flexible', label: words.flexibleMode }, { value: 'interval', label: words.intervalMode }, { value: 'oneTime', label: words.oneTimeMode }] as const
    try {
      await page.setContent(`<style>${stylesheet} html { font-size:32px; } body { margin:0; padding:16px; }</style>${render(<SegmentedControl label="Schedule" options={choices} value="fixed" onChange={() => {}} fullWidth={fullWidth} />).container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await segmentGeometry(page)
      expect(geometry.trackWidth).toBeLessThanOrEqual(288)
      expect(geometry.scrollWidth).toBeLessThanOrEqual(288)
      for (const label of geometry.labels) {
        expect(label.fontSize).toBe('28px')
        expect(label.width).toBeLessThanOrEqual(label.available)
        expect(label.textHeight).toBeLessThanOrEqual(label.height)
        expect(label.whiteSpace).toBe('normal')
        expect(label.overflow).toBe('visible')
        expect(label.textOverflow).not.toBe('ellipsis')
      }
    } finally { cleanup(); await page.close() }
  })
})

async function segmentGeometry(page: import('@playwright/test').Page) {
  return page.locator('[role="radiogroup"]').evaluate((track) => {
    const style = getComputedStyle(track)
    return { padding: style.padding, gap: style.gap, radius: style.borderRadius, shadow: style.boxShadow,
      trackWidth: track.getBoundingClientRect().width, scrollWidth: track.scrollWidth,
      labels: [...track.querySelectorAll('button span')].map((label) => {
        const range = document.createRange(); range.selectNodeContents(label)
        const rect = range.getBoundingClientRect()
        const segment = label.parentElement!
        const segmentStyle = getComputedStyle(segment)
        const labelStyle = getComputedStyle(label)
        return { width: rect.width, available: label.getBoundingClientRect().width, top: segment.getBoundingClientRect().top,
          segmentWidth: segment.getBoundingClientRect().width, height: segment.getBoundingClientRect().height,
          textHeight: rect.height, lines: range.getClientRects().length, fontSize: segmentStyle.fontSize,
          whiteSpace: labelStyle.whiteSpace, overflow: labelStyle.overflow, textOverflow: labelStyle.textOverflow,
          paddingLeft: Number.parseFloat(segmentStyle.paddingLeft), paddingRight: Number.parseFloat(segmentStyle.paddingRight) }
      }) }
  })
}
