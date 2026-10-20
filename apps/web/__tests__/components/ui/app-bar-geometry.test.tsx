import { render } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { AppBar, APP_BAR_CONTROL_CLASS } from '@/components/ui/app-bar'
import { PageHeader } from '@/components/ui/page-header'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectFocusedRing } from '@/e2e/layout/focus-indicators'
import { Badge } from '@/components/ui/badge'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('Closed header and badge typography in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([en, ptBR])('keeps every consumer title natural and complete at 320 in $chat.title', async (messages) => {
    const titles = [messages.chat.title, messages.habits.detail.screenTitle, messages.habits.form.newHabit, messages.habits.createSubHabit, messages.progressScreen.sections.goals, messages.deleteAccount.title, '']
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      for (const title of titles) {
        const { container, unmount } = render(<AppBar title={title} onBack={vi.fn()} backLabel={messages.common.back}
          action={<button type="button" aria-label={messages.common.closeConversation} className={APP_BAR_CONTROL_CLASS} />} />)
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const heading = page.getByRole('heading')
        const geometry = await heading.evaluate((element) => {
          const style = getComputedStyle(element)
          const text = document.createRange()
          text.selectNodeContents(element)
          const bounds = element.getBoundingClientRect()
          const textBounds = text.getBoundingClientRect()
          return { size: style.fontSize, tracking: style.letterSpacing, casing: style.textTransform, alignment: style.textAlign,
            text: element.textContent, width: bounds.width, textWidth: textBounds.width, textHeight: textBounds.height, lineHeight: parseFloat(style.lineHeight) }
        })
        expect(geometry).toMatchObject({ size: '12px', tracking: 'normal', casing: 'none', alignment: 'start', text: title })
        expect(geometry.textWidth).toBeLessThanOrEqual(geometry.width)
        expect(geometry.textHeight).toBeLessThanOrEqual(geometry.lineHeight)
        const controls = await page.getByRole('button').all()
        const boxes = await Promise.all(controls.map((control) => control.boundingBox()))
        for (const box of boxes) { expect(box!.width).toBeGreaterThanOrEqual(48); expect(box!.height).toBeGreaterThanOrEqual(48) }
        expect(boxes[0]!.x + boxes[0]!.width).toBeLessThan(boxes[1]!.x)
        unmount()
      }
    } finally { await page.close() }
  })

  it.each([600, 1352].flatMap((width) => ['dark', 'light'].map((mode) => ({ width, mode: mode as 'dark' | 'light' }))))('keeps wayfinding targets focused without rings at $width in $mode', async ({ width, mode }) => {
    const { container } = render(<>
      <AppBar title={ptBR.habits.form.newHabit} onBack={vi.fn()} backLabel={ptBR.common.back} />
      <PageHeader title={ptBR.profile.submenus.account} backLabel={ptBR.common.backToProfile} onBack={vi.fn()} />
      <main tabIndex={-1}><section tabIndex={-1} className="orbit-focus-inset"><ul tabIndex={-1}><li tabIndex={-1}><div tabIndex={-1} role="group">Wayfinding</div></li></ul></section></main>
      <aside tabIndex={-1} className="shadow-[inset_1px_0_0_var(--hairline)]">Panel</aside>
      <div role="dialog" tabIndex={-1} className="focus-visible:outline-2">Conversation</div>
      <button tabIndex={-1}>Button</button><a tabIndex={-1} href="#target">Link</a>
      <input tabIndex={-1} aria-label="Field" /><textarea tabIndex={-1} aria-label="Message" />
      <select tabIndex={-1} aria-label="Choice"><option>Choice</option></select>
      <div role="button" tabIndex={-1}>Action</div><div role="menuitem" tabIndex={-1}>Menu item</div>
      <div role="switch" aria-checked="false" tabIndex={-1}>Switch</div>
      <div contentEditable suppressContentEditableWarning tabIndex={-1}>Editable</div>
    </>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([property, value]) => `${property}: ${value};`).join(' ')
      await page.setContent(`<style>${stylesheet}:root {${variables}}</style>${container.innerHTML}`)
      await page.keyboard.press('Tab')
      for (const forcedColors of ['none', 'active'] as const) {
        await page.emulateMedia({ forcedColors })
        const targets = page.locator('h1, main, section, ul, li, [role="group"], aside, [role="dialog"]')
        for (const target of await targets.all()) {
          await page.getByRole('button', { name: ptBR.common.back, exact: true }).focus()
          const shadow = await target.evaluate((element) => getComputedStyle(element).boxShadow)
          await target.focus()
          expect(await target.evaluate((element) => ({ active: element === document.activeElement, outline: getComputedStyle(element).outlineStyle, shadow: getComputedStyle(element).boxShadow })))
            .toEqual({ active: true, outline: 'none', shadow })
        }
        const controls = page.locator('button, a[href], input, textarea, select, [role="button"], [role="menuitem"], [role="switch"], [contenteditable]')
        for (const control of await controls.all()) {
          await control.focus()
          expect(await control.evaluate((element) => ({ active: element === document.activeElement, visible: element.matches(':focus-visible'), outline: getComputedStyle(element).outlineWidth })))
            .toEqual({ active: true, visible: true, outline: '2px' })
          expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
        }
        await page.getByRole('heading', { name: ptBR.habits.form.newHabit }).focus()
        await page.keyboard.press('Tab')
        expect(await page.getByRole('button', { name: ptBR.common.backToProfile }).evaluate((element) => element === document.activeElement)).toBe(true)
      }
    } finally { await page.close() }
  })

  it.each([en, ptBR])('keeps badge labels above the floor and on one line in $common.back', async (messages) => {
    const labels = ['Pro', messages.upgrade.plans.recommended, 'Focus']
    const { container } = render(<div>{labels.map((label) => <Badge key={label}>{label}</Badge>)}</div>)
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const label of labels) {
        const geometry = await page.getByText(label, { exact: true }).evaluate((element) => {
          const text = document.createRange()
          text.selectNodeContents(element)
          return { size: getComputedStyle(element).fontSize, lines: text.getClientRects().length, width: text.getBoundingClientRect().width, available: element.clientWidth }
        })
        expect(geometry.size).toBe('12px')
        expect(geometry.lines).toBe(1)
        expect(geometry.width).toBeLessThanOrEqual(geometry.available)
      }
    } finally { await page.close() }
  })
})
