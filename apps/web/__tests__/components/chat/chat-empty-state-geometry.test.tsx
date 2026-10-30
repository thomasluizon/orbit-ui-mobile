import { createChatThreadScroll } from '@orbit/shared/hooks'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
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
import { expectLabelsFit, markRequiredLabels } from '@/e2e/layout/label-fit-contract'
import { AstraConversation } from '@/components/chat/conversation'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/composer', () => ({
  Composer: () => <div style={{ height: 128 }} data-testid="pinned-composer" />,
}))

type ChatController = Parameters<typeof AstraConversation>[0]['chat']

function emptyChat(): ChatController {
  return {
    threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(),
    messages: [], activeSteps: [], showSuggestions: true,
    isTyping: false, streamingMessageId: null, canShowFollowUps: false,
    sendMessage: vi.fn(), isOnline: true, sendError: null,
    canRetryLastSend: false, composerProps: { suggestions: [] },
  } as unknown as ChatController
}

const VIEWPORTS = [
  { width: 1352, height: 600, panelWidth: 380 },
  { width: 1352, height: 677, panelWidth: 380 },
  { width: 1352, height: 915, panelWidth: 380 },
  { width: 600, height: 677, panelWidth: 600 },
  ...[320, 360, 384, 412].map(width => ({ width, height: 600, panelWidth: width })),
  ...[480, 840, 1100, 1440].map(width => ({ width, height: 915, panelWidth: Math.min(width, 740) })),
]

const CASES = VIEWPORTS.flatMap((viewport) => (['en', 'pt-BR'] as const)
  .map((locale) => ({ ...viewport, locale })))

describe('Empty conversation geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
    stylesheet = compiled.css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(CASES)('keeps both ends reachable at $width by $height in $locale', async ({ width, height, panelWidth, locale }) => {
    const messages = locale === 'en' ? en : pt
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <div style={{ width: panelWidth, height }}><AstraConversation chat={emptyChat()} /></div>
      </NextIntlClientProvider>,
    )
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      await markRequiredLabels(page.getByText(messages.chat.empty.title, { exact: true }))
      await expectLabelsFit(page, page.getByRole('feed'))
      expect(await page.getByRole('feed').getByRole('button', { name: messages.chat.templates.browse }).count()).toBe(1)
      const geometry = await page.evaluate((disclosure) => {
        const scroller = document.querySelector<HTMLElement>('[role="feed"]')!
        const glyph = scroller.querySelector('[data-asset="astra-mark"]')!
        const disclaimer = Array.from(scroller.querySelectorAll('p')).find((paragraph) => paragraph.textContent === disclosure)!
        const empty = scroller.firstElementChild!
        scroller.scrollTop = 0
        const bounds = scroller.getBoundingClientRect()
        const glyphTop = glyph.getBoundingClientRect().top
        const glyphSize = glyph.getBoundingClientRect().width
        const actionBottom = scroller.querySelector('button')!.getBoundingClientRect().bottom
        const contentTop = empty.getBoundingClientRect().top
        const contentBottom = empty.getBoundingClientRect().bottom
        const lastBottomAtTop = disclaimer.getBoundingClientRect().bottom
        scroller.scrollTop = scroller.scrollHeight
        return {
          glyphTop, glyphSize, actionGap: lastBottomAtTop - disclaimer.getBoundingClientRect().height - actionBottom,
          groupCentre: (glyphTop + lastBottomAtTop) / 2,
          scrollerTop: bounds.top, scrollerBottom: bounds.bottom,
          disclaimerBottom: disclaimer.getBoundingClientRect().bottom,
          paddingBottom: parseFloat(getComputedStyle(scroller).paddingBottom),
          scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight,
          contentTop, contentBottom,
          composerTop: document.querySelector('[data-testid="pinned-composer"]')!.getBoundingClientRect().top,
        }
      }, messages.aiDisclosure.notMedicalAdvice)
      expect(geometry.glyphTop).toBeGreaterThanOrEqual(geometry.scrollerTop)
      expect(geometry.paddingBottom).toBe(16)
      expect(geometry.scrollerBottom - geometry.disclaimerBottom).toBeGreaterThanOrEqual(15.5)
      expect(geometry.scrollerBottom).toBe(geometry.composerTop)
      expect.soft(geometry.glyphSize).toBe(48)
      expect.soft(geometry.actionGap).toBeCloseTo(24, 0)
      expect.soft(Math.abs(geometry.groupCentre - (geometry.scrollerTop + geometry.scrollerBottom) / 2)).toBeLessThanOrEqual(8)
      if (height === 915) {
        expect(geometry.scrollHeight).toBe(geometry.clientHeight)
        expect(geometry.contentTop - geometry.scrollerTop).toBeCloseTo(16, 0)
        expect(geometry.scrollerBottom - geometry.contentBottom).toBeCloseTo(16, 0)
      }
    } finally {
      await page.close()
    }
  })
})
