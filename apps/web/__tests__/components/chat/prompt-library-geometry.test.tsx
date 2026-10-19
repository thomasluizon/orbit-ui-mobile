import { createRef } from 'react'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { AstraConversation } from '@/components/chat/conversation'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { PROMPT_CATEGORIES, PROMPT_TEMPLATES } from '@orbit/shared/chat/prompt-library'
import { PromptLibrary } from '@/components/chat/prompt-library'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { expectLabelsFit, markRequiredLabels } from '@/e2e/layout/label-fit-contract'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => <div style={{ height: 128 }} /> }))

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterEach(() => { cleanup(); vi.doUnmock('@/components/chat/prompt-library') })
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

const cases = [320, 412, 1352].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale })))
it.each(cases)('keeps every template label whole and categories on one row at $width in $locale', async ({ width, locale }) => {
  const messages = locale === 'en' ? en : pt
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
    <div style={{ position: 'relative', width, height: 800 }}><PromptLibrary onBack={() => {}} onSelect={() => {}} suggestions={[]} hasProAccess hasGoogleConnection /></div>
  </NextIntlClientProvider>)
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    for (const category of PROMPT_CATEGORIES) {
      fireEvent.click(screen.getByRole('button', { name: messages.chat.templates.categories[category] }))
      const library = container.querySelector<HTMLElement>('[data-prompt-library]')!
      library.style.opacity = '1'
      library.style.transform = 'none'
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const titles = page.locator('[data-slot="list-row-title"]')
      expect(await titles.count()).toBe(PROMPT_TEMPLATES.filter(template => template.category === category).length)
      await markRequiredLabels(titles)
      await expectLabelsFit(page, page.locator('[data-prompt-library]'))
      const filter = await page.locator('[data-prompt-categories]').evaluate(element => {
        const children = Array.from(element.children).map(child => child.getBoundingClientRect())
        return { wrap: getComputedStyle(element).flexWrap, tops: children.map(child => child.top), height: element.clientHeight }
      })
      expect(filter.wrap).toBe('nowrap')
      expect(new Set(filter.tops).size).toBe(1)
      expect(filter.height).toBeGreaterThanOrEqual(48)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }
  } finally { await page.close() }
}, 30_000)

it('paints the library above the retained conversation', async () => {
  const chat = {
    threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(),
    messages: [], activeSteps: [], isTyping: false, streamingMessageId: null, showSuggestions: true,
    canShowFollowUps: false, sendMessage: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as Parameters<typeof AstraConversation>[0]['chat']
  const { container } = render(<NextIntlClientProvider locale="en" messages={en}><div style={{ width: 320, height: 800 }}><AstraConversation chat={chat} /></div></NextIntlClientProvider>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[0]!)
  await screen.findByRole('heading', { name: 'Ideas' })
  const library = container.querySelector<HTMLElement>('[data-prompt-library]')!
  library.style.opacity = '1'
  library.style.transform = 'none'
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } })
  try {
    await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
    await loadAppFonts(page)
    const above = await page.evaluate(() => {
      document.querySelector('[inert]')?.removeAttribute('inert')
      return !!document.elementFromPoint(280, 24)?.closest('[data-prompt-library]')
    })
    expect(above).toBe(true)
  } finally { await page.close() }
})

it.each(cases)('keeps the failed load and its recovery controls visible at $width in $locale', async ({ width, locale }) => {
  vi.doMock('@/components/chat/prompt-library', () => { throw new Error('Library chunk unavailable') })
  const messages = locale === 'en' ? en : pt
  const chat = {
    threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(),
    messages: [], activeSteps: [], isTyping: false, streamingMessageId: null, showSuggestions: true,
    canShowFollowUps: false, sendMessage: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as Parameters<typeof AstraConversation>[0]['chat']
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
    <div style={{ width, height: 800 }}><AstraConversation chat={chat} /></div>
  </NextIntlClientProvider>)
  fireEvent.click(screen.getAllByRole('button', { name: messages.chat.templates.browse })[0]!)
  await screen.findByRole('alert')
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    for (const appearance of ['dark', 'light']) {
      await page.setContent(`<style>${stylesheet}</style><div class="${appearance}">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      const library = page.locator('[data-prompt-library]')
      await markRequiredLabels(library.locator('h1, button'))
      await expectLabelsFit(page, library)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      const controls = await library.locator('button').evaluateAll(buttons => buttons.map(button => {
        const bounds = button.getBoundingClientRect()
        return { width: bounds.width, height: bounds.height, top: bounds.top, bottom: bounds.bottom }
      }))
      expect(controls).toHaveLength(2)
      for (const control of controls) {
        expect(control.top).toBeGreaterThanOrEqual(0)
        expect(control.bottom).toBeLessThanOrEqual(800)
        expect(control.width).toBeGreaterThan(0)
      }
      expect(controls[0]!.height).toBeGreaterThanOrEqual(48)
    }
  } finally { await page.close() }
})
