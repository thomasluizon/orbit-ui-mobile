import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createTagSuggestionState } from '@orbit/shared/hooks'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { TagSuggestions } from '@/components/habits/habit-form-fields/tag-suggestions'
import { Composer } from '@/components/shell/composer'
import { ShellWide } from '@/components/shell/shell-wide'
import { PromptIdea } from '@/components/chat/prompt-idea'
import { FollowUpChips } from '@/components/chat/follow-up-chips'
import { ProactiveAction } from '@/components/chat/proactive-action'
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
  .flatMap(viewport => [en, ptBR].map(messages => ({ ...viewport, messages })))

it.each(cases)('keeps habit content clear at $width by $height', async ({ width, height, messages }) => {
  const locale = messages === en ? 'en' : 'pt-BR'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const onSelect = vi.fn()
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
    <ShellWide items={[]} activeId="hoje" navLabel={messages.nav.mainNavigation}
      astraRow={{ label: messages.nav.astra, onOpen: vi.fn() }}
      header={<h1>Habit</h1>}
      composer={<Composer state="idle" value="Draft" onChangeValue={vi.fn()} onSend={vi.fn()}
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
  const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
  const page = await browser.newPage({ viewport: { width, height } })
  try {
    await page.setContent(`<html class="dark" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
    const result = await page.evaluate(() => {
      const composer = document.querySelector<HTMLElement>('[data-composer-root]')!
      const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
      scroller.scrollTop = scroller.scrollHeight
      const last = document.querySelector('[data-last-habit-row]')!.getBoundingClientRect()
      const controls = [...document.querySelectorAll('button')].filter(button => !button.hasAttribute('data-shell-astra-row') && button.querySelector('[data-asset^="astra-mark"]') && button.getBoundingClientRect().height > 0)
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
    expect(result.controls.length).toBeGreaterThan(0)
    for (const control of result.controls) {
      expect(control.text).not.toMatch(/Astra/)
      expect(control.name).toBeTruthy()
    }
  } finally { await page.close() }
})

it.each([320, 480, 800].flatMap(width => [en, ptBR].flatMap(messages =>
  [1, 2].flatMap(fontScale => ['empty', 'draft', 'sending'].map(state => ({ width, messages, state, fontScale }))),
)))('keeps equal fill clearance between 48px composer targets at $width in $state with text $fontScale', async ({ width, messages, state, fontScale }) => {
  vi.stubGlobal('navigator', { clipboard: { readText: vi.fn().mockResolvedValue('Draft') } })
  const view = render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
    <Composer {...(state === 'sending' ? { state: 'sending' as const } : { state: 'idle' as const })} value={state === 'empty' ? '' : 'Draft'}
      words={messages.shell.composer} suggestions={[]} onChangeValue={vi.fn()} onSend={vi.fn()}
      onAttachFile={vi.fn()} attachWords={{ ...messages.shell.composer.attach, remove: name => name }} />
  </NextIntlClientProvider>)
  const page = await browser.newPage({ viewport: { width, height: 640 } })
  try {
    await page.setContent(`<html class="dark" style="${themeVariables};font-size:${16 * fontScale}px"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
    const targets = await page.locator('[data-composer-trailing-controls] button').evaluateAll(buttons => buttons.map(button => ({
      ...button.getBoundingClientRect().toJSON(), text: button.textContent,
      marks: button.querySelectorAll('[data-asset^="astra-mark"]').length,
      name: button.getAttribute('aria-label'), icons: button.querySelectorAll('svg').length,
    })))
    expect(targets).toHaveLength(state === 'sending' ? 2 : 3)
    for (const [index, target] of targets.entries()) {
      expect(target.width).toBe(48)
      expect(target.height).toBe(48)
      expect(target.text).toBe('')
      expect(target.name).toBeTruthy()
      expect(target.marks).toBe(0)
      expect(target.icons).toBe(1)
      if (index > 0) expect(target.left - targets[index - 1]!.right).toBe(INTERACTION_FILL_CLEARANCE)
    }
  } finally { await page.close() }
})


it.each([en, ptBR].flatMap(messages => [false, true].map(pending => ({ messages, pending }))))(
  'keeps one form suggestion mark at rest and on the skeleton face while pending=$pending in 48px targets', async ({ messages, pending }) => {
    const onSuggest = vi.fn()
    const translator = createTranslator({ locale: messages === en ? 'en' : 'pt-BR', messages })
    const t = (key: string, values?: Record<string, string | number | Date>) => translator(key as Parameters<typeof translator>[0], values)
    const view = render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
      <HabitEmojiSelector onSuggest={onSuggest} canSuggest isSuggesting={pending} selectedEmoji="" onSelect={vi.fn()} />
      <TagSuggestions translateError={t} atLimit={false} disabled={false} suggestions={{ ...createTagSuggestionState(), pending: pending ? 'suggest' : null,
        canSuggest: !pending, needsTitle: false, suggest: vi.fn().mockResolvedValue(undefined), acceptSuggestion: vi.fn().mockResolvedValue(undefined) }} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 480, height: 640 } })
    try {
      await page.setContent(`<html class="dark" style="${themeVariables}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
      for (const name of [messages.habits.form.suggestEmoji, messages.habits.form.suggestTags]) {
        const action = page.getByRole('button', { name, exact: true })
        expect(await action.innerText()).toBe('')
        expect(await action.locator('[data-asset="astra-mark"]').count()).toBe(1)
        expect(await action.locator('[data-slot="skeleton-face"]').count()).toBe(pending ? 1 : 0)
        expect(await action.locator('svg').count()).toBe(1)
        const bounds = (await action.boundingBox())!
        expect(bounds.width).toBe(48)
        expect(bounds.height).toBe(48)
        expect(await action.getAttribute('aria-busy')).toBe(pending ? 'true' : null)
      }
    } finally { await page.close() }
  },
)
