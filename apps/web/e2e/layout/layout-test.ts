import { test as base, type ConsoleMessage, type WebError } from '@playwright/test'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { assertNoHydrationErrors } from './hydration-guard'
import { waitForStreamedDocument } from '../../test-support/streamed-document'

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
  page: async ({ page }, runTest) => {
    await page.clock.setFixedTime(new Date(LAYOUT_FIXED_TIME))
    const navigate = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await navigate(url, options)
      if (options?.waitUntil !== 'commit' && options?.waitUntil !== 'domcontentloaded') {
        await page.evaluate(waitForStreamedDocument)
      }
      return response
    }
    await runTest(page)
  },
})
