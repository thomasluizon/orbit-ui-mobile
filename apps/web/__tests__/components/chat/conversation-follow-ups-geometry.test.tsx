import { createRef } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { buildChatFinalMessageFields } from '@orbit/shared/chat'
import { chatResponseSchema } from '@orbit/shared/types/chat'
import { AstraConversation } from '@/components/chat/conversation'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))

const questions = [
  'Quer revisar os seus hábitos e planejar a rotina pra amanhã?',
  'Quer revisar os seus hábitos e planejar a rotina pra depois?',
]
const finalResponse = chatResponseSchema.parse({
  aiMessage: 'Podemos revisar a sua rotina.', actions: [], followUps: questions,
})
type ChatController = Parameters<typeof AstraConversation>[0]['chat']

function createChat(withTrace = false): ChatController {
  return {
    chatContainerRef: createRef<HTMLDivElement>(),
    messages: [{ id: 'answer', role: 'ai', timestamp: new Date(),
      ...buildChatFinalMessageFields(finalResponse, withTrace ? [{ domain: 'habits', access: 'read' }] : []) }],
    activeSteps: [], showSuggestions: false, isTyping: false, streamingMessageId: null,
    canShowFollowUps: true, sendMessage: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as ChatController
}

const cases = [320, 412, 1100, 1352].flatMap(width => [1, 2].flatMap(textScale =>
  [false, true].map(withTrace => ({ width, textScale, withTrace }))))

describe('Follow-up conversation geometry in Chromium', () => {
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

  it.each(cases)('shows whole questions at $width with text scale $textScale and trace $withTrace', async ({ width, textScale, withTrace }) => {
    const chat = createChat(withTrace)
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}>
      <div style={{ width: width >= 1024 ? 380 : width }}><AstraConversation chat={chat} /></div>
    </NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: questions[0] }))
    expect(chat.sendMessage).toHaveBeenCalledWith(questions[0], 'followUp')
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="dark">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      await page.addStyleTag({ content: `html { font-size: ${16 * textScale}px; }` })
      const geometry = await page.getByRole('group', { name: pt.chat.followUps.label }).evaluate((group, words) => {
        const message = document.querySelector('[data-bubble-role="ai"]')!
        const copy = [...document.querySelectorAll('button')].find(button => button.textContent === words.chat.copy)!
        const label = group.querySelector('span')!
        const rows = [...group.querySelectorAll('button')].map(row => {
          const text = row.querySelector('span')!
          const bounds = row.getBoundingClientRect()
          const style = getComputedStyle(row)
          return { left: bounds.left, width: bounds.width, height: bounds.height, title: row.getAttribute('title'),
            scrollWidth: text.scrollWidth, clientWidth: text.clientWidth, scrollHeight: text.scrollHeight, clientHeight: text.clientHeight,
            overflow: getComputedStyle(text).textOverflow, whiteSpace: getComputedStyle(text).whiteSpace,
            fontSize: parseFloat(getComputedStyle(text).fontSize), radius: style.borderRadius,
            paddingBlock: style.paddingBlockStart, paddingInline: style.paddingInlineStart, textAlign: style.textAlign }
        })
        const trace = [...document.querySelectorAll('button')].find(button => button.hasAttribute('aria-expanded'))
        return { rows, messageLeft: message.getBoundingClientRect().left,
          groupWidth: group.getBoundingClientRect().width, labelGap: label.getBoundingClientRect().top - copy.getBoundingClientRect().bottom,
          traceLeft: trace?.getBoundingClientRect().left }
      }, pt)
      expect(geometry.rows).toHaveLength(2)
      for (const row of geometry.rows) {
        expect.soft(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
        expect.soft(row.scrollHeight).toBeLessThanOrEqual(row.clientHeight)
        expect.soft(row.overflow).not.toBe('ellipsis')
        expect.soft(row.whiteSpace).not.toBe('nowrap')
        expect.soft(row.title).toBeNull()
        expect.soft(Math.abs(row.left - geometry.messageLeft)).toBeLessThanOrEqual(1)
        expect.soft(row.width).toBeCloseTo(geometry.groupWidth, 0)
        expect.soft(row.height).toBeGreaterThanOrEqual(48)
        expect.soft(row.radius).toBe('12px')
        expect.soft(row.paddingBlock).toBe('12px')
        expect.soft(row.paddingInline).toBe('16px')
        expect.soft(row.textAlign).toBe('start')
        expect(row.fontSize).toBe(14 * textScale)
      }
      expect.soft(geometry.labelGap).toBeGreaterThanOrEqual(16)
      if (withTrace) expect.soft(Math.abs(geometry.traceLeft! - geometry.messageLeft)).toBeLessThanOrEqual(1)
    } finally { await page.close() }
  })
})
