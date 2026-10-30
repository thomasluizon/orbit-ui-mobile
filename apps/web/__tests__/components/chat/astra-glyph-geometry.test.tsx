import { createChatThreadScroll } from '@orbit/shared/hooks'
import { createRef } from 'react'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { AstraConversation } from '@/components/chat/conversation'
import { Composer } from '@/components/shell/composer'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let browser: Browser
let browserLaunch: BrowserLaunch | undefined
let stylesheet: string
registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterEach(cleanup)
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it.each([390, 1280].flatMap(width => [en, ptBR].map(messages => ({ width, messages }))))(
  'centres the drawn Astra mark on each surface at $width in both locales', async ({ width, messages }) => {
    const composerProps = {
      state: 'idle' as const, value: '', onChangeValue: vi.fn(), onSend: vi.fn(), words: messages.shell.composer,
      suggestions: [{ id: 'starter', label: messages.shell.composer.chips.habitDetail.rename, onSelect: vi.fn() }],
    }
    const chat = {
      threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(),
      messages: [], activeSteps: [], canShowFollowUps: false, isTyping: false, streamingMessageId: null,
      showSuggestions: true, sendMessage: vi.fn(), composerProps,
    } as unknown as Parameters<typeof AstraConversation>[0]['chat']
    const { container } = render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
      <div style={{ maxWidth: 740 }}><AstraConversation chat={chat} /></div>
      <Composer {...composerProps} suggestions={[]} onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation} />
      <TodayAstraLine text={messages.todayAstra.openConversation} destination={messages.chat.title} onPress={vi.fn()} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const surfaces = await page.evaluate(() => {
        const owners = [document.querySelector('header'), document.querySelector('[data-composer-suggestion-row] button'),
          document.querySelector('[data-open-conversation]'), document.querySelector('.today-astra-line')]
        return owners.map(owner => {
          if (!owner) throw new Error('Missing Astra surface')
          const svg = owner.querySelector<SVGSVGElement>('svg[data-asset]')!
          const path = svg.querySelector('path')!
          const bounds = path.getBBox()
          const matrix = path.getScreenCTM()!
          const drawnCentre = new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).matrixTransform(matrix)
          const row = owner.getBoundingClientRect()
          return { asset: svg.getAttribute('data-asset'), offset: drawnCentre.y - row.y - row.height / 2 }
        })
      })
      expect(surfaces).toHaveLength(4)
      for (const surface of surfaces) expect.soft(Math.abs(surface.offset)).toBeLessThanOrEqual(1)
      for (const surface of surfaces) expect(surface.asset).toBe('astra-mark')
    } finally { await page.close() }
  },
)
