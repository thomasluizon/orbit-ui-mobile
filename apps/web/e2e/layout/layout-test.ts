import { test as base, type ConsoleMessage, type Page, type WebError } from '@playwright/test'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { assertNoHydrationErrors, hydrationProbeScript, waitForFullHydration } from './hydration-guard'
import { LAYOUT_ORIGIN } from '../support/env'
import { waitForStreamedDocument } from '../../test-support/streamed-document'

export async function advanceLayoutClock(page: Page, milliseconds: number): Promise<void> {
  await page.clock.setFixedTime(new Date(Date.parse(LAYOUT_FIXED_TIME) + milliseconds))
}

function isLayoutAppDocument(page: Page): boolean {
  return new URL(page.url()).origin === LAYOUT_ORIGIN
}

export const test = base.extend<{ layoutHydrationGuard: void }>({
  layoutHydrationGuard: [async ({ context }, runTest) => {
    const messages: string[] = []
    const onConsole = (message: ConsoleMessage) => messages.push(message.text())
    const onWebError = (error: WebError) => messages.push(error.error().message)
    context.on('console', onConsole)
    context.on('weberror', onWebError)
    try {
      await runTest()
    } finally {
      context.off('console', onConsole)
      context.off('weberror', onWebError)
      assertNoHydrationErrors(messages)
    }
  }, { auto: true }],
  page: async ({ page, javaScriptEnabled }, runTest) => {
    await advanceLayoutClock(page, 0)
    await page.addInitScript({ content: hydrationProbeScript })
    const navigate = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await navigate(url, options)
      if (options?.waitUntil !== 'commit' && options?.waitUntil !== 'domcontentloaded') {
        await page.evaluate(waitForStreamedDocument)
        if (javaScriptEnabled && isLayoutAppDocument(page)) await waitForFullHydration(page)
      }
      return response
    }
    await runTest(page)
  },
})
