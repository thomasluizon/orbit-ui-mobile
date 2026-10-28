import { settleAnimations } from '@/e2e/layout/settle-animations'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { expectInteractionFill } from '@/e2e/layout/label-interaction-fill'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const branchTitle = 'Branch child with a long title about preparing the room and collecting every book and notebook for the next reading session'

describe('mounted headless menu lifecycle in Chromium', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      const options = JSON.parse(process.argv[1]);
      const result = await build({ ...options, alias: { '@sentry/nextjs': '@sentry/browser' }, plugins: [{
        name: 'notification-boundaries', setup(build) {
          build.onResolve({ filter: /^next\\/navigation$|^@\\/hooks\\/use-notification-inbox$/ }, ({ path }) => ({ path, namespace: 'notifications' }));
          build.onLoad({ filter: /.*/, namespace: 'notifications' }, ({ path }) => ({ contents: path === 'next/navigation'
            ? 'export const useRouter = () => ({ push() {} }); export const usePathname = () => "/today"; export const unstable_isUnrecognizedActionError = () => false;'
            : 'export const useNotificationInbox = () => ({ visibleUnreadCount: 0 });' }));
        }
      }] });
      process.stdout.write(result.outputFiles[0].text);
    `, JSON.stringify({
      entryPoints: ['__tests__/support/menu-lifecycle.tsx'], bundle: true, write: false,
      format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    })], { maxBuffer: 10 * 1024 * 1024 }).toString()
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  async function mount(surface: 'habit' | 'composer' | 'frequency' | 'account' | 'calendar', locale: 'en' | 'pt-BR', width: number, height: number, mode: 'light' | 'dark' = 'dark', reducedMotion: 'reduce' | 'no-preference' = 'reduce', hasTouch = false) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion, hasTouch })
    onTestFinished(async () => { await page.close() })
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<html class="${mode}" style="${theme}"><style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ surface, locale })}</script></html>`)
    await loadAppFonts(page)
    await page.addScriptTag({ content: script })
    return page
  }

  it.each(['no-preference', 'reduce'] as const)('samples compact entrance transition frames with %s motion', async (reducedMotion) => {
    const page = await mount('habit', 'en', 390, 844, 'dark', reducedMotion)
    const trigger = page.locator('[data-habit-row-control="menu"]')
    await trigger.waitFor({ state: 'visible' })
    const [frames] = await Promise.all([
      page.evaluate(() => new Promise<{ y: number; top: number; opacity: number; backdrop: number }[]>((resolve) => {
        const frames: { y: number; top: number; opacity: number; backdrop: number }[] = []
        const start = performance.now()
        function sample() {
          const panel = document.querySelector('.orbit-sheet-panel')
          const backdrop = document.querySelector('.orbit-sheet-backdrop')
          if (panel && backdrop) {
            const style = getComputedStyle(panel)
            frames.push({ y: new DOMMatrixReadOnly(style.transform).m42, top: panel.getBoundingClientRect().top,
              opacity: Number(style.opacity), backdrop: Number(getComputedStyle(backdrop).opacity) })
          }
          if (performance.now() - start < 700) requestAnimationFrame(sample)
          else resolve(frames)
        }
        requestAnimationFrame(sample)
      })),
      trigger.click(),
    ])
    expect(frames.length).toBeGreaterThan(2)
    if (reducedMotion === 'no-preference') {
      expect(Math.max(...frames.map(frame => frame.y))).toBeGreaterThan(1)
      expect(frames.some(frame => frame.opacity > 0 && frame.opacity < 1)).toBe(true)
      expect(frames.some(frame => frame.backdrop > 0 && frame.backdrop < 1)).toBe(true)
      expect(Math.max(...frames.map(frame => frame.top)) - frames.at(-1)!.top).toBeGreaterThan(1)
    } else expect(frames.every(frame => frame.y === 0)).toBe(true)
    expect(frames.at(-1)).toMatchObject({ y: 0, opacity: 1, backdrop: 1 })
  })

  it('samples reduced anchored exit transition frames without scale or travel', async () => {
    const page = await mount('habit', 'en', 1280, 900)
    await page.locator('[data-habit-row-control="menu"]').click()
    await page.getByRole('menu').waitFor({ state: 'visible' })
    const [frames] = await Promise.all([
      page.evaluate(() => new Promise<{ scaleX: number; scaleY: number; x: number; y: number; opacity: number }[]>((resolve) => {
        const frames: { scaleX: number; scaleY: number; x: number; y: number; opacity: number }[] = []
        const start = performance.now()
        function sample() {
          const panel = document.querySelector('.orbit-menu-panel[data-state="closed"]')
          if (panel) {
            const style = getComputedStyle(panel)
            const matrix = new DOMMatrixReadOnly(style.transform)
            frames.push({ scaleX: matrix.m11, scaleY: matrix.m22, x: matrix.m41, y: matrix.m42, opacity: Number(style.opacity) })
          }
          if (performance.now() - start < 500) requestAnimationFrame(sample)
          else resolve(frames)
        }
        requestAnimationFrame(sample)
      })),
      page.keyboard.press('Escape'),
    ])
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every(frame => frame.scaleX === 1 && frame.scaleY === 1 && frame.x === 0 && frame.y === 0), JSON.stringify(frames)).toBe(true)
    expect(frames.some(frame => frame.opacity < 1)).toBe(true)
    expect(await page.getByRole('menu').count()).toBe(0)
  })

  it.each([320, 360, 384, 412].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    (['dark', 'light'] as const).map(mode => ({ width, locale, mode })))))
    ('reopens the Today menu with a real pointer and checks its fill at $width pixels in $locale, $mode', async ({ width, locale, mode }) => {
      const page = await mount('frequency', locale, width, 915, mode)
      const words = locale === 'en' ? en : ptBR
      const trigger = page.getByRole('button', { name: words.habits.listOptions, exact: true })
      await trigger.click()
      await page.getByRole('menu', { name: words.habits.listOptions, exact: true }).waitFor({ state: 'visible' })
      expect(await trigger.count()).toBe(0)
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('menu').count()).toBe(0)
      await expect.poll(() => trigger.evaluate(element => element === document.activeElement)).toBe(true)
      await expectInteractionFill(trigger)
      expect(await page.getByRole('menu').count()).toBe(0)
    })

  it('rejects a menu trigger with no opening press fill', async () => {
    const page = await mount('frequency', 'en', 320, 915)
    await page.addStyleTag({ content: '[data-menu-trigger][data-state="open"] { background-color: transparent !important; }' })
    const trigger = page.getByRole('button', { name: en.habits.listOptions, exact: true, includeHidden: true })
    await expect(expectInteractionFill(trigger)).rejects.toThrow('press: the fill paints a visible surface')
    expect(await page.getByRole('menu').count()).toBe(0)
  })

  it.each([320, 360, 384, 412].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    (['dark', 'light'] as const).map(mode => ({ width, locale, mode })))))
    ('paints the Today trigger throughout an opening press at $width pixels in $locale, $mode', async ({ width, locale, mode }) => {
      const page = await mount('frequency', locale, width, 915, mode, 'reduce', true)
      const words = locale === 'en' ? en : ptBR
      const trigger = page.getByRole('button', { name: words.habits.listOptions, exact: true, includeHidden: true })
      await trigger.waitFor({ state: 'visible' })
      const radius = await trigger.evaluate(element => getComputedStyle(element).borderRadius)
      const bounds = (await trigger.boundingBox())!
      const touch = await page.context().newCDPSession(page)
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }] })
      await page.getByRole('menu').waitFor({ state: 'visible' })
      const expectedFill = mode === 'dark' ? 'rgba(250, 250, 250, 0.13)' : 'rgba(9, 9, 11, 0.11)'
      await expect.poll(() => trigger.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(expectedFill)
      const pressed = await trigger.evaluate(element => ({
        nativeActive: element.matches(':active'),
        fill: getComputedStyle(element).backgroundColor,
        radius: getComputedStyle(element).borderRadius,
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      }))
      expect(pressed.fill, JSON.stringify(pressed)).toBe(expectedFill)
      expect(pressed.radius).toBe(radius)
      expect(pressed.width).toBe(48)
      expect(pressed.height).toBe(48)
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.keyboard.press('Escape')
      await expect.poll(() => trigger.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    })

  it('lets the first outside pointer press dismiss the account menu and activate its destination', async () => {
    const page = await mount('account', 'en', 1024, 900)
    await page.getByRole('button', { name: 'Person, person@example.com', exact: true }).click()
    await page.getByRole('menu').waitFor({ state: 'visible' })
    const outside = page.getByRole('button', { name: 'After menu' })
    const bounds = (await outside.boundingBox())!
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await expect.poll(() => page.getByLabel('Outside clicks').textContent()).toBe('1')
    await expect.poll(() => page.getByRole('menu').count()).toBe(0)
  })

  it.each([
    { surface: 'account', width: 1024, trigger: 'Person, person@example.com' },
    { surface: 'habit', width: 1280, trigger: '' },
    { surface: 'composer', width: 412, trigger: en.shell.composer.actions },
    { surface: 'frequency', width: 412, trigger: en.habits.listOptions },
    { surface: 'calendar', width: 412, trigger: en.calendar.options },
  ] as const)('releases $surface pointer input after Escape and outside dismissal', async ({ surface, width, trigger: label }) => {
    const page = await mount(surface, 'en', width, 915)
    const trigger = surface === 'habit' ? page.locator('[data-habit-row-control="menu"]') : page.getByRole('button', { name: label, exact: true, includeHidden: true })
    const overlays = page.getByRole('menu').or(page.getByRole('dialog'))
    const outside = page.getByRole('button', { name: 'After menu' })
    for (const dismissal of ['Escape', 'outside'] as const) {
      await trigger.hover()
      await page.mouse.down()
      await expect.poll(() => overlays.count()).toBeGreaterThan(0)
      await page.mouse.move(0, 0)
      expect(await trigger.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(250, 250, 250, 0.13)')
      await page.mouse.up()
      await expect.poll(() => overlays.count()).toBeGreaterThan(0)
      if (dismissal === 'Escape') await page.keyboard.press('Escape')
      else {
        const backdrop = page.locator('.orbit-sheet-backdrop')
        if (await backdrop.count()) await page.mouse.click(4, 4)
        else {
          const bounds = (await outside.boundingBox())!
          await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        }
      }
      await expect.poll(() => overlays.count()).toBe(0)
      await expect.poll(() => trigger.evaluate((element) => element === document.activeElement)).toBe(true)
      const previous = Number(await page.getByLabel('Outside clicks').textContent())
      await outside.click()
      expect(await page.getByLabel('Outside clicks').textContent()).toBe(String(previous + 1))
    }
  })

  it.each((['en', 'pt-BR'] as const).flatMap((locale) => (['light', 'dark'] as const).map((mode) => ({ locale, mode }))))('drills through consecutive row menus at 320px with doubled $locale text in $mode', async ({ locale, mode }) => {
    const page = await mount('habit', locale, 320, 915, mode)
    const words = locale === 'en' ? en : ptBR
    try {
      await page.locator('html').evaluate((root) => { root.style.fontSize = '32px' })
      for (const title of ['Parent', branchTitle]) {
        await page.locator('[data-habit-row-control="menu"]').click()
        const menu = page.getByRole('menu', { name: title, exact: true })
        await expect.poll(() => menu.isVisible()).toBe(true)
        await menu.getByRole('menuitem', { name: words.habits.actions.openSubHabits, exact: true }).click()
        await expect.poll(() => menu.count()).toBe(0)
      }
      expect(await page.getByText('Deepest child', { exact: true }).isVisible()).toBe(true)
    } finally { await page.close() }
  })

  it('keeps keyboard submission focus in the composer while send becomes a disabled microphone', async () => {
    const page = await mount('composer', 'en', 412, 915)
    const input = page.getByRole('textbox')
    await input.fill('Next message')
    const send = page.getByRole('button', { name: en.shell.composer.send, exact: true })
    await send.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => input.inputValue()).toBe('')
    await expect.poll(() => page.locator('[data-composer-root]').evaluate(root => root.contains(document.activeElement))).toBe(true)
    await expect.poll(() => input.evaluate(element => element === document.activeElement)).toBe(true)
    expect(await page.getByRole('button', { name: en.shell.composer.voice.start, exact: true }).isDisabled()).toBe(true)
  })

  it('keeps the opening release from selecting a sheet item beneath its trigger', async () => {
    const page = await mount('composer', 'en', 412, 915)
    const trigger = page.getByRole('button', { name: en.shell.composer.actions, exact: true, includeHidden: true })
    const bounds = (await trigger.boundingBox())!
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    const menu = page.getByRole('menu', { name: en.shell.composer.actions, exact: true })
    await menu.waitFor({ state: 'visible' })
    await page.getByRole('dialog').evaluate(settleAnimations)
    await expect.poll(() => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]') != null, point)).toBe(true)
    await page.mouse.up()
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    expect(await page.getByRole('dialog').getAttribute('data-open')).not.toBeNull()
    await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('true')
    expect(await page.getByLabel('Composer selections').textContent()).toBe('0')
    await menu.getByRole('menuitem', { name: en.shell.composer.attach.image, exact: true }).click()
    await expect.poll(() => page.getByLabel('Composer selections').textContent()).toBe('1')
    await expect.poll(() => menu.count()).toBe(0)
  })

  it.each(['en', 'pt-BR'] as const)('reopens the compact %s composer menu after a wide-shell replacement', async (locale) => {
    const page = await mount('composer', locale, 412, 915)
    const words = locale === 'en' ? en : ptBR
    try {
      const trigger = page.getByRole('button', { name: words.shell.composer.actions, exact: true, includeHidden: true })
      const menu = page.getByRole('menu', { name: words.shell.composer.actions, exact: true })
      await trigger.click()
      await expect.poll(() => menu.isVisible()).toBe(true)
      expect(await trigger.getAttribute('aria-expanded')).toBe('true')
      await page.setViewportSize({ width: 1100, height: 915 })
      await expect.poll(() => menu.count()).toBe(0)
      await expect.poll(() => page.evaluate(() => {
        const active = document.activeElement
        return active?.hasAttribute('data-shell-astra-row') ? 'Astra' : `${active?.tagName}: ${active?.getAttribute('aria-label')} `
      })).toBe('Astra')
      await page.setViewportSize({ width: 412, height: 915 })
      await trigger.click()
      await expect.poll(() => menu.isVisible()).toBe(true)
      await page.keyboard.press('Escape')
      await expect.poll(() => menu.count()).toBe(0)
      await expect.poll(() => trigger.evaluate((element) => element === document.activeElement)).toBe(true)
      expect(await page.locator('[data-composer-input]').inputValue()).toBe('Retained draft')
    } finally { await page.close() }
  })

  it.each([0, 44])('keeps every frequency choice within landscape safe bounds with %ipx inline insets after scrolling', async (inlineInset) => {
    const page = await mount('frequency', 'en', 844, 390, 'dark', 'no-preference')
    try {
      const bottomInset = inlineInset === 0 ? 0 : 21
      await page.locator('html').evaluate((root, insets) => {
        root.style.setProperty('--safe-left', `${insets.inline}px`)
        root.style.setProperty('--safe-right', `${insets.inline}px`)
        root.style.setProperty('--safe-bottom', `${insets.bottom}px`)
      }, { inline: inlineInset, bottom: bottomInset })
      await page.getByRole('button', { name: en.habits.listOptions }).click()
      const options = page.getByRole('dialog', { name: en.habits.listOptions, exact: true }).getByRole('menuitem')
      await page.getByRole('dialog', { name: en.habits.listOptions, exact: true }).evaluate(settleAnimations)
      expect(await options.count()).toBe(5)
      for (const option of await options.all()) await option.scrollIntoViewIfNeeded()
      await page.getByRole('menuitem', { name: en.habits.frequencyFilter }).click()
      const frequency = page.getByRole('dialog', { name: en.habits.frequencyFilter })
      await frequency.waitFor({ state: 'visible' })
      await frequency.evaluate(settleAnimations)
      expect(await frequency.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBe(0)
      const panel = (await frequency.boundingBox())!
      expect(panel.height).toBeLessThanOrEqual(390 * 0.85)
      expect(panel.y).toBeGreaterThanOrEqual(24)
      const choices = frequency.getByRole('menuitemcheckbox')
      expect(await choices.count()).toBe(6)
      for (const choice of await choices.all()) {
        await choice.scrollIntoViewIfNeeded()
        const bounds = (await choice.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(inlineInset)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(844 - inlineInset)
        expect(bounds.y).toBeGreaterThanOrEqual(0)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(390 - bottomInset)
      }
    } finally { await page.close() }
  })

  it('preserves the scrolled frequency choice when the focused sheet body resizes', async () => {
    const page = await mount('frequency', 'en', 844, 390, 'dark', 'no-preference')
    await page.getByRole('button', { name: en.habits.listOptions }).click()
    await page.getByRole('menuitem', { name: en.habits.frequencyFilter }).click()
    const choices = page.getByRole('menuitemcheckbox')
    await expect.poll(() => choices.count()).toBe(6)
    await page.getByRole('dialog', { name: en.habits.frequencyFilter }).evaluate(settleAnimations)
    await choices.first().focus()
    await expect.poll(() => choices.first().evaluate((element) => element === document.activeElement)).toBe(true)
    const last = choices.last()
    await last.scrollIntoViewIfNeeded()
    const before = await last.evaluate((element) => {
      const body = element.closest<HTMLElement>('[data-slot="sheet-body"]')!
      return { scrollTop: body.scrollTop, clientHeight: body.clientHeight, scrollHeight: body.scrollHeight, bottom: element.getBoundingClientRect().bottom }
    })
    await choices.first().evaluate((element) => {
      const body = element.closest<HTMLElement>('[data-slot="sheet-body"]')!
      body.style.width = `${body.clientWidth - 1}px`
    })
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const bounds = (await last.boundingBox())!
    const after = await last.evaluate((element) => {
      const body = element.closest<HTMLElement>('[data-slot="sheet-body"]')!
      return { scrollTop: body.scrollTop, clientHeight: body.clientHeight, scrollHeight: body.scrollHeight, active: document.activeElement?.textContent }
    })
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height, JSON.stringify({ before, after })).toBeLessThanOrEqual(390)
  })
})
