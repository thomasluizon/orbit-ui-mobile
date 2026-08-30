import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'

interface ResponseStub {
  text: () => Promise<string>
}

interface PageStub {
  close: () => Promise<void>
  goto: () => Promise<ResponseStub | null>
  setCacheEnabled: (enabled: boolean) => Promise<void>
}

interface BrowserStub {
  newPage: () => Promise<PageStub>
  setCookie: (...cookies: unknown[]) => Promise<void>
}

const require = createRequire(import.meta.url)
const warmHermeticToday = require('../../perf/lhci-hermetic-auth.cjs') as (
  browser: BrowserStub,
  context: { url?: string },
) => Promise<void>

function createPage(html: string): PageStub {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue(html),
    }),
    setCacheEnabled: vi.fn().mockResolvedValue(undefined),
  }
}

describe('LHCI hermetic auth warmup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warms four fresh uncached targets and verifies server-rendered Today markup', async () => {
    const page = createPage(`<main><div>${en.habits.noHabitsBody}</div></main>`)
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      setCookie: vi.fn().mockResolvedValue(undefined),
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await warmHermeticToday(browser, { url: 'http://127.0.0.1:3000/' })

    expect(browser.setCookie).toHaveBeenCalledOnce()
    expect(browser.newPage).toHaveBeenCalledTimes(4)
    expect(page.setCacheEnabled).toHaveBeenCalledTimes(4)
    expect(page.setCacheEnabled).toHaveBeenCalledWith(false)
    expect(page.goto).toHaveBeenCalledTimes(4)
    expect(page.close).toHaveBeenCalledTimes(4)
    expect(log).toHaveBeenCalledWith(
      '[lhci] warmup complete: 4/4 authenticated responses contained the Today empty state in server markup',
    )
  })

  it('keeps warming after one navigation fails and reports the incomplete preload evidence', async () => {
    const failedPage = createPage('')
    failedPage.goto = vi.fn().mockRejectedValue(new Error('navigation failed'))
    const passingPage = createPage(`<main><div>${en.habits.noHabitsBody}</div></main>`)
    const browser = {
      newPage: vi.fn()
        .mockResolvedValueOnce(failedPage)
        .mockResolvedValue(passingPage),
      setCookie: vi.fn().mockResolvedValue(undefined),
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await warmHermeticToday(browser, { url: 'http://127.0.0.1:3000/' })

    expect(browser.newPage).toHaveBeenCalledTimes(4)
    expect(failedPage.close).toHaveBeenCalledOnce()
    expect(passingPage.close).toHaveBeenCalledTimes(3)
    expect(log).toHaveBeenCalledWith(
      '[lhci] warmup complete: 3/4 authenticated responses contained the Today empty state in server markup',
    )
  })
})
