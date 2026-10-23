import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Composer } from '@/components/shell/composer'
import { ShellWide } from '@/components/shell/shell-wide'
import { PromptIdea } from '@/components/chat/prompt-idea'
import { FollowUpChips } from '@/components/chat/follow-up-chips'
import { ProactiveAction } from '@/components/chat/proactive-action'
import { useUIStore } from '@/stores/ui-store'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'

vi.mock('@/hooks/use-proactive-action', () => ({ useProactiveAction: () => ({ reason: null, allowance: 5, act: vi.fn() }) }))

let browser: Browser
let browserLaunch: BrowserLaunch | undefined
let stylesheet: string
const themeVariables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

const cases = [{ width: 480, height: 640 }, { width: 800, height: 360 }, { width: 1352, height: 640 }]
  .flatMap(viewport => [en, ptBR].flatMap(messages => [false, true].map(collapsed => ({ ...viewport, messages, collapsed }))))

it.each(cases)('keeps habit content clear with collapse $collapsed at $width by $height', async ({ width, height, messages, collapsed }) => {
  const locale = messages === en ? 'en' : 'pt-BR'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  useUIStore.setState({ habitComposerCollapsed: false })
  const onSelect = vi.fn()
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
    <ShellWide items={[]} activeId="hoje" navLabel={messages.nav.mainNavigation}
      astraRow={{ label: messages.todayAstra.openConversation, onOpen: vi.fn() }}
      header={<h1>Habit</h1>}
      composer={<Composer collapsible state="idle" value="Draft" onChangeValue={vi.fn()} onSend={vi.fn()}
        words={messages.shell.composer} onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation}
        onRetry={vi.fn()} suggestions={[
          { id: 'pause', label: messages.shell.composer.chips.habitDetail.pauseThisWeek, onSelect },
          { id: 'rename', label: messages.shell.composer.chips.habitDetail.rename, onSelect },
        ]} />}>
      <div style={{ height: 900 }} />
      <PromptIdea disabled={false} label={messages.habits.detail.askAstra} onSelect={onSelect} />
      <FollowUpChips followUps={[messages.habits.actions.rescheduleAstra, messages.habits.detail.askAstra]} onSelect={onSelect} />
      <ProactiveAction item={createMockProactiveItem()} acted={false} isOnline onSend={vi.fn().mockResolvedValue(undefined)} />
      <p data-last-habit-row>Last habit content</p>
    </ShellWide>
  </NextIntlClientProvider>)
  if (collapsed) fireEvent.click(screen.getByRole('button', { name: messages.shell.composer.collapse }))
  const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
  const page = await browser.newPage({ viewport: { width, height } })
  try {
    await page.setContent(`<html class="dark" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
    const result = await page.evaluate(() => {
      const composer = document.querySelector<HTMLElement>('[data-composer-root]')!
      const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
      scroller.scrollTop = scroller.scrollHeight
      const last = document.querySelector('[data-last-habit-row]')!.getBoundingClientRect()
      const controls = [...document.querySelectorAll('button')].filter(button => button.querySelector('[data-asset^="astra-mark"]') && button.getBoundingClientRect().height > 0)
      return {
        composerTop: composer.getBoundingClientRect().top,
        composerHeight: composer.getBoundingClientRect().height,
        scrollerBottom: scroller.getBoundingClientRect().bottom,
        lastBottom: last.bottom,
        controls: controls.map(button => ({ text: button.textContent, name: button.getAttribute('aria-label') ?? button.textContent })),
      }
    })
    expect(result.lastBottom).toBeLessThanOrEqual(result.scrollerBottom + 1)
    expect(result.scrollerBottom).toBeLessThanOrEqual(result.composerTop + 1)
    if (collapsed) expect(result.composerHeight).toBeLessThanOrEqual(64)
    expect(result.controls.length).toBeGreaterThan(0)
    for (const control of result.controls) {
      expect(control.text).not.toMatch(/Astra/)
      expect(control.name).toBeTruthy()
    }
  } finally { await page.close() }
})

const disclosureCases = [320, 412, 480, 840].flatMap(width => [en, ptBR].flatMap(messages =>
  [false, true].map(withSuggestions => ({ width, messages, withSuggestions })),
))

it.each(disclosureCases)('adds no expanded height at $width with suggestions=$withSuggestions in both locales', async ({ width, messages, withSuggestions }) => {
  useUIStore.setState({ habitComposerCollapsed: false })
  const props = {
    state: 'idle' as const, value: 'Draft', onChangeValue: vi.fn(), onSend: vi.fn(), words: messages.shell.composer,
    onOpenConversation: vi.fn(), conversationLabel: messages.todayAstra.openConversation,
    onAttachFile: vi.fn(), attachWords: { ...messages.shell.composer.attach, remove: (name: string) => name },
    suggestions: withSuggestions ? [
      { id: 'pause', label: messages.shell.composer.chips.habitDetail.pauseThisWeek, onSelect: vi.fn() },
      { id: 'rename', label: messages.shell.composer.chips.habitDetail.rename, onSelect: vi.fn() },
    ] as const : [] as const,
  }
  const view = render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
    <Composer {...props} /><Composer {...props} collapsible />
  </NextIntlClientProvider>)
  const page = await browser.newPage({ viewport: { width, height: 915 } })
  try {
    await page.setContent(`<html class="dark" style="${themeVariables}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
    await loadAppFonts(page)
    const heights = await page.locator('[data-composer-root]').evaluateAll(roots => roots.map(root => root.getBoundingClientRect().height))
    expect(heights[1]).toBeLessThanOrEqual(heights[0]!)
    const toggle = page.getByRole('button', { name: messages.shell.composer.collapse })
    const row = page.locator(withSuggestions ? '[data-composer-suggestion-row]' : '[data-composer-input-row]').last()
    const toggleBounds = (await toggle.boundingBox())!
    const rowBounds = (await row.boundingBox())!
    expect(toggleBounds.height).toBe(48)
    expect(toggleBounds.y).toBeGreaterThanOrEqual(rowBounds.y)
    expect(toggleBounds.y + toggleBounds.height).toBeLessThanOrEqual(rowBounds.y + rowBounds.height)
    if (withSuggestions) {
      const strip = (await row.getByRole('group').boundingBox())!
      expect(strip.x + strip.width).toBeLessThanOrEqual(toggleBounds.x - 4)
    }
    const glyph = (await toggle.locator('svg').boundingBox())!
    expect(glyph.x).toBeGreaterThanOrEqual(toggleBounds.x + 4)
    expect(glyph.y).toBeGreaterThanOrEqual(toggleBounds.y + 4)
    expect(glyph.x + glyph.width).toBeLessThanOrEqual(toggleBounds.x + toggleBounds.width - 4)
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(toggleBounds.y + toggleBounds.height - 4)
    for (const state of ['hover', 'press'] as const) {
      await toggle.hover()
      if (state === 'press') await page.mouse.down()
      await toggle.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)) })
      expect(await toggle.boundingBox()).toEqual(toggleBounds)
      expect(await toggle.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    }
    await page.mouse.up()
    for (const label of await page.locator('[data-composer-root]').last().locator('[data-suggestion-label]').all()) {
      expect(await label.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length })).toBe(1)
    }
  } finally { await page.close() }
})

it.each([320, 412, 480, 840].flatMap(width => [en, ptBR].map(messages => ({ width, messages }))))(
  'keeps the collapsed disclosure at 48px with doubled text at $width', async ({ width, messages }) => {
    useUIStore.setState({ habitComposerCollapsed: true })
    const view = render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
      <Composer collapsible state="idle" value="Draft" onChangeValue={vi.fn()} onSend={vi.fn()} words={messages.shell.composer} suggestions={[]} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 640 } })
    try {
      await page.setContent(`<html class="dark" style="${themeVariables}"><style>${stylesheet}html{font-size:32px}</style><body>${view.container.innerHTML}</body></html>`)
      const row = page.getByRole('button', { name: messages.shell.composer.expand })
      expect((await row.boundingBox())!.height).toBe(48)
      expect(await row.innerText()).toBe('')
      for (const forcedColors of ['none', 'active'] as const) {
        await page.emulateMedia({ forcedColors })
        await row.focus()
        const indicator = await row.evaluate(element => {
          const style = getComputedStyle(element)
          return { width: style.outlineWidth, offset: style.outlineOffset, outline: style.outlineStyle,
            shadow: style.boxShadow, before: getComputedStyle(element, '::before').outlineStyle, after: getComputedStyle(element, '::after').outlineStyle }
        })
        expect(indicator).toEqual({ width: '2px', offset: '2px', outline: 'solid', shadow: 'none', before: 'none', after: 'none' })
      }
    } finally { await page.close() }
  },
)
