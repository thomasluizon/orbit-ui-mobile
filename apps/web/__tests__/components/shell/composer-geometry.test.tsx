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
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { toComposerSuggestions, type ComposerProps } from '@orbit/shared/contracts/composer'
import { Composer } from '@/components/shell/composer'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { Menu } from '@/components/ui/menu'
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
    suggestions: [], words: { ...messages.shell.composer, ...(state === 'offline' ? { placeholder: messages.shell.composer.offline.placeholder } : {}) },
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
  input: { width: number; height: number; scrollHeight: number; maximumHeight: number; placeholderWidth: number } | null
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
    expect(measured.input.placeholderWidth, evidence).toBeLessThanOrEqual(measured.input.width)
    if (scenario === 'longText') {
      expect(measured.input.height, evidence).toBe(measured.input.maximumHeight)
      expect(measured.input.scrollHeight, evidence).toBeGreaterThan(measured.input.height)
    } else if (scenario !== 'typing') expect(measured.pill.height, evidence).toBe(24 * fontScale + 32)
  } else expect(measured.pill.height, evidence).toBe(56)
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
      stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import { Composer } from './components/shell/composer';
        const props = JSON.parse(document.getElementById('configuration').textContent);
        createRoot(document.getElementById('root')).render(React.createElement(Composer, {
          ...props, onChangeValue: () => {}, onSend: () => {},
          suggestions: props.suggestions.map(chip => ({ ...chip, onSelect: () => {},
            icon: React.createElement('svg', { width: 20, height: 20, 'aria-hidden': true }) }))
        }));`, resolveDir: process.cwd(), loader: 'tsx' },
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
    (['today', 'habitDetail'] as const).map(surface => ({ messages, fontScale, surface })))))(
    'keeps $surface chips whole with a measured peek at $fontScale text across compact widths', async ({ messages, fontScale, surface }) => {
      const chips = buildComposerChips({ surface, status: 'success', habits: [], totalHabitCount: 0,
        profile: createMockProfile(), detailHabit: { title: 'Reading', checklistItems: [] } })
      const labels = messages.shell.composer.chips[surface]
      const suggestions = chips.map(({ id }) => ({ id, label: labels[id.split('.')[1] as keyof typeof labels] }))
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
                label: text.textContent, lines: lines.length, textOverflow: style.textOverflow,
                textFits: lines.every(line => line.left >= bounds.left && line.right <= bounds.right && line.bottom <= bounds.bottom),
                iconTop: button.querySelector('svg')!.getBoundingClientRect().top, firstLineTop: lines[0]!.top }
            })
            const partial = controls.find(control => control.left < viewport.right && control.right > viewport.right)
            return { viewport: viewport.width, available: element.parentElement!.getBoundingClientRect().width,
              overflow: element.scrollWidth > element.clientWidth, peek: partial ? viewport.right - partial.left : 0,
              documentWidth: document.documentElement.scrollWidth, controls }
          })
          const evidence = JSON.stringify({ width, fontScale, surface, measured })
          expect(measured.documentWidth, evidence).toBe(width)
          if (measured.overflow) {
            expect(measured.peek, evidence).toBeGreaterThanOrEqual(16)
            expect(measured.peek, evidence).toBeLessThanOrEqual(32)
            expect(measured.controls[0]!.right - measured.controls[0]!.left, evidence).toBeLessThan(measured.viewport)
          } else expect(measured.viewport, evidence).toBeCloseTo(measured.available, 1)
          for (const control of measured.controls) {
            expect(control.textFits, evidence).toBe(true)
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
          const minimum = width < 900 ? 56 : 44
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
        const view = render(<Composer {...props} />)
        const markup = view.container.innerHTML
        view.unmount()
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style>${markup}`)
        await loadAppFonts(page)
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
