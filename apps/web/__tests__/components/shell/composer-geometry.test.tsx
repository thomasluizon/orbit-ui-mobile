import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import postcss from 'postcss'
import { execFileSync } from 'node:child_process'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildComposerChips } from '@orbit/shared/chat'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { toComposerSuggestions, type ComposerProps } from '@orbit/shared/contracts/composer'
import { Composer } from '@/components/shell/composer'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { Menu } from '@/components/ui/menu'
import { measureFieldInset } from '@/e2e/layout/field-inset-geometry'
import { inspectFocusedRing, readFieldIndicators } from '@/e2e/layout/focus-indicators'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const cases = [320, 360, 384, 412].flatMap((width) =>
  [en, ptBR].flatMap((messages) => [1, 2].map((fontScale) => ({ width, messages, fontScale }))),
)

type GeometryScenario = 'idle' | 'typing' | 'longText' | 'sending' | 'recording' | 'transcribing' | 'tray1' | 'tray2' | 'tray3' | 'atLimit' | 'offline' | 'retry'

function geometryProps(scenario: GeometryScenario, messages: typeof en, withOpener: boolean): ComposerProps {
  const state = ['typing', 'longText', 'tray1', 'tray2', 'tray3', 'retry'].includes(scenario) ? 'idle' : scenario
  return {
    state,
    ...(state === 'offline' ? { limitReason: messages.shell.composer.offline.reason } : {}),
    ...(state === 'atLimit' ? { limitReason: messages.shell.composer.limit.reason } : {}),
    value: scenario === 'typing' ? 'First\nSecond\nThird' : scenario === 'longText' ? 'Long message\n'.repeat(12) : '',
    suggestions: [], words: { ...messages.shell.composer, ...(state === 'offline' ? { placeholder: messages.shell.composer.offline.placeholder } : state === 'atLimit' ? { placeholder: messages.shell.composer.limit.placeholder } : {}) },
    onChangeValue: vi.fn(), onSend: vi.fn(),
    onVoice: vi.fn(), voiceWords: messages.shell.composer.voice,
    onAttachFile: vi.fn(), onAttachImage: vi.fn(),
    attachWords: { ...messages.shell.composer.attach, remove: (name: string) => messages.shell.composer.attach.remove.replace('{name}', name) },
    attachments: Array.from({ length: scenario.startsWith('tray') ? Number(scenario.at(-1)) : 0 }, (_, index) => ({ id: String(index), kind: index === 0 ? 'image' : 'file', name: `attachment-${index}.txt` })),
    onAttachRemove: vi.fn(),
    ...(withOpener ? { onOpenConversation: vi.fn(), conversationLabel: messages.todayAstra.openConversation } : {}),
    ...(scenario === 'retry' ? { onRetry: vi.fn() } : {}),
  } as ComposerProps

}

interface PillGeometry {
  pill: { left: number; right: number; height: number }
  documentWidth: number
  input: { width: number; contentWidth: number; height: number; scrollHeight: number; maximumHeight: number; placeholderWidth: number } | null
  controls: { left: number; right: number; top: number; bottom: number; width: number; height: number }[]
}

function assertPillGeometry(measured: PillGeometry, context: { width: number; fontScale: number; withOpener: boolean; scenario: GeometryScenario }) {
  const { width, fontScale, withOpener, scenario } = context
  const evidence = JSON.stringify({ width, fontScale, withOpener, scenario, measured })
  expect(measured.documentWidth, evidence).toBe(width)
  expect(measured.controls).toHaveLength(withOpener ? 3 : 2)
  for (const [index, control] of measured.controls.entries()) {
    expect(control.width, evidence).toBe(48)
    expect(control.height, evidence).toBe(48)
    expect(control.left, evidence).toBeGreaterThanOrEqual(measured.pill.left)
    expect(control.right, evidence).toBeLessThanOrEqual(measured.pill.right)
    if (index > 0) expect(control.left, evidence).toBeGreaterThanOrEqual(measured.controls[index - 1]!.right)
  }
  expect(new Set(measured.controls.map((control) => control.top)).size, evidence).toBe(1)
  if (measured.input) {
    expect(measured.input.width, evidence).toBeGreaterThanOrEqual(136)
    if (fontScale === 1) {
      expect(measured.input.placeholderWidth, evidence).toBeLessThanOrEqual(measured.input.contentWidth)
    }
    if (scenario === 'longText') {
      expect(measured.input.height, evidence).toBe(measured.input.maximumHeight)
      expect(measured.input.scrollHeight, evidence).toBeGreaterThan(measured.input.height)
    } else if (scenario !== 'typing') {
      if (measured.input.placeholderWidth > measured.input.contentWidth) expect(measured.pill.height, evidence).toBeGreaterThan(24 * fontScale + 32)
      else expect(measured.pill.height, evidence).toBe(24 * fontScale + 32)
      expect(measured.input.scrollHeight, evidence).toBeLessThanOrEqual(measured.input.height)
    }
  } else expect(measured.pill.height, evidence).toBe(56)
}

const chipScenarios = ['empty', 'pending', 'returning', 'completed', 'habitDetail', 'longTitle', 'unbrokenTitle', 'namedActions'] as const

function liveChipSuggestions(scenario: typeof chipScenarios[number], messages: typeof en) {
  const surface = scenario === 'habitDetail' ? 'habitDetail' as const : 'today' as const
  const title = scenario === 'unbrokenTitle' ? 'a'.repeat(200) : scenario === 'longTitle'
    ? messages === en ? 'Read a chapter of my favorite book before breakfast' : 'Ler um capítulo do meu livro favorito antes do café da manhã'
    : messages === en ? 'Read' : 'Ler'
  const habits = scenario === 'empty' || scenario === 'habitDetail' ? [] : [createMockHabit({
    title, isOverdue: scenario === 'pending', hasSubHabits: true, isCompleted: scenario === 'completed',
  })]
  const chipState = { surface, status: 'success' as const, habits, totalHabitCount: habits.length,
    profile: createMockProfile({ lastCompletionDate: scenario === 'returning' ? '2026-09-01' : null }),
    now: new Date('2026-09-10T12:00:00Z'), detailHabit: { title, checklistItems: [] } }
  const namedHabit = createMockHabit({ title: 'a'.repeat(200), hasSubHabits: true, isOverdue: true })
  const chips = scenario === 'namedActions' ? [
    buildComposerChips({ ...chipState, habits: [namedHabit], totalHabitCount: 1 }),
    buildComposerChips({ ...chipState, habits: [namedHabit], totalHabitCount: 1, profile: createMockProfile({ lastCompletionDate: '2026-09-01' }) }),
    buildComposerChips({ ...chipState, habits: [{ ...namedHabit, isCompleted: true }], totalHabitCount: 1 }),
    buildComposerChips({ ...chipState, surface: 'progress', habits: [namedHabit], totalHabitCount: 1 }),
  ].flat().filter((chip, index, all) => chip.params && all.findIndex(candidate => candidate.id === chip.id) === index)
    : buildComposerChips(chipState)
  return { surface, suggestions: chips.map(({ id, params }) => {
    const [group, name] = id.split('.')
    const labels: Record<string, string> = messages.shell.composer.chips[group as keyof typeof messages.shell.composer.chips]
    return { id, label: labels[name!]!.replace('{title}', params?.title ?? '') }
  }) }
}

describe('Composer compact geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let composerScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${theme}}`
    const buildOptions = {
      stdin: { contents: `import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
        import { Composer } from './components/shell/composer';
        const props = JSON.parse(document.getElementById('configuration').textContent);
        function MountedComposer() {
          const [value, setValue] = useState(props.value);
          return React.createElement(Composer, {
          ...props, value, onChangeValue: setValue, onSend: () => {},
          onOpenConversation: props.conversationLabel ? () => {} : undefined,
          onAttachFile: props.attachWords ? () => {} : undefined,
          onAttachImage: props.attachWords ? () => {} : undefined,
          onAttachRemove: () => {},
          onVoice: props.voiceWords ? () => {} : undefined,
          attachWords: props.attachWords ? { ...props.attachWords,
            remove: name => props.attachmentRemoveTemplate.replace('{name}', name) } : undefined,
          suggestions: props.suggestions.map(chip => ({ ...chip, onSelect: () => {},
            icon: React.createElement('svg', { width: 20, height: 20, 'aria-hidden': true }) }))
          });
        }
        createRoot(document.getElementById('root')).render(React.createElement(MountedComposer));`, resolveDir: process.cwd(), loader: 'tsx' },
      bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    }
    composerScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      const options = JSON.parse(process.argv[1]);
      options.plugins = [{ name: 'composer-overlay-boundaries', setup(builder) {
        builder.onResolve({ filter: /^@\\/components\\/ui\\/(menu|sheet)$/ }, args => ({ path: args.path, namespace: 'boundary' }));
        builder.onLoad({ filter: /.*/, namespace: 'boundary' }, () => ({ contents: 'export const Menu = () => null; export const Sheet = () => null;', loader: 'js' }));
      } }];
      const result = await build(options);
      process.stdout.write(result.outputFiles[0].text);
    `, JSON.stringify(buildOptions)], { maxBuffer: 10 * 1024 * 1024 }).toString()
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 412, 1352].flatMap(width => [false, true].flatMap(withOpener =>
    ['ltr', 'rtl'].map(direction => ({ width, withOpener, direction })),
  )))('pads the caret and placeholder at $width with opener $withOpener in $direction', async ({ width, withOpener, direction }) => {
    const configuration = geometryProps('idle', en, withOpener)
    if (direction === 'rtl') configuration.words = { ...configuration.words, placeholder: 'אבג' }
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" dir="${direction}"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const field = page.locator('[data-composer-input]')
      const placeholder = await field.evaluate(measureFieldInset)
      expect.soft(placeholder.paddingStart).toBe(8)
      expect.soft(placeholder.paddingEnd).toBe(8)
      expect.soft(placeholder.inset).toBe(8)
      expect.soft(placeholder.pillInset).toBe(4 + (withOpener ? 48 : 0) + 8)
      const box = (await field.boundingBox())!
      await page.mouse.click(direction === 'rtl' ? box.x + box.width - 2 : box.x + 2, box.y + box.height / 2)
      expect(await field.evaluate(element => element === document.activeElement)).toBe(true)
      await field.fill((direction === 'rtl' ? 'אבג ' : 'Astra ').repeat(10).trim())
      const typed = await field.evaluate(measureFieldInset)
      expect(typed.inset).toBe(placeholder.inset)
      expect(typed.contentWidth).toBe(box.width - 16)
      if (width === 320) expect(typed.height).toBeGreaterThan(placeholder.height)
      expect(typed.height).toBeLessThanOrEqual(typed.maximumHeight)
      expect(typed.scrollHeight).toBe(typed.height)
      for (const control of await page.locator('[data-composer-input-row] button').all()) {
        const bounds = (await control.boundingBox())!
        expect(bounds.width).toBe(48)
        expect(bounds.height).toBe(48)
      }
    } finally { await page.close() }
  })

  it.each([en, ptBR].flatMap(messages => (['offline', 'atLimit'] as const).flatMap(scenario =>
    [{ fontScale: 2, width: 320, kept: true }, { fontScale: 1, width: 600, kept: true },
      { fontScale: 1, width: 240, kept: false }].map(size => ({ messages, scenario, ...size })),
  )))('updates the mounted $scenario placeholder at $fontScale text and $width width', async ({ messages, scenario, fontScale, width, kept }) => {
    const configuration = geometryProps(scenario, messages, true)
    const page = await browser.newPage({ viewport: { width, height: 740 } })
    const view = render(<Composer {...geometryProps('idle', messages, true)} />)
    let restoreContext: (() => void) | undefined
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const measured = await page.locator('[data-composer-input]').evaluate((element, placeholder) => {
        const style = getComputedStyle(element)
        const context = document.createElement('canvas').getContext('2d')!
        context.font = style.font
        context.letterSpacing = style.letterSpacing
        const metrics = context.measureText(placeholder)
        return { clientWidth: element.clientWidth, font: style.font, fontSize: style.fontSize,
          letterSpacing: style.letterSpacing, paddingInlineStart: style.paddingInlineStart, paddingInlineEnd: style.paddingInlineEnd,
          metrics: Object.fromEntries(Object.keys(Object.getPrototypeOf(metrics))
            .filter(key => typeof Reflect.get(metrics, key) === 'number').map(key => [key, Reflect.get(metrics, key)])) }
      }, configuration.words.placeholder)
      const field = screen.getByRole('textbox')
      Object.assign(field.style, { font: measured.font, fontSize: measured.fontSize, letterSpacing: measured.letterSpacing,
        paddingInlineStart: measured.paddingInlineStart, paddingInlineEnd: measured.paddingInlineEnd })
      const widthSpy = vi.spyOn(field, 'clientWidth', 'get').mockReturnValue(measured.clientWidth)
      const measureText = vi.fn(() => measured.metrics as unknown as TextMetrics)
      const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '', letterSpacing: '', measureText,
      } as unknown as CanvasRenderingContext2D)
      restoreContext = () => contextSpy.mockRestore()
      view.rerender(<Composer {...configuration} />)
      const style = getComputedStyle(field)
      const availableWidth = measured.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd)
      expect(parseFloat(style.fontSize)).toBe(16 * fontScale)
      expect(measured.metrics.width! <= availableWidth).toBe(width === 600)
      expect(field).toHaveAttribute('placeholder', kept ? configuration.words.placeholder : '')
      if (fontScale === 2) expect(measureText).not.toHaveBeenCalled()
      else expect(measureText).toHaveBeenCalledWith(configuration.words.placeholder)
      widthSpy.mockRestore()
    } finally { restoreContext?.(); view.unmount(); await page.close() }
  })

  it.each([ptBR, en].flatMap(messages => [false, true].flatMap(withOpener =>
    (['idle', 'offline', 'atLimit'] as const).map(scenario => ({ messages, withOpener, scenario })),
  )))('keeps the placeholder whole through text resizing while $scenario with opener $withOpener', async ({ messages, withOpener, scenario }) => {
    const configuration = geometryProps(scenario, messages, withOpener)
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const field = page.locator('[data-composer-input]')
      for (const fontScale of [1, 1.3, 1.5, 2, 1]) {
        await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px` }, fontScale)
        await vi.waitFor(async () => {
          const measured = await field.evaluate(element => {
            const input = element as HTMLTextAreaElement
            const style = getComputedStyle(input)
            const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
            const canvas = document.createElement('canvas').getContext('2d')!
            canvas.font = style.font
            canvas.letterSpacing = style.letterSpacing
            return { placeholder: input.placeholder, width: input.clientWidth, scrollWidth: input.scrollWidth,
              height: input.clientHeight, scrollHeight: input.scrollHeight,
              singleLineHeight: parseFloat(style.lineHeight) + padding,
              textWidth: canvas.measureText(input.placeholder).width,
              pillHeight: input.parentElement!.getBoundingClientRect().height }
          })
          const evidence = JSON.stringify({ scenario, withOpener, fontScale, measured })
          expect(measured.scrollWidth, evidence).toBeLessThanOrEqual(measured.width)
          expect(measured.scrollHeight, evidence).toBeLessThanOrEqual(measured.height)
          expect(measured.pillHeight, evidence).toBeGreaterThanOrEqual(56)
          expect(measured.pillHeight, evidence).toBeGreaterThanOrEqual(measured.height + 8)
          if (fontScale > 1.3) {
            expect(measured.placeholder, evidence).toBe(configuration.words.placeholder)
            if (measured.textWidth > measured.width) expect(measured.height, evidence).toBeGreaterThan(measured.singleLineHeight)
          } else expect(measured.height, evidence).toBeCloseTo(measured.singleLineHeight, 0)
        })
        if (scenario === 'idle' && fontScale === 2) {
          const placeholderHeight = await field.evaluate(element => element.clientHeight)
          await field.fill('Oi')
          await vi.waitFor(async () => {
            expect(await field.inputValue()).toBe('Oi')
            expect(await field.evaluate(element => element.clientHeight)).toBe(72)
          })
          await field.fill('Mensagem longa\n'.repeat(12))
          await vi.waitFor(async () => {
            const typed = await field.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight }))
            expect(typed.height).toBe(264)
            expect(typed.scrollHeight).toBeGreaterThan(typed.height)
          })
          await field.fill('')
          await vi.waitFor(async () => expect(await field.evaluate(element => element.clientHeight)).toBe(placeholderHeight))
        }
      }
    } finally { await page.close() }
  })

  it.each([en, ptBR].flatMap(messages => ['idle', 'offline', 'atLimit'].map(state => ({ messages, state }))))(
    'shows a whole state placeholder or omits it as the pill resizes: $state', async ({ messages, state }) => {
      const configuration = geometryProps(state as GeometryScenario, messages, true)
      const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
      try {
        await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const field = page.locator('[data-composer-input]')
        for (const width of [320, 360, 384, 412, 600, 320]) {
          await page.setViewportSize({ width, height: 740 })
          await vi.waitFor(async () => {
            const measured = await field.evaluate(element => {
              const input = element as HTMLTextAreaElement
              const style = getComputedStyle(input)
              const context = document.createElement('canvas').getContext('2d')!
              context.font = style.font
              context.letterSpacing = style.letterSpacing
              return { placeholder: input.placeholder, textWidth: context.measureText(input.placeholder).width,
                availableWidth: input.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd) }
            })
            expect(measured.textWidth, JSON.stringify({ width, state, measured })).toBeLessThanOrEqual(measured.availableWidth)
            if (state === 'idle' || width === 600) expect(measured.placeholder).toBe(configuration.words.placeholder)
          })
        }
      } finally { await page.close() }
    }, 30_000,
  )

  it('releases chip allocation when a mounted habit detail strip grows and shrinks', async () => {
    const { suggestions } = liveChipSuggestions('habitDetail', en)
    expect(suggestions.map(chip => chip.id)).toEqual(['habitDetail.pauseThisWeek', 'habitDetail.rename'])
    const configuration = { state: 'idle', value: '', suggestions, words: en.shell.composer }
    const page = await browser.newPage({ viewport: { width: 600, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" style="width:208px"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const strip = page.getByRole('group', { name: en.shell.composer.suggestionsLabel })
      const measure = () => strip.evaluate(element => {
        element.scrollLeft = 0
        const bounds = element.getBoundingClientRect()
        const chips = [...element.querySelectorAll('button')].map(button => {
          const chip = button.getBoundingClientRect()
          return { left: chip.left - bounds.left, right: chip.right - bounds.left, width: chip.width }
        })
        const partial = chips.find(chip => chip.left < bounds.width && chip.right > bounds.width)
        return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
          available: element.parentElement!.getBoundingClientRect().width,
          chips, peek: partial ? bounds.width - partial.left : 0 }
      })
      for (const width of [208, 459, 208, 459]) {
        await page.locator('#root').evaluate((element, nextWidth) => { element.style.width = `${nextWidth}px` }, width)
        await vi.waitFor(async () => {
          const measured = await measure()
          expect(measured.clientWidth).toBe(width - 32)
          expect(measured.available).toBe(measured.clientWidth)
          if (width === 459) {
            expect(measured.scrollWidth, JSON.stringify(measured)).toBe(measured.clientWidth)
            expect(measured.chips.every(chip => chip.left >= 0 && chip.right <= measured.clientWidth)).toBe(true)
          } else {
            expect(measured.scrollWidth).toBeGreaterThan(measured.clientWidth)
            expect(measured.peek).toBeGreaterThanOrEqual(16)
            expect(measured.peek).toBeLessThanOrEqual(32)
          }
        })
      }
      const resized = await measure()
      await page.setContent(`<style>${stylesheet}</style><div id="root" style="width:459px"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      await vi.waitFor(async () => { expect(await measure()).toEqual(resized) })
    } finally { await page.close() }
  })

  it.each([en, ptBR])('reserves a 16 to 32 pixel peek for live Today chips at 320 with doubled text', async (messages) => {
    const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [], totalHabitCount: 0,
      profile: createMockProfile() })
    const labels = messages.shell.composer.chips.today
    const suggestions = toComposerSuggestions(chips.map(({ id }) => ({ id,
      label: labels[id.replace('today.', '') as keyof typeof labels], onSelect: vi.fn() })))

    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:32px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ state: 'idle', value: '', suggestions, words: messages.shell.composer })}</script>`)
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
        return { availableWidth: viewport.width, controls, peek: partial ? viewport.right - partial.left : 0 }
      })
      const evidence = JSON.stringify(measured)
      expect(measured.peek, evidence).toBeGreaterThanOrEqual(16)
      expect(measured.peek, evidence).toBeLessThanOrEqual(32)
    } finally { await page.close() }
  })


  it.each([en, ptBR].flatMap(messages => [1, 2].flatMap(fontScale =>
    chipScenarios.map(scenario => ({ messages, fontScale, scenario })))))(
    'keeps $scenario chips whole with a measured peek at $fontScale text across compact widths', async ({ messages, fontScale, scenario }) => {
      const { surface, suggestions } = liveChipSuggestions(scenario, messages)
      const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
      try {
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ state: 'idle', value: '', suggestions, words: messages.shell.composer })}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const strip = page.getByRole('group', { name: messages.shell.composer.suggestionsLabel })
        await strip.waitFor()
        for (const width of [320, 360, 384, 412, 640, 768, 900, 1023, 412, 320]) {
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
              return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height,
                label: text.textContent, accessibleName: button.getAttribute('aria-label'), lines: lines.length, textOverflow: style.textOverflow,
                textFits: lines.every(line => line.left >= bounds.left && line.right <= bounds.right && line.bottom <= bounds.bottom),
                iconTop: button.querySelector('svg')!.getBoundingClientRect().top, firstLineTop: lines[0]!.top }
            })
            const partial = controls.find(control => control.left < viewport.right && control.right > viewport.right)
            return { viewport: viewport.width, available: element.parentElement!.getBoundingClientRect().width,
              overflow: element.scrollWidth > element.clientWidth, peek: partial ? viewport.right - partial.left : 0,
              documentWidth: document.documentElement.scrollWidth, controls }
          })
          const evidence = JSON.stringify({ width, fontScale, surface, scenario, measured })
          expect(measured.documentWidth, evidence).toBe(width)
          expect(measured.viewport, evidence).toBeCloseTo(measured.available, 1)
          if (measured.overflow) {
            expect(measured.peek, evidence).toBeGreaterThanOrEqual(16)
            expect(measured.peek, evidence).toBeLessThanOrEqual(32)
            expect(measured.controls[0]!.right - measured.controls[0]!.left, evidence).toBeLessThan(measured.viewport)
          } else expect(measured.viewport, evidence).toBeCloseTo(measured.available, 1)
          for (const control of measured.controls) {
            expect(control.textFits, evidence).toBe(true)
            expect(control.accessibleName, evidence).toBe(control.label)
            expect(control.textOverflow, evidence).not.toBe('ellipsis')
            expect(control.height, evidence).toBeGreaterThanOrEqual(48)
            expect(control.width, evidence).toBeLessThanOrEqual(measured.viewport)
            if (fontScale === 1) expect(control.lines, evidence).toBe(1)
            if (control.lines > 1) expect(Math.abs(control.iconTop - control.firstLineTop), evidence).toBeLessThanOrEqual(8)
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

  it.each([412, 1280].flatMap((width) => [false, true].map((forcedColors) => ({ width, forcedColors }))))(
    'draws one field and action focus ring at $width with forced colors $forcedColors', async ({ width, forcedColors }) => {
      const view = render(<Composer {...geometryProps('typing', en, false)} />)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.emulateMedia({ forcedColors: forcedColors ? 'active' : 'none' })
        await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
        await page.keyboard.press('Tab')
        const field = page.getByRole('textbox')
        expect(await field.evaluate((element) => element === document.activeElement)).toBe(true)
        expect(await readFieldIndicators(field, '[data-composer-input-row]', { forcedColors })).toHaveLength(1)
        for (const name of [en.shell.composer.actions, en.shell.composer.send]) {
          await page.keyboard.press('Tab')
          const control = page.getByRole('button', { name, exact: true })
          expect(await control.evaluate((element) => element === document.activeElement)).toBe(true)
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
          const outline = await control.evaluate((element) => {
            const style = getComputedStyle(element)
            const sample = document.createElement('span')
            sample.style.color = 'CanvasText'
            document.body.append(sample)
            const systemColor = getComputedStyle(sample).color
            sample.remove()
            return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor, systemColor }
          })
          expect(outline.width).toBe('2px')
          expect(outline.style).toBe('solid')
          expect(outline.color).toBe(forcedColors ? outline.systemColor : 'rgb(196, 83, 15)')
        }
        fireEvent.click(screen.getByRole('button', { name: en.shell.composer.actions }))
        const menu = await screen.findByRole('menu')
        const markup = width < 900 ? menu.closest('[role="dialog"]')!.outerHTML : menu.outerHTML
        await page.setContent(`<style>${stylesheet}</style>${markup}`)
        await page.keyboard.press('Tab')
        for (const name of [en.shell.composer.attach.image, en.shell.composer.attach.file, en.shell.composer.voice.start]) {
          const control = page.getByRole('menuitem', { name, exact: true })
          await control.focus()
          expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
        }
      } finally { await page.close(); view.unmount() }
    },
  )

  it.each([412, 1280].flatMap((width) => (['dark', 'light'] as const).map((mode) => ({ width, mode }))))(
    'keeps disabled attachment menu fills at rest on hover at $width in $mode', async ({ width, mode }) => {
      const view = render(<Composer {...geometryProps('atLimit', en, false)} />)
      fireEvent.click(screen.getByRole('button', { name: en.shell.composer.actions }))
      const menu = await screen.findByRole('menu')
      const markup = width < 900 ? menu.closest('[role="dialog"]')!.outerHTML : menu.outerHTML
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}:root{${theme}}.orbit-menu-item{--test-hover:0}.orbit-menu-item:hover{--test-hover:1}</style>${markup}`)
        for (const name of [en.shell.composer.attach.file, en.shell.composer.attach.image]) {
          const control = page.getByRole('menuitem', { name, exact: true })
          expect(await control.isDisabled()).toBe(true)
          await page.mouse.move(0, 914)
          const restingFill = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
          expect(restingFill).toBe('rgba(0, 0, 0, 0)')
          const bounds = (await control.boundingBox())!
          await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2)
          await page.waitForTimeout(300)
          expect(await control.evaluate((element) => getComputedStyle(element).getPropertyValue('--test-hover').trim())).toBe('1')
          expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(restingFill)
        }
      } finally { await page.close(); view.unmount() }
    },
  )

  it.each([412, 1280].flatMap((width) => [1, 2].map((fontScale) => ({ width, fontScale }))))(
    'keeps menu rows at their minimum height and grows for large text at $width and $fontScale', async ({ width, fontScale }) => {
      const presentation = width < 900 ? { presentation: 'sheet' as const }
        : { presentation: 'anchored' as const, anchorRef: createRef<HTMLButtonElement>() }
      const view = render(<Menu open {...presentation} title="Actions" items={[
        { id: 'file', label: en.shell.composer.attach.file, icon: 'file' },
        { id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
      ]} />)
      const menu = await screen.findByRole('menu')
      const markup = width < 900 ? menu.closest('[role="dialog"]')!.outerHTML : menu.outerHTML
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style>${markup}`)
        for (const item of await page.getByRole('menuitem').all()) {
          const measured = await item.evaluate((element) => {
            const style = getComputedStyle(element)
            return { height: element.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight),
              padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom), border: parseFloat(style.borderTopWidth) }
          })
          const minimum = width < 900 ? 56 : 48
          expect(measured.height).toBeCloseTo(Math.max(minimum, measured.lineHeight + measured.padding + measured.border), 1)
          if (fontScale === 1) expect(measured.height).toBe(minimum)
          if (width >= 900 && fontScale === 2) expect(measured.height).toBeGreaterThan(minimum)
        }
      } finally { await page.close(); view.unmount() }
    },
  )

  it.each(['reduce', 'no-preference'] as const)('keeps the press target intact with %s motion', async (reducedMotion) => {
    const view = render(<Composer {...geometryProps('idle', en, true)} />)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.emulateMedia({ reducedMotion })
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      const target = page.locator('[data-open-conversation]')
      const bounds = (await target.boundingBox())!
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(250)
      expect((await target.boundingBox())!.width).toBe(48)
      const glyphWidth = (await target.locator('svg').boundingBox())!.width
      expect(glyphWidth).toBeCloseTo(reducedMotion === 'reduce' ? 20 : 19.2, 1)
      await page.mouse.up()
    } finally { await page.close(); view.unmount() }
  })

  it.each([en, ptBR])('keeps composer sheet titles whole and close targets at 48 with doubled text', async (messages) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      for (const surface of ['actions', 'attachment'] as const) {
        const props = geometryProps('tray1', messages, true)
        const view = render(<Composer {...props} />)
        fireEvent.click(screen.getByRole('button', { name: surface === 'actions' ? messages.shell.composer.actions : props.attachments![0]!.name }))
        const dialog = await screen.findByRole('dialog')
        const markup = dialog.outerHTML
        view.unmount()
        await page.setContent(`<style>${stylesheet}html{font-size:32px}</style>${markup}`)
        await loadAppFonts(page)
        const header = await page.locator('.orbit-sheet-title').evaluate((title) => {
          const font = getComputedStyle(title).font
          const canvas = document.createElement('canvas').getContext('2d')!
          canvas.font = font
          const text = canvas.measureText(title.textContent!).width
          canvas.font = '500 44px Geist'
          return { available: title.clientWidth, text, nativeText: canvas.measureText(title.textContent!).width, fontSize: getComputedStyle(title).fontSize }
        })
        expect(header.fontSize).toBe('44px')
        expect(header.text, JSON.stringify({ surface, header })).toBeLessThanOrEqual(header.available)
        expect(header.nativeText, JSON.stringify({ surface, header })).toBeLessThanOrEqual(header.available)
        const close = page.getByRole('button', { name: 'common.close' })
        const bounds = (await close.boundingBox())!
        expect(bounds.width).toBeGreaterThanOrEqual(48)
        expect(bounds.height).toBeGreaterThanOrEqual(48)
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        await page.mouse.down()
        await page.waitForTimeout(250)
        expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(48)
        await page.mouse.up()
        for (const item of await page.getByRole('menuitem').all()) {
          expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(48)
        }
      }
    } finally { await page.close() }
  })

  it.each(cases)('keeps controls inside one pill at $width and $fontScale text size in both locales', async ({ width, messages, fontScale }) => {
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      for (const withOpener of [true, false]) for (const scenario of ['idle', 'typing', 'longText', 'sending', 'recording', 'transcribing', 'tray1', 'tray2', 'tray3', 'atLimit', 'offline', 'retry'] as const) {
        const props = geometryProps(scenario, messages, withOpener)
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ ...props, attachmentRemoveTemplate: messages.shell.composer.attach.remove })}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const measured = await page.evaluate(() => {
          const pill = document.querySelector<HTMLElement>('[data-composer-input-row]')!
          const bounds = pill.getBoundingClientRect()
          const input = pill.querySelector<HTMLTextAreaElement>('textarea')
          const canvas = document.createElement('canvas').getContext('2d')!
          if (input) canvas.font = getComputedStyle(input).font
          return {
            pill: { left: bounds.left, right: bounds.right, height: bounds.height },
            documentWidth: document.documentElement.scrollWidth,
            input: input ? { width: input.clientWidth, height: input.clientHeight, scrollHeight: input.scrollHeight,
              contentWidth: input.clientWidth - parseFloat(getComputedStyle(input).paddingInlineStart) - parseFloat(getComputedStyle(input).paddingInlineEnd),
              maximumHeight: parseFloat(getComputedStyle(input).maxHeight), placeholderWidth: canvas.measureText(input.placeholder).width } : null,
            controls: [...pill.querySelectorAll('button')].map((button) => {
              const rectangle = button.getBoundingClientRect()
              return { left: rectangle.left, right: rectangle.right, top: rectangle.top, bottom: rectangle.bottom, width: rectangle.width, height: rectangle.height }
            }),
          }
        })
        assertPillGeometry(measured, { width, fontScale, withOpener, scenario })

      }
    } finally { await page.close() }
  }, 30_000)

  it.each([412, 1280].flatMap((width) => (['dark', 'light'] as const).flatMap((mode) =>
    (['idle', 'sending', 'offline', 'atLimit', 'transcribing', 'recording'] as const).map((state) => ({ width, mode, state })))))(
    'paints hover only on enabled menu and stop controls while $state at $width in $mode', async ({ width, mode, state }) => {
      const statuses = { idle: { state: 'idle' }, sending: { state: 'sending' }, recording: { state: 'recording' }, transcribing: { state: 'transcribing' }, offline: { state: 'offline', limitReason: en.shell.composer.offline.reason }, atLimit: { state: 'atLimit', limitReason: en.shell.composer.limit.reason } } as const
      const { container } = render(<Composer {...statuses[state]} value="" suggestions={[]} words={en.shell.composer}
        onChangeValue={vi.fn()} onSend={vi.fn()} onVoice={vi.fn()} voiceWords={en.shell.composer.voice}
        onAttachFile={vi.fn()} onAttachImage={vi.fn()} attachWords={{ ...en.shell.composer.attach, remove: (name) => name }} />)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<style>${stylesheet}:root{${theme}}[data-composer-controls] button{--test-hover:0}[data-composer-controls] button:hover{--test-hover:1}</style>${container.innerHTML}`)
        const control = page.locator('[data-composer-controls] button')
        expect(await control.count()).toBe(1)
        const restingFill = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
        const bounds = (await control.boundingBox())!
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 4)
        await page.waitForTimeout(300)
        expect(await control.evaluate((element) => getComputedStyle(element).getPropertyValue('--test-hover').trim())).toBe('1')
        const hoveredFill = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
        if (await control.isDisabled()) expect(hoveredFill).toBe(restingFill)
        else expect(hoveredFill).not.toBe(restingFill)
      } finally { await page.close() }
    },
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
