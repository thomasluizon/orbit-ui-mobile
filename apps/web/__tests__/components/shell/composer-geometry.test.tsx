import { geometryProps, type GeometryScenario, compileComposerGeometry } from '@/__tests__/support/composer-geometry'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Composer } from '@/components/shell/composer'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import * as Menu from '@/components/ui/dropdown-menu'
import { inspectFocusedRing, readFieldIndicators } from '@/e2e/layout/focus-indicators'
import { composerPlaceholderFits } from '@/e2e/layout/composer-column-paint'

const cases = [320, 360, 384, 412].flatMap((width) =>
  [en, ptBR].flatMap((messages) => [1, 2].map((fontScale) => ({ width, messages, fontScale }))),
)

interface PillGeometry {
  pill: { left: number; right: number; top: number; bottom: number; height: number }
  documentWidth: number
  input: { left: number; right: number; top: number; bottom: number; width: number; contentWidth: number; height: number; scrollHeight: number; maximumHeight: number; placeholderWidth: number } | null
  controls: { name: string; left: number; right: number; top: number; bottom: number; width: number; height: number }[]
  menuItems: { id: string; label: string }[]
  clipboardAvailable: boolean
}

function assertPillActions(measured: PillGeometry, { withOpener, scenario, messages }: { withOpener: boolean; scenario: GeometryScenario; messages: typeof en }, evidence: string) {
  const names = measured.controls.map(control => control.name)
  const voiceActive = scenario === 'recording' || scenario === 'transcribing'
  const expected = [
    ...(withOpener ? [messages.todayAstra.openConversation] : []),
    voiceActive ? messages.shell.composer.voice.stop : messages.shell.composer.actions,
    messages.shell.composer.send,
  ]
  const textAction = ['oneLine', 'typing', 'longText'].includes(scenario) ? messages.shell.composer.clear : messages.shell.composer.paste
  const possibleNames = [...expected, ...names.includes(textAction) ? [textAction] : []]
  expect([...names].sort((left, right) => left.localeCompare(right)), evidence).toEqual(possibleNames.sort((left, right) => left.localeCompare(right)))
  if (['sending', 'atLimit', 'offline', 'recording', 'transcribing'].includes(scenario)) expect(names, evidence).not.toContain(textAction)
  const actionId = ['oneLine', 'typing', 'longText'].includes(scenario) ? 'clear' : 'paste'
  const textActionName = actionId === 'clear' ? messages.shell.composer.clear : messages.shell.composer.paste
  const available = !['sending', 'atLimit', 'offline', 'recording', 'transcribing'].includes(scenario)
    && (actionId === 'clear' || measured.clipboardAvailable)
  expect(measured.controls.filter(control => control.name === textActionName).length
    + measured.menuItems.filter(item => item.id === actionId).length, evidence).toBe(available ? 1 : 0)
  if (measured.menuItems.some(item => item.id === actionId)) {
    expect(measured.menuItems[0], evidence).toEqual({ id: actionId, label: textActionName })
  }
}

function assertPillGeometry(measured: PillGeometry, context: { width: number; fontScale: number; withOpener: boolean; scenario: GeometryScenario; messages: typeof en }) {
  const { width, fontScale, withOpener, scenario } = context
  const evidence = JSON.stringify({ width, fontScale, withOpener, scenario, measured })
  expect(measured.documentWidth, evidence).toBe(width)
  assertPillActions(measured, context, evidence)
  for (const [index, control] of measured.controls.entries()) {
    expect(control.width, evidence).toBeGreaterThanOrEqual(48)
    expect(control.height, evidence).toBeGreaterThanOrEqual(48)
    expect(control.left, evidence).toBeGreaterThanOrEqual(measured.pill.left + INTERACTION_FILL_CLEARANCE)
    expect(control.right, evidence).toBeLessThanOrEqual(measured.pill.right - INTERACTION_FILL_CLEARANCE)
    expect(control.top, evidence).toBeGreaterThanOrEqual(measured.pill.top + INTERACTION_FILL_CLEARANCE)
    expect(control.bottom, evidence).toBeLessThanOrEqual(measured.pill.bottom - INTERACTION_FILL_CLEARANCE)
    if (index > 0) {
      const previous = measured.controls[index - 1]!
      expect(control.left >= previous.right || control.top >= previous.bottom, evidence).toBe(true)
    }
    if (measured.input) {
      const input = measured.input
      expect(control.right <= input.left || control.left >= input.right || control.bottom <= input.top || control.top >= input.bottom, evidence).toBe(true)
    }
  }
  if (measured.input) {
    const input = measured.input
    expect(input.left, evidence).toBeGreaterThanOrEqual(measured.pill.left + INTERACTION_FILL_CLEARANCE)
    expect(input.right, evidence).toBeLessThanOrEqual(measured.pill.right - INTERACTION_FILL_CLEARANCE)
    expect(input.top, evidence).toBeGreaterThanOrEqual(measured.pill.top + INTERACTION_FILL_CLEARANCE)
    expect(input.bottom, evidence).toBeLessThanOrEqual(measured.pill.bottom - INTERACTION_FILL_CLEARANCE)
    expect(input.width, evidence).toBeGreaterThanOrEqual(48 * fontScale)
    expect(measured.pill.height, evidence).toBeGreaterThanOrEqual(input.height + 8)
    expect(input.height, evidence).toBeGreaterThanOrEqual(24 * fontScale + 24)
    expect(input.height, evidence).toBeLessThanOrEqual(input.maximumHeight)
    if (fontScale === 1) expect(input.placeholderWidth, evidence).toBeLessThanOrEqual(input.contentWidth)
    if (scenario === 'longText') {
      expect(input.height, evidence).toBe(input.maximumHeight)
      expect(input.scrollHeight, evidence).toBeGreaterThan(input.height)
    } else expect(input.scrollHeight, evidence).toBeLessThanOrEqual(input.height)
  } else expect(measured.pill.height, evidence).toBeGreaterThanOrEqual(56)
}


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

  it.each([320, 360, 384, 412, 600].flatMap(width => [en, ptBR].map(messages => ({ width, messages }))))(
    'contains the Hoje and habit disclosure in the pill at $width with a whole placeholder', async ({ width, messages }) => {
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        for (const collapseScope of ['today', 'habit'] as const) {
          const view = render(<Composer {...geometryProps('idle', messages, true)} collapsible collapseScope={collapseScope} />)
          try {
            await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
            await loadAppFonts(page)
            const pill = page.locator('[data-composer-input-row]')
            const disclosure = pill.locator('[data-composer-disclosure]')
            expect(await disclosure.count()).toBe(1)
            expect(await disclosure.getAttribute('aria-expanded')).toBe('true')
            expect(await pill.locator('button').count()).toBe(4)
            expect(await page.locator('[data-composer-input]').evaluate(composerPlaceholderFits, 1)).toBe(true)
            const tops = await pill.locator('[data-composer-trailing-controls] button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top))
            expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)
          } finally { view.unmount() }
        }
      } finally { await page.close() }
    },
  )

  it.each([412, 1280].flatMap((width) => (['light', 'dark'] as const).flatMap((mode) => [false, true].map((forcedColors) => ({ width, mode, forcedColors })))))(
    'draws one field and action focus ring at $width in $mode with forced colors $forcedColors', async ({ width, mode, forcedColors }) => {
      const view = render(<Composer {...geometryProps('typing', en, false)} />)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.emulateMedia({ forcedColors: forcedColors ? 'active' : 'none' })
        await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
        await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
        await page.evaluate((variables) => { for (const [key, value] of Object.entries(variables)) document.documentElement.style.setProperty(key, value) }, resolveWebThemeVariables('orange', mode))
        await page.keyboard.press('Tab')
        const field = page.getByRole('textbox')
        expect(await field.evaluate((element) => element === document.activeElement)).toBe(true)
        expect(await readFieldIndicators(field, '[data-composer-input-row]', { forcedColors })).toHaveLength(1)
        for (const name of [en.shell.composer.clear, en.shell.composer.actions, en.shell.composer.send]) {
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
            const separator = document.createElement('span')
            separator.style.color = 'var(--bg)'
            document.body.append(separator)
            const separatorColor = getComputedStyle(separator).color
            separator.remove()
            return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor, systemColor, separatorColor, shadow: style.boxShadow }
          })
          expect(outline.width).toBe('2px')
          expect(outline.style).toBe('solid')
          expect(outline.color).toBe(forcedColors ? outline.systemColor : 'rgb(196, 83, 15)')
          if (!forcedColors && name === en.shell.composer.send) {
            expect(outline.shadow).toContain(`${outline.separatorColor} 0px 0px 0px 4px inset`)
            expect(contrastOnSurface(outline.color, [outline.separatorColor])).toBeGreaterThanOrEqual(3)
          }
        }
        fireEvent.pointerDown(screen.getByRole('button', { name: en.shell.composer.actions }), { button: 0, ctrlKey: false })
        const menu = await screen.findByRole('menu')
        const markup = width < 900 ? menu.closest('[role="dialog"]')!.outerHTML : menu.outerHTML
        await page.setContent(`<style>${stylesheet}</style>${markup}`)
        await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
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
      fireEvent.pointerDown(screen.getByRole('button', { name: en.shell.composer.actions }), { button: 0, ctrlKey: false })
      const menu = await screen.findByRole('menu')
      const markup = width < 900 ? menu.closest('[role="dialog"]')!.outerHTML : menu.outerHTML
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}:root{${theme}}.orbit-menu-item{--test-hover:0}.orbit-menu-item:hover{--test-hover:1}</style>${markup}`)
        await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
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
      const view = render(<Menu.Root open><Menu.Trigger asChild><button type="button" aria-label="Menu trigger" /></Menu.Trigger><Menu.Content {...presentation} title="Actions" items={[
        { id: 'file', label: en.shell.composer.attach.file, icon: 'file' },
        { id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
      ]} /></Menu.Root>)
      const menu = await screen.findByRole('menu')
      const markup = width < 900 ? menu.closest('[role="dialog"]')!.outerHTML : menu.outerHTML
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style>${markup}`)
        await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
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
      await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      const target = page.locator('[data-open-conversation]')
      const bounds = (await target.boundingBox())!
      expect(bounds.width).toBeGreaterThanOrEqual(48)
      expect(bounds.height).toBeGreaterThanOrEqual(48)
      expect(await target.getAttribute('aria-label')).toBe(en.todayAstra.openConversation)
      expect(await target.locator('[translate="no"]').allTextContents()).toEqual([])
      expect(await target.locator('[data-asset="astra-mark"][aria-hidden="true"]').count()).toBe(1)
      expect((await target.locator('svg').boundingBox())!.width).toBe(20)
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(250)
      expect(await target.boundingBox()).toEqual(bounds)
      const glyphWidth = (await target.locator('svg').boundingBox())!.width
      expect(glyphWidth).toBeCloseTo(reducedMotion === 'reduce' ? 20 : 19.2, 1)
      await page.mouse.up()
      expect(await target.boundingBox()).toEqual(bounds)
      const field = (await page.locator('[data-composer-input-row]').boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(field.x + 4)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(field.x + field.width - 4)
      expect(bounds.y).toBeGreaterThanOrEqual(field.y + 4)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(field.y + field.height - 4)
      for (const control of await page.locator('[data-composer-input], [data-composer-trailing-controls] button').all()) {
        const other = (await control.boundingBox())!
        expect(bounds.x + bounds.width <= other.x || bounds.x >= other.x + other.width || bounds.y + bounds.height <= other.y || bounds.y >= other.y + other.height).toBe(true)
      }
    } finally { await page.close(); view.unmount() }
  })

  it.each([en, ptBR])('keeps composer sheet titles whole and close targets at 48 with doubled text', async (messages) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      for (const surface of ['actions', 'attachment'] as const) {
        const props = geometryProps('tray1', messages, true)
        const view = render(<Composer {...props} />)
        const trigger = screen.getByRole('button', { name: surface === 'actions' ? messages.shell.composer.actions : props.attachments![0]!.name })
        if (surface === 'actions') fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
        else fireEvent.click(trigger)
        const dialog = await screen.findByRole('dialog')
        const markup = dialog.outerHTML
        view.unmount()
        await page.setContent(`<style>${stylesheet}html{font-size:32px}</style>${markup}`)
        await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
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
      const initial = geometryProps('idle', messages, true)
      await page.setContent(`<style>${stylesheet}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(initial)}</script>`)
      await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      await loadAppFonts(page)
      await page.addScriptTag({ content: composerScript })
      await page.locator('[data-composer-test-ready]').waitFor()
      await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
      for (const withOpener of [true, false]) for (const scenario of ['idle', 'oneLine', 'typing', 'longText', 'sending', 'recording', 'transcribing', 'tray1', 'tray2', 'tray3', 'atLimit', 'offline', 'retry'] as const) {
        const props = geometryProps(scenario, messages, withOpener)
        await page.evaluate(configuration => {
          document.dispatchEvent(new CustomEvent('composer-test-remount', { detail: configuration }))
        }, JSON.parse(JSON.stringify({ ...props, attachmentRemoveTemplate: messages.shell.composer.attach.remove })))
        await page.locator('[data-composer-test-ready]').waitFor()
        await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const measured = await page.evaluate(() => {
          const pill = document.querySelector<HTMLElement>('[data-composer-input-row]')!
          const bounds = pill.getBoundingClientRect()
          const input = pill.querySelector<HTMLTextAreaElement>('textarea')
          const canvas = document.createElement('canvas').getContext('2d')!
          if (input) { canvas.font = getComputedStyle(input).font; canvas.letterSpacing = getComputedStyle(input).letterSpacing }
          return {
            pill: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, height: bounds.height },
            documentWidth: document.documentElement.scrollWidth,
            clipboardAvailable: 'clipboard' in navigator && typeof navigator.clipboard.readText === 'function',
            menuItems: JSON.parse(pill.querySelector('[data-composer-menu-items]')?.getAttribute('data-composer-menu-items') ?? '[]'),
            input: input ? { width: input.clientWidth, height: input.clientHeight, scrollHeight: input.scrollHeight,
              left: input.getBoundingClientRect().left, right: input.getBoundingClientRect().right,
              top: input.getBoundingClientRect().top, bottom: input.getBoundingClientRect().bottom,
              contentWidth: input.clientWidth - parseFloat(getComputedStyle(input).paddingInlineStart) - parseFloat(getComputedStyle(input).paddingInlineEnd),
              maximumHeight: parseFloat(getComputedStyle(input).maxHeight), placeholderWidth: canvas.measureText(input.placeholder).width } : null,
            controls: [...pill.querySelectorAll('button')].map((button) => {
              const rectangle = button.getBoundingClientRect()
              return { name: button.getAttribute('aria-label')!, left: rectangle.left, right: rectangle.right, top: rectangle.top, bottom: rectangle.bottom, width: rectangle.width, height: rectangle.height }
            }),
          }
        })
        assertPillGeometry(measured, { width, fontScale, withOpener, scenario, messages })

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
        await page.locator('.orbit-menu-panel').evaluateAll((panels) => Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished))))
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
        if (state === 'recording') {
          await page.keyboard.press('Shift')
          await control.focus()
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
          expect(await control.evaluate((element) => getComputedStyle(element).outlineColor)).toBe('rgb(196, 83, 15)')
        }
      } finally { await page.close() }
    },
  )
})
