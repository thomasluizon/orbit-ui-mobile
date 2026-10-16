import { createChatThreadScroll } from '@orbit/shared/hooks'
import { createRef } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { chatBlockLayoutCases, makeChatBlockLayoutMessage } from '@orbit/shared/test-support/chat-block-layout'
import { MessageBubble } from '@/components/chat/message-bubble'
import { AstraConversation } from '@/components/chat/conversation'
import { settleAnimations } from '@/e2e/layout/settle-animations'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: { habitsById: new Map() } }), useLogHabit: () => ({ mutate: vi.fn() }),
  useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value, displayClock: (value: string) => value }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

type ChatController = Parameters<typeof AstraConversation>[0]['chat']
const cases = [412, 600, 1352].flatMap(width => ['en', 'pt-BR'].flatMap(locale =>
  chatBlockLayoutCases.flatMap(scenario => [true, false].map(prose => ({ width, locale, scenario, prose, kind: scenario.kind })))))

describe('Astra block layout in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 412, 1352])('keeps three replies and a sent message natively selectable at %s', async width => {
    const contents = ['First reply.', 'Second **reply** with a [link](https://example.com).', 'Third reply with `code`.', 'My sent message.']
    const { container } = render(<NextIntlClientProvider locale="en" messages={en}>
      {contents.map((content, index) => <MessageBubble key={content} message={makeHeldHabitMessage({
        id: String(index), role: index === 3 ? 'user' : 'ai', content, pendingOperations: [],
      })} />)}
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const bubbles = page.locator('[data-bubble-role]')
      expect(await bubbles.count()).toBe(4)
      expect(await page.getByRole('button').count()).toBe(0)
      for (const bubble of await bubbles.all()) {
        expect(await bubble.evaluate(element => getComputedStyle(element).userSelect)).toBe('text')
        const selected = await bubble.evaluate(element => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const selection = window.getSelection()!
          selection.removeAllRanges()
          selection.addRange(range)
          return selection.toString()
        })
        expect(selected).toBe(await bubble.innerText())
        expect(selected.length).toBeGreaterThan(0)
      }
    } finally { await page.close() }
  })

  it.each(['finish', 'cancel', 'replace'] as const)('settles a newly completed block-only outcome turn after %s before reading its geometry', async mode => {
    const scenario = chatBlockLayoutCases.find(scenario => scenario.kind === 'outcome')!
    const chat = {
      threadScroll: createChatThreadScroll(), chatContainerRef: createRef<HTMLDivElement>(), messages: [],
      activeSteps: [], showSuggestions: false, isTyping: false, streamingMessageId: null, canShowFollowUps: false,
      composerProps: { state: 'idle', value: '', onChangeValue: vi.fn(), onSend: vi.fn(), suggestions: [],
        words: { placeholder: pt.shell.composer.placeholder, send: pt.shell.composer.send,
          actions: pt.shell.composer.actions, suggestionsLabel: pt.shell.composer.suggestionsLabel },
      },
    } as unknown as ChatController
    const surface = (controller: ChatController) => <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <div style={{ height: 915, width: 740 }}><AstraConversation chat={controller} /></div>
    </NextIntlClientProvider>
    const { container, rerender } = render(surface(chat))
    rerender(surface({ ...chat, messages: [makeChatBlockLayoutMessage(scenario, false)] }))
    const page = await browser.newPage({ viewport: { width: 1352, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}\n.animate-msg-in { animation-play-state: paused; }</style>${container.innerHTML}`)
      const turn = page.getByRole('article')
      const starting = await turn.evaluate(article => {
        const animations = article.getAnimations({ subtree: true })
        for (const animation of animations) animation.currentTime = 0
        return { count: animations.length,
          offset: article.querySelector('section[data-state]')!.getBoundingClientRect().top - article.getBoundingClientRect().top }
      })
      expect(starting.count).toBe(1)
      expect(starting.offset).toBeCloseTo(8, 1)
      await turn.evaluate((article, mode) => {
        const readAnimations = article.getAnimations.bind(article)
        const animations = readAnimations({ subtree: true })
        if (mode === 'finish') {
          for (const animation of animations) animation.play()
          return
        }
        article.getAnimations = options => {
          article.getAnimations = readAnimations
          const running = readAnimations(options)
          queueMicrotask(() => {
            for (const animation of animations) animation.cancel()
            if (mode === 'replace') article.querySelector('section[data-state]')!.animate(
              [{ transform: 'translateY(8px)' }, { transform: 'translateY(0)' }], { duration: 100, fill: 'forwards' },
            )
          })
          return running
        }
      }, mode)
      await page.evaluate(() => document.fonts.ready)
      await turn.evaluate(settleAnimations)
      expect(await turn.evaluate(article =>
        article.querySelector('section[data-state]')!.getBoundingClientRect().top - article.getBoundingClientRect().top,
      )).toBeCloseTo(0, 1)
    } finally { await page.close() }
  })

  it.each(cases)('spaces $kind at $width in $locale with prose=$prose', async ({ width, locale, scenario, prose }) => {
    const messages = locale === 'en' ? en : pt
    const chat = {
      threadScroll: createChatThreadScroll(), chatContainerRef: createRef<HTMLDivElement>(),
      messages: [makeHeldHabitMessage({ id: 'previous', content: 'Review the routine.', pendingOperations: [] }), makeChatBlockLayoutMessage(scenario, prose)],
      activeSteps: [], showSuggestions: false, isTyping: false, streamingMessageId: null, canShowFollowUps: false,
      sendMessage: vi.fn(), confirmAndExecutePendingOperation: vi.fn(), prepareStepUpForBubble: vi.fn(), verifyStepUpForBubble: vi.fn(),
      composerProps: { state: 'idle', value: '', onChangeValue: vi.fn(), onSend: vi.fn(),
        words: { placeholder: messages.shell.composer.placeholder, send: messages.shell.composer.send,
          actions: messages.shell.composer.actions, suggestionsLabel: messages.shell.composer.suggestionsLabel },
        suggestions: [{ id: 'one', label: 'Review', onSelect: vi.fn() }, { id: 'two', label: 'Plan', onSelect: vi.fn() }],
      },
    } as unknown as ChatController
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <div style={{ height: 915, width: width >= 1024 ? 740 : width }}><AstraConversation chat={chat} /></div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="dark">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      await page.getByRole('article').last().evaluate(settleAnimations)
      const geometry = await page.evaluate(() => {
        const bounds = (element: Element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width }
        }
        const turns = [...document.querySelectorAll('article')]
        const prose = (turn: Element) => turn.querySelector('[data-bubble-role="ai"]')
        return { previousProse: bounds(prose(turns[0]!)!), currentProse: prose(turns[1]!) ? bounds(prose(turns[1]!)!) : null,
          turn: bounds(turns[1]!), blocks: [...turns[1]!.querySelectorAll('section[data-state]')].map(bounds),
          composer: bounds(document.querySelector('[data-composer-input-row]')!),
          chips: bounds(document.querySelector('[data-composer-root] [role="group"]')!),
          prose: [...turns[1]!.querySelectorAll('[data-bubble-role="ai"]')].map(bounds),
        }
      })
      expect(geometry.blocks).toHaveLength(scenario.count)
      expect.soft(geometry.turn.top - geometry.previousProse.bottom).toBeCloseTo(16, 1)
      expect.soft(geometry.blocks[0]!.top - (geometry.currentProse?.bottom ?? geometry.previousProse.bottom)).toBeCloseTo(16, 1)
      for (const [index, block] of geometry.blocks.entries()) {
        expect.soft(block.left).toBeCloseTo(geometry.composer.left, 1)
        expect.soft(block.right).toBeCloseTo(geometry.composer.right, 1)
        expect.soft(block.right).toBeCloseTo(geometry.chips.right, 1)
        if (index > 0) expect.soft(block.top - geometry.blocks[index - 1]!.bottom).toBeCloseTo(16, 1)
      }
      if (prose && width === 1352) expect(geometry.prose[0]!.width).toBeLessThan(geometry.blocks[0]!.width)
    } finally { await page.close() }
  })
})
