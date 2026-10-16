import { skeletonPulseIterations } from '@orbit/shared/theme'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { createRef } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contrastOnSurface, withAlpha } from '@orbit/shared/__tests__/contrast'
import en from '@orbit/shared/i18n/en.json'
import { AstraConversation } from '@/components/chat/conversation'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))

type ChatController = Parameters<typeof AstraConversation>[0]['chat']
function createChat(): ChatController {
  return {
    threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(),
    messages: [{ id: 'question', role: 'user', content: 'Plan my morning', timestamp: new Date() }],
    activeSteps: [], showSuggestions: false, isTyping: true, streamingMessageId: null,
    canShowFollowUps: false, sendMessage: vi.fn(), composerProps: { suggestions: [], state: 'sending' },
  } as unknown as ChatController
}

describe('Astra pending reply geometry in Chromium', () => {
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

  it.each([412, 1352].flatMap(width => ['light', 'dark'].flatMap(theme => [false, true].map(reduced => ({ width, theme, reduced })))))('reserves the reply start at $width in $theme, reduced motion $reduced', async ({ width, theme, reduced }) => {
    const chat = createChat()
    const content = () => <NextIntlClientProvider locale="en" messages={en}>
      <div style={{ width: '100%', maxWidth: 740, marginInline: 'auto', height: 915 }}><AstraConversation chat={chat} /></div>
    </NextIntlClientProvider>
    const { container, rerender } = render(content())
    expect(container.querySelector('[data-astra-pending]')).not.toBeNull()
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', theme as 'light' | 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}
        .${theme} { ${variables} }</style><div class="${theme}" style="background:var(--bg)">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      await page.evaluate(iterations => document.documentElement.style.setProperty('--skeleton-pulse-iterations', String(iterations)), skeletonPulseIterations)
      const pending = page.locator('[data-astra-pending]')
      const position = await pending.boundingBox()
      expect(position).not.toBeNull()
      expect(await pending.locator('[data-working-mark] > span').count()).toBe(3)
      const animation = await pending.evaluate(element => {
        const mark = element.querySelector('.astra-pending-pulse')!
        return { name: getComputedStyle(mark).animationName, opacity: getComputedStyle(mark).opacity, height: element.getBoundingClientRect().height, duration: getComputedStyle(mark).animationDuration, iterations: getComputedStyle(mark).animationIterationCount, foreground: getComputedStyle(mark.querySelector('[data-working-mark]')!).color, background: getComputedStyle(element.closest('.light, .dark')!).backgroundColor }
      })
      expect(animation.height).toBe(24)
      const contrast = contrastOnSurface(withAlpha(animation.foreground, 0.6), [animation.background])
      expect(contrast).toBeGreaterThanOrEqual(3)
      if (reduced) {
        expect(animation.name).toBe('none')
        expect(animation.opacity).toBe('1')
      } else {
        expect(animation.name).not.toBe('none')
        expect(Number(animation.iterations)).toBe(skeletonPulseIterations)
        expect(parseFloat(animation.duration) * Number(animation.iterations)).toBeLessThanOrEqual(5)
      }
      chat.isTyping = false
      chat.streamingMessageId = 'reply'
      chat.messages = [...chat.messages, { id: 'reply', role: 'ai', content: 'Start with water', timestamp: new Date() }]
      rerender(content())
      await page.locator(`.${theme}`).evaluate((element, markup) => { element.innerHTML = markup }, container.innerHTML)
      expect(await page.locator('[data-astra-pending]').count()).toBe(0)
      const reply = await page.locator('[data-bubble-role="ai"]').boundingBox()
      expect(reply).not.toBeNull()
      expect(reply!.x).toBeCloseTo(position!.x, 1)
      expect(reply!.y).toBeCloseTo(position!.y, 1)
    } finally { await page.close() }
  })
})
