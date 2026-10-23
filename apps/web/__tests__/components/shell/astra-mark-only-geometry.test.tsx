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
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'

vi.mock('@/hooks/use-proactive-action', () => ({ useProactiveAction: () => ({ reason: null, allowance: 5, act: vi.fn() }) }))

let browser: Browser
let browserLaunch: BrowserLaunch | undefined
let stylesheet: string
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
