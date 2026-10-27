import { liveChipSuggestions, chipScenarios, compileComposerGeometry } from '@/__tests__/support/composer-geometry'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { buildComposerChips } from '@orbit/shared/chat'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { toComposerSuggestions } from '@orbit/shared/contracts/composer'
import { Composer } from '@/components/shell/composer'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('Composer compact geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let composerScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    ({ stylesheet, composerScript } = await compileComposerGeometry())
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([en, ptBR])('hugs every returning conversation suggestion across supported widths', async messages => {
    const { suggestions } = liveChipSuggestions('returning', messages)
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ state: 'idle', value: '', suggestions, words: messages.shell.composer })}</script>`)
      await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const strip = page.getByRole('group', { name: messages.shell.composer.suggestionsLabel })
      for (const width of [320, 412, 600, 840, 1100, 1352, 320]) {
        await page.setViewportSize({ width, height: 740 })
        await vi.waitFor(async () => {
          const measured = await strip.evaluate(element => {
            element.scrollLeft = 0
            const bounds = element.getBoundingClientRect()
            return { available: element.parentElement!.getBoundingClientRect().width, viewport: bounds.width,
              chips: [...element.querySelectorAll('button')].map(button => {
                const style = getComputedStyle(button)
                return { label: button.textContent, width: button.getBoundingClientRect().width,
                  content: button.querySelector('[data-suggestion-content]')!.getBoundingClientRect().width,
                  padding: parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd) }
              }) }
          })
          const evidence = JSON.stringify({ width, measured })
          expect(measured.viewport, evidence).toBeCloseTo(measured.available, 1)
          for (const chip of measured.chips) expect(Math.abs(chip.width - chip.content - chip.padding), evidence).toBeLessThanOrEqual(1)
        })
      }
    } finally { await page.close() }
  })

  it('keeps content widths when a mounted habit detail strip grows and shrinks', async () => {
    const { suggestions } = liveChipSuggestions('habitDetail', en)
    expect(suggestions.map(chip => chip.id)).toEqual(['habitDetail.pauseThisWeek', 'habitDetail.rename'])
    const configuration = { state: 'idle', value: '', suggestions, words: en.shell.composer }
    const page = await browser.newPage({ viewport: { width: 600, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" style="width:208px"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const strip = page.getByRole('group', { name: en.shell.composer.suggestionsLabel })
      const measure = () => strip.evaluate(element => {
        element.scrollLeft = 0
        const bounds = element.getBoundingClientRect()
        const chips = [...element.querySelectorAll('button')].map(button => {
          const chip = button.getBoundingClientRect()
          const style = getComputedStyle(button)
          return { left: chip.left - bounds.left, right: chip.right - bounds.left, width: chip.width,
            maximum: parseFloat(style.maxWidth),
            content: button.querySelector('[data-suggestion-content]')!.getBoundingClientRect().width,
            padding: parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd) }
        })
        const partial = chips.find(chip => chip.left < bounds.width && chip.right > bounds.width)
        return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
          available: element.parentElement!.getBoundingClientRect().width,
          chips, peek: partial ? bounds.width - partial.left : 0,
          hidden: partial ? partial.right - bounds.width : 0 }
      })
      for (const width of [208, 459, 208, 459]) {
        await page.locator('#root').evaluate((element, nextWidth) => { element.style.width = `${nextWidth}px` }, width)
        await vi.waitFor(async () => {
          const measured = await measure()
          expect(measured.clientWidth).toBe(width - 32)
          expect(measured.available).toBe(measured.clientWidth)
          for (const chip of measured.chips) {
            expect(chip.maximum, JSON.stringify(measured)).toBe(width - 64)
            expect(Math.abs(chip.width - chip.content - chip.padding), JSON.stringify(measured)).toBeLessThanOrEqual(1)
          }
          if (width === 459) {
            expect(measured.scrollWidth, JSON.stringify(measured)).toBe(measured.clientWidth)
            expect(measured.chips.every(chip => chip.left >= 0 && chip.right <= measured.clientWidth)).toBe(true)
          } else {
            expect(measured.scrollWidth).toBeGreaterThan(measured.clientWidth)
            expect(measured.peek).toBeGreaterThanOrEqual(16)
            expect(measured.hidden).toBeGreaterThanOrEqual(16)
          }
        })
      }
      const resized = await measure()
      await page.setContent(`<style>${stylesheet}</style><div id="root" style="width:459px"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      await vi.waitFor(async () => { expect(await measure()).toEqual(resized) })
    } finally { await page.close() }
  })

  it.each([en, ptBR])('keeps a readable peek for live Today chips at 320 with doubled text', async (messages) => {
    const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [], totalHabitCount: 0,
      profile: createMockProfile() })
    const labels = messages.shell.composer.chips.today
    const suggestions = toComposerSuggestions(chips.map(({ id }) => ({ id,
      label: labels[id.replace('today.', '') as keyof typeof labels], onSelect: vi.fn() })))

    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:32px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ state: 'idle', value: '', suggestions, words: messages.shell.composer })}</script>`)
      await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const strip = page.getByRole('group', { name: messages.shell.composer.suggestionsLabel })
      const measured = await strip.evaluate((element) => {
        const viewport = element.getBoundingClientRect()
        const controls = [...element.querySelectorAll('button')].map((button) => {
          const bounds = button.getBoundingClientRect()
          return { label: button.textContent, left: bounds.left, right: bounds.right, width: bounds.width }
        })
        const partial = controls.find((control) => control.left < viewport.right && control.right > viewport.right)
        return { availableWidth: viewport.width, controls, peek: partial ? viewport.right - partial.left : 0,
          hidden: partial ? partial.right - viewport.right : 0 }
      })
      const evidence = JSON.stringify(measured)
      expect(measured.peek, evidence).toBeGreaterThanOrEqual(16)
      expect(measured.hidden, evidence).toBeGreaterThanOrEqual(16)
    } finally { await page.close() }
  })

  it.each([en, ptBR].flatMap(messages => [1, 2].flatMap(fontScale =>
    chipScenarios.map(scenario => ({ messages, fontScale, scenario })))))(
    'keeps $scenario chips whole with a measured peek at $fontScale text across compact widths', async ({ messages, fontScale, scenario }) => {
      const { surface, suggestions } = liveChipSuggestions(scenario, messages)
      const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
      try {
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ state: 'idle', value: '', suggestions, words: messages.shell.composer })}</script>`)
        await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const strip = page.getByRole('group', { name: messages.shell.composer.suggestionsLabel })
        await strip.waitFor()
        for (const width of [320, 360, 384, 412, 600, 840, 1100, 1352, 412, 320]) {
          await page.setViewportSize({ width, height: 740 })
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          const measured = await strip.evaluate(element => {
            element.scrollLeft = 0
            const viewport = element.getBoundingClientRect()
            const controls = [...element.querySelectorAll('button')].map(button => {
              const bounds = button.getBoundingClientRect()
              const text = button.querySelector('[data-suggestion-label]')!
              const style = getComputedStyle(text)
              const range = document.createRange()
              range.selectNodeContents(text)
              const lines = [...range.getClientRects()]
              const walker = document.createTreeWalker(text.parentElement!, NodeFilter.SHOW_TEXT)
              const fragments: DOMRect[] = []
              while (walker.nextNode()) {
                if (!walker.currentNode.textContent?.trim()) continue
                const fragmentRange = document.createRange()
                fragmentRange.selectNodeContents(walker.currentNode)
                fragments.push(...[...fragmentRange.getClientRects()].filter(fragment => fragment.width > 0))
              }
              const combinedLines: DOMRect[] = []
              for (const fragment of fragments.sort((first, second) => first.top - second.top)) {
                const center = (fragment.top + fragment.bottom) / 2
                const sharesLine = combinedLines.some(line => {
                  const lineCenter = (line.top + line.bottom) / 2
                  return center >= line.top && center <= line.bottom
                    && lineCenter >= fragment.top && lineCenter <= fragment.bottom
                })
                if (!sharesLine) combinedLines.push(fragment)
              }
              const mark = button.querySelector<SVGSVGElement>('[data-asset="astra-mark"]')!
              const ink = mark.getBBox()
              const drawnCentre = new DOMPoint(ink.x + ink.width / 2, ink.y + ink.height / 2).matrixTransform(mark.getScreenCTM()!)
              const firstLineCentre = button.querySelector('[data-suggestion-content]')!.getBoundingClientRect().top + parseFloat(style.lineHeight) / 2
              const attribution = [...button.querySelectorAll<HTMLElement>('[translate="no"]')]
              const marks = [...button.querySelectorAll<SVGElement>('[data-asset="astra-mark"]')]
              return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height,
                label: text.textContent, accessibleName: button.getAttribute('aria-label'), lines: lines.length, textOverflow: style.textOverflow,
                combinedText: text.parentElement!.textContent, combinedLines: combinedLines.length,
                textFits: lines.every(line => line.left >= bounds.left && line.right <= bounds.right && line.bottom <= bounds.bottom),
                attribution: attribution.map(element => element.textContent),
                attributionFits: attribution.every(element => {
                  const ink = element.getBoundingClientRect()
                  return ink.left >= bounds.left && ink.right <= bounds.right && ink.top >= bounds.top && ink.bottom <= bounds.bottom
                }),
                marks: marks.length, decorative: marks.every(mark => mark.getAttribute('aria-hidden') === 'true'),
                drawnCentre: drawnCentre.y, firstLineCentre }
            })
            const partial = controls.find(control => control.left < viewport.right && control.right > viewport.right)
            return { viewport: viewport.width, available: element.parentElement!.getBoundingClientRect().width,
              overflow: element.scrollWidth > element.clientWidth, peek: partial ? viewport.right - partial.left : 0,
              hidden: partial ? partial.right - viewport.right : 0,
              documentWidth: document.documentElement.scrollWidth, controls }
          })
          const evidence = JSON.stringify({ width, fontScale, surface, scenario, measured })
          expect(measured.documentWidth, evidence).toBe(width)
          expect(measured.viewport, evidence).toBeCloseTo(measured.available, 1)
          if (measured.overflow) {
            expect(measured.peek, evidence).toBeGreaterThanOrEqual(16)
            expect(measured.hidden, evidence).toBeGreaterThanOrEqual(16)
            expect(measured.controls[0]!.right - measured.controls[0]!.left, evidence).toBeLessThan(measured.viewport)
          } else expect(measured.viewport, evidence).toBeCloseTo(measured.available, 1)
          if (scenario === 'empty' && width === 320 && fontScale === 1) {
            expect(measured.controls.map(control => control.combinedLines), evidence).toEqual(suggestions.map(() => 1))
          }
          for (const control of measured.controls) {
            expect(control.textFits, evidence).toBe(true)
            expect(control.accessibleName, evidence).toBe(control.label)
            expect(control.attribution, evidence).toEqual([])
            expect(control.attributionFits, evidence).toBe(true)
            expect(control.marks, evidence).toBe(1)
            expect(control.decorative, evidence).toBe(true)
            expect(control.textOverflow, evidence).not.toBe('ellipsis')
            expect(control.height, evidence).toBeGreaterThanOrEqual(48)
            expect(control.width, evidence).toBeLessThanOrEqual(measured.viewport)
            if (fontScale === 1) expect(control.lines, evidence).toBe(1)
            expect(Math.abs(control.drawnCentre - control.firstLineCentre), evidence).toBeLessThanOrEqual(1)
          }
          await strip.locator('button').last().evaluate(element => (element as HTMLElement).blur())
          await strip.locator('button').last().focus()
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
          const lastVisible = await strip.evaluate(element => {
            const control = element.querySelector('button:last-child')!.getBoundingClientRect()
            const viewport = element.getBoundingClientRect()
            return control.left >= viewport.left - 1 && control.right <= viewport.right + 1
          })
          expect(lastVisible, evidence).toBe(true)
        }
      } finally { await page.close() }
    }, 30_000,
  )

  it.each([320, 360, 384, 412].flatMap((width) => [en, ptBR].map((messages) => ({ width, messages }))))('keeps habit detail chips whole in one scroll row at $width', async ({ width, messages }) => {
    const chips = buildComposerChips({ surface: 'habitDetail', status: 'success', habits: [], totalHabitCount: 1,
      detailHabit: { title: 'Reading', checklistItems: [] }, profile: createMockProfile() })
    const labels = messages.shell.composer.chips.habitDetail
    const suggestions = toComposerSuggestions(chips.map(({ id }) => ({ id,
      label: labels[id.replace('habitDetail.', '') as keyof typeof labels], onSelect: vi.fn() })))
    const { container } = render(<Composer state="idle" value="" suggestions={suggestions} words={en.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()} />)
    const page = await browser.newPage({ viewport: { width, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:32px}</style>${container.innerHTML}`)
      await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      await loadAppFonts(page)
      const strip = page.getByRole('group', { name: en.shell.composer.suggestionsLabel })
      const tops = []
      for (const control of await strip.getByRole('button').all()) {
        await control.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }))
        const measured = await control.evaluate((element) => {
          const label = element.querySelector('span')!
          return { top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height, labelWidth: label.clientWidth, textWidth: label.scrollWidth, overflow: getComputedStyle(label).textOverflow }
        })
        tops.push(measured.top)
        expect(measured.height).toBeGreaterThanOrEqual(48)
        expect(measured.labelWidth).toBe(measured.textWidth)
        expect(measured.overflow).not.toBe('ellipsis')
      }
      expect(new Set(tops).size).toBe(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    } finally { await page.close() }
  })
})
