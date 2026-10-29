import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { getSegmentedControlLayout } from '@orbit/shared/utils'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { measureSplitSegmentWords, mountMeasuredSegmentedControls } from '@/__tests__/support/segmented-control-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

let launch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterAll(async () => { await closeChrome(launch) }, 30_000)

it('leaves at least 8px spare for the four Portuguese calendar views in a 288px frame', async () => {
  const options = (['month', 'week', 'range', 'agenda'] as const).map((value) => ({ value, label: ptBR.calendar.view[value] }))
  const { container } = render(<div style={{ width: 288 }}><SegmentedControl fullWidth label={ptBR.calendar.view.switchLabel}
    options={[options[0]!, options[1]!, options[2]!, options[3]!]} value="month" onChange={vi.fn()} /></div>)
  const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
  try {
    await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
    await loadAppFonts(page)
    await mountMeasuredSegmentedControls(page)
    const inputs = await page.evaluate(() => {
      const frame = document.querySelector('[data-segmented-control]')!
      const labels = [...frame.querySelectorAll<HTMLElement>('[data-segment-measure]')]
      const track = getComputedStyle(labels[0]!.parentElement!)
      const label = getComputedStyle(labels[0]!)
      return {
        available: frame.getBoundingClientRect().width,
        words: labels.map((element) => [Math.ceil(element.querySelector('[data-segment-full]')!.getBoundingClientRect().width)]),
        insets: { label: Number.parseFloat(label.paddingLeft) + Number.parseFloat(label.paddingRight),
          track: Number.parseFloat(track.paddingLeft) + Number.parseFloat(track.paddingRight), gap: Number.parseFloat(track.columnGap) },
      }
    })
    const layout = getSegmentedControlLayout(inputs.words, inputs.available, inputs.insets)
    const required = layout.minimumWidths.reduce((sum, width) => sum + width, inputs.insets.track + inputs.insets.gap * (options.length - 1))
    expect(inputs.available).toBe(288)
    expect(inputs.available - required, JSON.stringify({ ...inputs, required })).toBeGreaterThanOrEqual(8)
    expect(layout.folded).toBe(false)
    expect(inputs.insets.label).toBeGreaterThanOrEqual(16)
    expect(inputs.insets.gap).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    expect(await page.getByRole('radio').count()).toBe(4)
    for (const option of options) {
      const radio = page.getByRole('radio', { name: option.label, exact: true })
      await radio.click()
      expect(await radio.getAttribute('aria-checked')).toBe('true')
    }
  } finally { cleanup(); await page.close() }
})

it.each(['en', 'pt-BR'])('settles at the fractional fit boundary after shrinking accessibility text in %s', async (locale) => {
  const messages = locale === 'en' ? en : ptBR
  const options = [
    { value: 'today', label: messages.habits.viewToday },
    { value: 'all', label: messages.habits.viewAll },
    { value: 'general', label: messages.habits.viewGeneral },
  ] as const
  const { container } = render(<div data-segment-slot="" style={{ width: 380 }}><SegmentedControl label="Views" options={options} value="today" onChange={vi.fn()} /></div>)
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
  try {
    await page.setContent(`<style>${stylesheet} :root { font-size:32px; --orbit-space-4:0.25rem; --orbit-space-8:0.5rem; } body { margin:0; padding:16px; }</style>${container.innerHTML}`)
    await loadAppFonts(page)
    await mountMeasuredSegmentedControls(page)
    const geometry = await page.evaluate(async () => {
      document.documentElement.style.fontSize = '16.01px'
      const control = document.querySelector('[data-segmented-control]')!
      const labels = [...control.querySelectorAll<HTMLElement>('[data-segment-measure]')]
      const track = getComputedStyle(labels[0]!.parentElement!)
      const required = labels.reduce((sum, label) => {
        const style = getComputedStyle(label)
        return sum + Math.max(48, label.querySelector('[data-segment-full]')!.getBoundingClientRect().width + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight))
      }, Number.parseFloat(track.paddingLeft) + Number.parseFloat(track.paddingRight) + Number.parseFloat(track.columnGap) * (labels.length - 1))
      const available = Math.ceil(required)
      document.querySelector<HTMLElement>('[data-segment-slot]')!.style.width = `${available}px`
      const samples = []
      for (let frame = 0; frame < 30; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const group = control.querySelector('[role="radiogroup"]')
        samples.push({ folded: !group, width: control.getBoundingClientRect().width, trackWidth: group?.getBoundingClientRect().width })
      }
      return { samples, required, available }
    })
    const transitions = geometry.samples.filter((sample, index) => index > 0 && sample.folded !== geometry.samples[index - 1]!.folded)
    expect(transitions.length, JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    for (const sample of geometry.samples.slice(3)) {
      expect(sample.folded).toBe(false)
      expect(sample.width).toBe(geometry.available)
      expect(sample.trackWidth).toBeCloseTo(geometry.required, 1)
      expect(sample.trackWidth).toBeLessThan(geometry.available)
    }
    expect(await page.evaluate(measureSplitSegmentWords)).toEqual([])
  } finally { cleanup(); await page.close() }
})
