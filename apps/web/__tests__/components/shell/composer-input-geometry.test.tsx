import { composerMessages, geometryProps, liveChipSuggestions, type GeometryScenario, compileComposerGeometry } from '@/__tests__/support/composer-geometry'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Composer } from '@/components/shell/composer'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { measureFieldInset } from '@/e2e/layout/field-inset-geometry'
import { composerPlaceholderFits } from '@/e2e/layout/composer-column-paint'

async function readTextActionLayout(page: import('@playwright/test').Page) {
  return page.locator('[data-composer-input]').evaluate(element => {
    const style = getComputedStyle(element)
    const row = element.closest<HTMLElement>('[data-composer-input-row]')!
    const rowStyle = getComputedStyle(row)
    const trailing = row.querySelector<HTMLElement>('[data-composer-trailing-controls]')!
    const controls = trailing.querySelector<HTMLElement>('[data-composer-text-controls]')!
    const controlsStyle = getComputedStyle(controls)
    const slotWidth = parseFloat(controlsStyle.minWidth)
    const gap = parseFloat(controlsStyle.columnGap)
    const inlineWidth = controls.getBoundingClientRect().width
    const minimumWidth = row.querySelector('[data-composer-input-minimum]')!.getBoundingClientRect().width
    const entryWidth = row.querySelector('[data-open-conversation]')?.getBoundingClientRect().width ?? 0
    const sendWidth = trailing.lastElementChild!.getBoundingClientRect().width
    const context = document.createElement('canvas').getContext('2d')!
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    context.letterSpacing = style.letterSpacing
    const metrics = context.measureText(element.getAttribute('placeholder')!)
    const placeholderStyle = getComputedStyle(element, '::placeholder')
    const mirror = document.createElement('div')
    Object.assign(mirror.style, { width: `${element.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd)}px`,
      font: style.font, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
      whiteSpace: placeholderStyle.whiteSpace, overflowWrap: placeholderStyle.overflowWrap })
    mirror.textContent = element.getAttribute('placeholder')
    document.body.append(mirror)
    const range = document.createRange()
    range.selectNodeContents(mirror)
    const placeholderFragments = [...range.getClientRects()].map(rectangle => ({ left: rectangle.left, right: rectangle.right, width: rectangle.width, height: rectangle.height }))
    const mirrorBounds = mirror.getBoundingClientRect().toJSON()
    mirror.remove()
    return { clientWidth: element.clientWidth, rowWidth: row.clientWidth, entryWidth, sendWidth, inlineWidth, slotWidth, gap, minimumWidth,
      height: element.clientHeight, scrollHeight: element.scrollHeight, scrollWidth: element.scrollWidth, placeholderFragments, mirrorBounds,
      contentWidth: element.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd),
      placeholderInkWidth: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
      rowItems: [...row.children].map(child => ({
        owner: child.hasAttribute('data-composer-leading-controls') ? 'leading' : 'trailing',
        ...child.getBoundingClientRect().toJSON(),
      })),
      menuItems: JSON.parse(controls.querySelector('[data-composer-menu-items]')?.getAttribute('data-composer-menu-items') ?? '[]') as { id: string; label: string }[],
      rowPaddingStart: rowStyle.paddingInlineStart, rowPaddingEnd: rowStyle.paddingInlineEnd,
      trailingGap: getComputedStyle(trailing).columnGap,
      font: style.font, fontSize: style.fontSize, fontStyle: style.fontStyle, fontWeight: style.fontWeight, fontFamily: style.fontFamily,
      letterSpacing: style.letterSpacing, paddingInlineStart: style.paddingInlineStart, paddingInlineEnd: style.paddingInlineEnd,
      metrics: Object.fromEntries(Object.keys(Object.getPrototypeOf(metrics)).filter(key => typeof Reflect.get(metrics, key) === 'number').map(key => [key, Reflect.get(metrics, key)])) }
  })
}

async function expectNarrowMenuPaste(page: import('@playwright/test').Page, messages: typeof en) {
  const measured = await readTextActionLayout(page)
  const readText = vi.fn().mockResolvedValue('Pasted message')
  vi.stubGlobal('navigator', { clipboard: { readText } })
  function ControlledComposer() {
    const [value, setValue] = useState('')
    return <Composer {...geometryProps('tray1', messages, true)} value={value} onChangeValue={setValue} />
  }
  const view = render(<ControlledComposer />)
  const field = screen.getByRole('textbox') as HTMLTextAreaElement
  Object.assign(field.style, { font: measured.font, fontSize: measured.fontSize, fontStyle: measured.fontStyle,
    fontWeight: measured.fontWeight, fontFamily: measured.fontFamily, letterSpacing: measured.letterSpacing,
    paddingInlineStart: measured.paddingInlineStart, paddingInlineEnd: measured.paddingInlineEnd })
  const row = field.closest<HTMLElement>('[data-composer-input-row]')!
  Object.assign(row.style, { paddingInlineStart: measured.rowPaddingStart, paddingInlineEnd: measured.rowPaddingEnd })
  const trailing = row.querySelector<HTMLElement>('[data-composer-trailing-controls]')!
  const controls = trailing.querySelector<HTMLElement>('[data-composer-text-controls]')!
  trailing.style.columnGap = measured.trailingGap
  Object.assign(controls.style, { minWidth: `${measured.slotWidth}px`, columnGap: `${measured.gap}px` })
  const rowWidth = vi.spyOn(row, 'clientWidth', 'get').mockReturnValue(measured.rowWidth)
  const inputWidth = vi.spyOn(field, 'clientWidth', 'get').mockReturnValue(measured.clientWidth)
  const rectangles = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this === controls ? measured.inlineWidth
      : this.hasAttribute('data-composer-input-minimum') ? measured.minimumWidth
      : this.hasAttribute('data-open-conversation') ? measured.entryWidth : this === trailing.lastElementChild ? measured.sendWidth : measured.slotWidth
    return new DOMRect(0, 0, width, 48)
  })
  const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '', letterSpacing: '', measureText: () => measured.metrics,
  } as unknown as CanvasRenderingContext2D)
  try {
    await act(() => document.fonts.dispatchEvent(new Event('loadingdone')))
    expect(screen.queryByRole('button', { name: messages.shell.composer.paste })).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: messages.shell.composer.actions }), { button: 0, ctrlKey: false })
    const menu = await screen.findByRole('menu')
    const paste = within(menu).getAllByRole('menuitem')[0]!
    expect(paste).toHaveAccessibleName(messages.shell.composer.paste)
    expect(within(menu).getAllByRole('menuitem', { name: messages.shell.composer.paste })).toHaveLength(1)
    expect(paste.querySelector('[data-icon="clipboard"] svg')).not.toBeNull()
    fireEvent.click(paste)
    await waitFor(() => expect(field).toHaveValue('Pasted message'))
    expect(readText).toHaveBeenCalledOnce()
    await waitFor(() => expect(field).toHaveFocus())
    expect([field.selectionStart, field.selectionEnd]).toEqual([14, 14])
    expect(screen.queryByRole('button', { name: messages.shell.composer.clear })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: messages.shell.composer.actions }), { key: 'ArrowDown' })
    const clearMenu = await screen.findByRole('menu')
    const clear = within(clearMenu).getAllByRole('menuitem')[0]!
    expect(clear).toHaveAccessibleName(messages.shell.composer.clear)
    expect(within(clearMenu).getAllByRole('menuitem', { name: messages.shell.composer.clear })).toHaveLength(1)
    expect(clear.querySelector('[data-icon="x"] svg')).not.toBeNull()
    await waitFor(() => expect(clear).toHaveFocus())
    fireEvent.click(clear)
    await waitFor(() => expect(field).toHaveValue(''))
    await waitFor(() => expect(field).toHaveFocus())
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 0])
    expect(screen.getByText('attachment-0.txt')).toBeInTheDocument()
  } finally { rectangles.mockRestore(); rowWidth.mockRestore(); inputWidth.mockRestore(); contextSpy.mockRestore(); view.unmount(); vi.unstubAllGlobals() }
}

it.each([
  { locale: 'pt-BR', messages: ptBR, name: 'Abrir conversa' },
  { locale: 'en', messages: en, name: 'Open the conversation' },
])('names the conversation glyph in $locale', ({ messages, name }) => {
  const onOpenConversation = vi.fn()
  const view = render(<Composer {...geometryProps('idle', messages, true)} onOpenConversation={onOpenConversation} />)
  try {
    fireEvent.click(screen.getByRole('button', { name: name }))
    expect(onOpenConversation).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Abrir a conversa' })).not.toBeInTheDocument()
  } finally { view.unmount() }
})

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

  it.each([en, ptBR])('retains initial label and physical reservation geometry when text actions move into Add', async messages => {
    composerMessages.current = messages
    const configuration = { ...geometryProps('idle', messages, true), clipboardText: 'Clipboard text' }
    const markup = renderToString(<Composer {...configuration} />)
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root">${markup}</div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.locator('.orbit-menu-panel, .orbit-sheet-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      await loadAppFonts(page)
      const row = page.locator('[data-composer-input-row]')
      const measure = () => row.evaluate(element => ({
        row: element.getBoundingClientRect().toJSON(),
        input: element.querySelector('[data-composer-input]')!.getBoundingClientRect().toJSON(),
        label: element.querySelector('[data-composer-input-minimum]')!.getBoundingClientRect().toJSON(),
        slot: element.querySelector('[data-composer-text-action-slot]')!.getBoundingClientRect().toJSON(),
        controls: element.querySelector('[data-composer-text-controls]')!.getBoundingClientRect().toJSON(),
      }))
      const first = await measure()
      expect(first.slot.width).toBe(48)
      expect(first.controls.width).toBe(2 * 48 + INTERACTION_FILL_CLEARANCE)
      await page.addScriptTag({ content: composerScript })
      await page.locator('#root[data-composer-test-ready]').waitFor()
      await expect.poll(measure).toEqual(first)
      expect(await page.locator('[data-composer-text-action-slot] button').count()).toBe(0)
      expect(await page.locator('[data-composer-input]').evaluate(composerPlaceholderFits, 1)).toBe(true)
    } finally { composerMessages.current = en; await page.close() }
  })

  it.each([{ width: 600, scale: 1 }, { width: 412, scale: 1.5 }])(
    'calibrates visual-line geometry against the actual composer at $width and $scale text', async ({ width, scale }) => {
      const configuration = geometryProps('idle', en, true)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * scale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.locator('.orbit-menu-panel, .orbit-sheet-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const input = page.locator('[data-composer-input]')
        await expect.poll(() => input.evaluate(composerPlaceholderFits, scale)).toBe(true)
        const row = page.locator('[data-composer-input-row]')
        const arrangement = await row.evaluate(element => ({
          entry: element.querySelector('[data-open-conversation]')!.getBoundingClientRect().top,
          send: element.querySelector('[data-composer-trailing-controls]')!.lastElementChild!.getBoundingClientRect().top,
        }))
        expect(arrangement.send > arrangement.entry).toBe(scale > 1)
        const faults = [
          { selector: '[data-composer-controls] button', style: { width: '47px', minWidth: '47px', maxWidth: '47px' } },
          { selector: '[data-composer-controls] button', style: { height: '47px', minHeight: '47px', maxHeight: '47px' } },
          { selector: '[data-composer-trailing-controls] > button', style: { marginInlineStart: '-8px' } },
          { selector: '[data-composer-trailing-controls]', style: { flexDirection: 'row-reverse' } },
          { selector: '[data-open-conversation]', style: { position: 'relative', top: '2px' } },
          { selector: '[data-composer-input-row]', style: { paddingBottom: '12px' } },
          { selector: '[data-composer-input]', style: { width: '20px', minWidth: '20px' } },
          { selector: '[data-composer-trailing-controls] > button', style: { position: 'relative', left: '400px' } },
        ]
        for (const fault of faults) {
          const target = page.locator(fault.selector)
          const previous = await target.getAttribute('style')
          try {
            await target.evaluate((element, style) => Object.assign((element as HTMLElement).style, style), fault.style)
            expect(await input.evaluate(composerPlaceholderFits, scale), JSON.stringify(fault)).toBe(false)
          } finally {
            await target.evaluate((element, previous) => previous === null ? element.removeAttribute('style') : element.setAttribute('style', previous), previous)
          }
          expect(await input.evaluate(composerPlaceholderFits, scale)).toBe(true)
        }
      } finally { await page.close() }
    },
  )


  it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }].flatMap(({ locale, messages }) =>
    ['today', 'habitDetail', 'habitDetailWithoutSuggestions'].map(surface => ({ locale, messages, surface })),
  ))(
    'fits the approved $locale placeholder across adjacent compact widths on $surface', async ({ messages, surface }) => {
      const configuration = { ...geometryProps('idle', messages, true), clipboardText: 'Pasted message', testSurface: surface,
        collapsible: surface !== 'today',
        suggestions: surface === 'habitDetail' ? liveChipSuggestions('habitDetail', messages).suggestions : [],
      }
      const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
      try {
        const measurements = []
        const input = page.locator('[data-composer-input]')
        for (const width of [320, 360, 384, 412, 480]) {
          await page.setViewportSize({ width, height: 915 })
          await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
          await page.locator('.orbit-menu-panel, .orbit-sheet-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
          await page.addScriptTag({ content: composerScript })
          await loadAppFonts(page)
          for (const fontScale of [1, 1.5, 2, 1]) {
            await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px` }, fontScale)
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
            measurements.push({ width, fontScale, layout: await readTextActionLayout(page), fits: await input.evaluate(composerPlaceholderFits, fontScale) })
          }
        }
        for (const measured of measurements) {
          expect(measured.fits, JSON.stringify({ surface, placeholder: messages.shell.composer.placeholder, measurements })).toBe(true)
        }
        await input.fill('Keep this draft\n'.repeat(8))
        expect(await input.inputValue()).toBe('Keep this draft\n'.repeat(8))
        await input.fill('')
        expect(await input.evaluate(composerPlaceholderFits, 1)).toBe(true)
      } finally { await page.close() }
    },
  )

  it.each([320, 412].flatMap(width => [en, ptBR].map(messages => ({ width, messages }))))(
    'moves text actions only when the whole placeholder needs their slot at $width', async ({ width, messages }) => {
      const configuration = { ...geometryProps('idle', messages, true), clipboardText: 'Pasted message' }
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.locator('.orbit-menu-panel, .orbit-sheet-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const input = page.locator('[data-composer-input]')
        const placements = new Set<boolean>()
        for (const nextWidth of [width, 600, width === 320 ? 412 : 320, width]) {
          await page.setViewportSize({ width: nextWidth, height: 915 })
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          const layout = await readTextActionLayout(page)
          const padding = parseFloat(layout.paddingInlineStart) + parseFloat(layout.paddingInlineEnd)
          const available = layout.rowWidth - parseFloat(layout.rowPaddingStart) - parseFloat(layout.rowPaddingEnd)
          const inlineMinimum = layout.entryWidth + layout.sendWidth + layout.inlineWidth + parseFloat(layout.trailingGap)
            + Math.max(3 * parseFloat(layout.fontSize), Math.ceil(layout.metrics.width!) + padding)
          const inMenu = inlineMinimum > available
          placements.add(inMenu)
          const pasteCount = await page.locator('[data-composer-paste]').count()
          const menuPaste = layout.menuItems.filter(item => item.id === 'paste')
          expect(pasteCount + menuPaste.length, JSON.stringify(layout)).toBe(1)
          expect(pasteCount, JSON.stringify(layout)).toBe(inMenu ? 0 : 1)
          if (inMenu) expect(layout.menuItems[0]).toEqual({ id: 'paste', label: messages.shell.composer.paste })
          const empty = await input.evaluate(measureFieldInset)
          expect(await input.getAttribute('placeholder')).toBe(messages.shell.composer.placeholder)
          expect(empty.height).toBe(empty.lineHeight + 24)
          expect(layout.metrics.width!).toBeLessThanOrEqual(empty.contentWidth)
          await input.fill('Draft')
          expect(await input.inputValue()).toBe('Draft')
          const typed = await input.evaluate(measureFieldInset)
          expect(typed.contentWidth).toBe(empty.contentWidth)
          const typedLayout = await readTextActionLayout(page)
          const clearCount = await page.locator('[data-composer-clear]').count()
          expect(clearCount + typedLayout.menuItems.filter(item => item.id === 'clear').length).toBe(1)
          expect(clearCount).toBe(inMenu ? 0 : 1)
          if (inMenu) {
            expect(typedLayout.menuItems[0]).toEqual({ id: 'clear', label: messages.shell.composer.clear })
            await input.fill('')
            await expectNarrowMenuPaste(page, messages)
          } else await page.locator('[data-composer-clear]').click()
          expect(await input.inputValue()).toBe('')
          expect(await input.evaluate(element => element === document.activeElement)).toBe(true)
          expect(await input.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, 0])
          const restored = await readTextActionLayout(page)
          expect(await page.locator('[data-composer-paste]').count() + restored.menuItems.filter(item => item.id === 'paste').length).toBe(1)
          for (const control of await page.locator('[data-composer-input-row] button').all()) {
            const target = (await control.boundingBox())!
            const field = (await page.locator('[data-composer-input-row]').boundingBox())!
            const text = (await input.boundingBox())!
            expect(target.width).toBeGreaterThanOrEqual(48)
            expect(target.height).toBeGreaterThanOrEqual(48)
            expect(target.x).toBeGreaterThanOrEqual(field.x + 4)
            expect(target.y).toBeGreaterThanOrEqual(field.y + 4)
            expect(target.x + target.width).toBeLessThanOrEqual(field.x + field.width - 4)
            expect(target.y + target.height).toBeLessThanOrEqual(field.y + field.height - 4)
            expect(target.x + target.width <= text.x || target.x >= text.x + text.width || target.y + target.height <= text.y || target.y >= text.y + text.height).toBe(true)
          }
        }
        expect([...placements].sort((left, right) => Number(left) - Number(right))).toEqual([false, true])
      } finally { await page.close() }
    },
  )

  it.each([360, 412, 1200, 1600].flatMap(width => [false, true].map(withMessages => ({ width, withMessages }))))(
    'contains the prefilled conversation input at $width with messages $withMessages', async ({ width, withMessages }) => {
      const prompt = ptBR.habits.detail.askAstraSeedDefault.replace('{title}', 'Ler 10 minutos')
      const configuration = { ...geometryProps('idle', ptBR, false), value: prompt, withMessages }
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style><div id="root" style="height:915px;max-width:740px;margin:auto"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.locator('.orbit-menu-panel, .orbit-sheet-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const input = page.locator('[data-composer-input]')
        await expect.poll(() => input.evaluate(element => element === document.activeElement)).toBe(true)
        expect(await input.inputValue()).toBe(prompt)
        expect(await input.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([prompt.length, prompt.length])
        for (const value of [prompt, Array.from({ length: 8 }, () => prompt).join('\n'), 'Ler']) {
          if (value !== prompt) await input.fill(value)
          const geometry = await input.evaluate(element => {
            const field = element.closest<HTMLElement>('[data-composer-input-row]')!
            const pill = field.getBoundingClientRect()
            const text = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            const fullInput = element.cloneNode(true) as HTMLTextAreaElement
            Object.assign(fullInput.style, { position: 'fixed', visibility: 'hidden', width: `${text.width}px`, minWidth: '0', maxWidth: 'none', maxHeight: 'none', height: 'auto' })
            fullInput.value = (element as HTMLTextAreaElement).value
            document.body.append(fullInput)
            const naturalHeight = fullInput.scrollHeight
            fullInput.remove()
            return { top: text.top, bottom: text.bottom, left: text.left, right: text.right, height: element.clientHeight,
              fieldTop: pill.top, fieldBottom: pill.bottom, fieldLeft: pill.left, fieldRight: pill.right,
              controls: [...field.querySelectorAll('button')].map(button => {
                const target = button.getBoundingClientRect()
                return { name: button.getAttribute('aria-label'), left: target.left, right: target.right,
                  top: target.top, bottom: target.bottom, width: target.width, height: target.height }
              }),
              naturalHeight, minimumHeight: parseFloat(style.minHeight), scrollHeight: element.scrollHeight, maximumHeight: parseFloat(style.maxHeight),
              overflowY: style.overflowY }
          })
          expect(geometry.top).toBeGreaterThanOrEqual(geometry.fieldTop + 4)
          expect(geometry.bottom).toBeLessThanOrEqual(geometry.fieldBottom - 4)
          expect(geometry.left).toBeGreaterThanOrEqual(geometry.fieldLeft + 4)
          expect(geometry.right).toBeLessThanOrEqual(geometry.fieldRight - 4)
          expect(geometry.height).toBe(Math.max(geometry.minimumHeight, Math.min(geometry.maximumHeight, geometry.naturalHeight)))
          for (const control of geometry.controls) {
            expect(control.width).toBeGreaterThanOrEqual(48)
            expect(control.height).toBeGreaterThanOrEqual(48)
            expect(control.left).toBeGreaterThanOrEqual(geometry.fieldLeft + 4)
            expect(control.right).toBeLessThanOrEqual(geometry.fieldRight - 4)
            expect(control.top).toBeGreaterThanOrEqual(geometry.fieldTop + 4)
            expect(control.bottom).toBeLessThanOrEqual(geometry.fieldBottom - 4)
            expect(control.right <= geometry.left || control.left >= geometry.right || control.bottom <= geometry.top || control.top >= geometry.bottom).toBe(true)
          }
          expect(geometry.controls.filter(control => control.name === ptBR.shell.composer.send)).toHaveLength(1)
          expect(await input.inputValue()).toBe(value)
          expect(await input.evaluate(element => element === document.activeElement)).toBe(true)
          expect(await input.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([value.length, value.length])
          if (geometry.naturalHeight > geometry.maximumHeight) {
            expect(geometry.height).toBe(geometry.maximumHeight)
            expect(geometry.scrollHeight).toBeGreaterThan(geometry.height)
            expect(geometry.overflowY).toBe('auto')
            await input.evaluate(element => { element.scrollTop = element.scrollHeight })
            expect(await input.evaluate(element => ({ reached: element.scrollTop + element.clientHeight, end: element.scrollHeight }))).toEqual({ reached: geometry.scrollHeight, end: geometry.scrollHeight })
          } else {
            expect(geometry.scrollHeight).toBe(geometry.height)
            expect(await input.evaluate(element => element.scrollTop)).toBe(0)
          }
        }
      } finally { await page.close() }
    },
  )

  it.each([320, 412, 1352].flatMap(width => [false, true].flatMap(withOpener =>
    ['ltr', 'rtl'].map(direction => ({ width, withOpener, direction })),
  )))('pads the caret and placeholder at $width with opener $withOpener in $direction', async ({ width, withOpener, direction }) => {
    const configuration = geometryProps('idle', en, withOpener)
    if (direction === 'rtl') configuration.words = { ...configuration.words, placeholder: 'אבג' }
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" dir="${direction}"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.locator('.orbit-menu-panel, .orbit-sheet-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      await page.addScriptTag({ content: composerScript })
      await loadAppFonts(page)
      const field = page.locator('[data-composer-input]')
      const placeholder = await field.evaluate(measureFieldInset)
      expect.soft(placeholder.paddingStart).toBe(8)
      expect.soft(placeholder.paddingEnd).toBe(8)
      expect.soft(placeholder.inset).toBe(8)
      const leading = await field.evaluate(element => {
        const input = element.getBoundingClientRect()
        const pill = element.closest('[data-composer-input-row]')!.getBoundingClientRect()
        const entry = element.closest('[data-composer-input-row]')!.querySelector('[data-open-conversation]')?.getBoundingClientRect()
        const sameLine = entry && entry.top < input.bottom && entry.bottom > input.top
        return { entryWidth: sameLine ? entry!.width : 0, pillLeft: pill.left, pillRight: pill.right, inputLeft: input.left, inputRight: input.right }
      })
      expect.soft(placeholder.pillInset).toBe(8 + leading.entryWidth + 8)
      const box = (await field.boundingBox())!
      await page.mouse.click(direction === 'rtl' ? box.x + box.width - 2 : box.x + 2, box.y + box.height / 2)
      expect(await field.evaluate(element => element === document.activeElement)).toBe(true)
      await field.fill((direction === 'rtl' ? 'אבג ' : 'Astra ').repeat(10).trim())
      const typed = await field.evaluate(measureFieldInset)
      expect(typed.inset).toBe(placeholder.inset)
      const ownedWidth = await field.evaluate(element => ({ clientWidth: element.clientWidth,
        padding: parseFloat(getComputedStyle(element).paddingInlineStart) + parseFloat(getComputedStyle(element).paddingInlineEnd) }))
      expect(typed.contentWidth).toBe(ownedWidth.clientWidth - ownedWidth.padding)
      expect(typed.contentWidth).toBe(placeholder.contentWidth)
      if (width === 320) expect(typed.height).toBeGreaterThan(placeholder.height)
      expect(typed.height).toBeLessThanOrEqual(typed.maximumHeight)
      if (typed.height === typed.maximumHeight) expect(typed.scrollHeight).toBeGreaterThanOrEqual(typed.height)
      else expect(typed.scrollHeight).toBe(typed.height)
      for (const control of await page.locator('[data-composer-input-row] button').all()) {
        const bounds = (await control.boundingBox())!
        expect(bounds.width).toBeGreaterThanOrEqual(48)
        expect(bounds.height).toBeGreaterThanOrEqual(48)
        const input = (await field.boundingBox())!
        const pill = (await page.locator('[data-composer-input-row]').boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(pill.x + 4)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(pill.x + pill.width - 4)
        expect(bounds.y).toBeGreaterThanOrEqual(pill.y + 4)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(pill.y + pill.height - 4)
        expect(bounds.x + bounds.width <= input.x || bounds.x >= input.x + input.width || bounds.y + bounds.height <= input.y || bounds.y >= input.y + input.height).toBe(true)
      }
    } finally { await page.close() }
  })

  it.each([en, ptBR].flatMap(messages => (['offline', 'atLimit'] as const).flatMap(scenario =>
    [{ fontScale: 2, width: 320 }, { fontScale: 1, width: 600 },
      { fontScale: 1, width: 240 }].map(size => ({ messages, scenario, ...size })),
  )))('updates the mounted $scenario placeholder at $fontScale text and $width width', async ({ messages, scenario, fontScale, width }) => {
    const configuration = geometryProps(scenario, messages, true)
    const page = await browser.newPage({ viewport: { width, height: 740 } })
    const view = render(<Composer {...geometryProps('idle', messages, true)} />)
    let restoreContext: (() => void) | undefined
    try {
      await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style>${view.container.innerHTML}`)
      await page.locator('.orbit-menu-panel, .orbit-sheet-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
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
      const padding = parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd)
      expect(parseFloat(style.fontSize)).toBe(16 * fontScale)
      for (const clientWidth of [measured.clientWidth, Math.floor(measured.metrics.width!) + padding - 1, Math.ceil(measured.metrics.width!) + padding]) {
        widthSpy.mockReturnValue(clientWidth)
        await act(() => document.fonts.dispatchEvent(new Event('loadingdone')))
        const fits = measured.metrics.width! <= clientWidth - padding
        expect(field).toHaveAttribute('placeholder', fontScale > 1.3 || fits ? configuration.words.placeholder : '')
      }
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
      await page.locator('.orbit-menu-panel, .orbit-sheet-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
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
              contentWidth: input.getBoundingClientRect().width - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd),
              pillHeight: input.closest('[data-composer-input-row]')!.getBoundingClientRect().height }
          })
          const evidence = JSON.stringify({ scenario, withOpener, fontScale, measured })
          expect(measured.scrollWidth, evidence).toBeLessThanOrEqual(measured.width)
          expect(measured.scrollHeight, evidence).toBeLessThanOrEqual(measured.height)
          expect(measured.pillHeight, evidence).toBeGreaterThanOrEqual(56)
          expect(measured.pillHeight, evidence).toBeGreaterThanOrEqual(measured.height + 8)
          if (fontScale > 1.3) {
            expect(measured.placeholder, evidence).toBe(configuration.words.placeholder)
          }
          if (measured.textWidth > measured.contentWidth) expect(measured.height, evidence).toBeGreaterThan(measured.singleLineHeight)
          else expect(measured.height, evidence).toBeCloseTo(measured.singleLineHeight, 0)
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
        await page.locator('.orbit-menu-panel, .orbit-sheet-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
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
})
