import { PassThrough } from 'node:stream'
import { Suspense, use } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { waitForStreamedDocument } from '../../test-support/streamed-document'

type DocumentPage = {
  clock: { setFixedTime: (instant: Date) => Promise<void> }
  goto: Page['goto']
  evaluate: (callback: () => Promise<void>) => Promise<void>
}
type PageFixture = (input: { page: DocumentPage }, runTest: (page: DocumentPage) => Promise<void>) => Promise<void>
const registered = vi.hoisted(() => ({ page: undefined as PageFixture | undefined }))

vi.mock('@playwright/test', () => ({
  test: { extend: (fixtures: { page: PageFixture }) => { registered.page = fixtures.page } },
}))

import '../../e2e/layout/layout-test'

let streamedMarkup: string

beforeAll(async () => {
  let resolveRoute = () => {}
  const route = new Promise<void>((resolve) => { resolveRoute = resolve })
  function Route() {
    use(route)
    return <div data-habit-create-screen>Ready form</div>
  }
  streamedMarkup = await new Promise<string>((resolve, reject) => {
    const output = new PassThrough()
    let markup = ''
    output.on('data', (chunk: Buffer) => { markup += chunk.toString() })
    output.on('end', () => resolve(markup))
    output.on('error', reject)
    const stream = renderToPipeableStream(<html><body>
      <Suspense fallback={<div data-habit-create-screen>Pending form</div>}><Route /></Suspense>
    </body></html>, {
      onShellReady() { stream.pipe(output); setTimeout(resolveRoute, 0) },
      onError: reject,
    })
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

function pageForDocument(markup: string): DocumentPage {
  return {
    clock: { setFixedTime: async () => {} },
    goto: async () => { document.body.innerHTML = markup; return null },
    evaluate: async (callback) => { await callback() },
  }
}

describe('layout streamed route navigation', () => {
  it('keeps the strict route marker unread until the streamed segment is removed', async () => {
    vi.useFakeTimers()
    const page = pageForDocument(streamedMarkup)
    let markerCount: number | undefined
    const fixture = registered.page!({ page }, async (layoutPage) => {
      await layoutPage.goto('/habits/new')
      markerCount = document.querySelectorAll('[data-habit-create-screen]').length
    })
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(document.querySelectorAll('[data-habit-create-screen]')).toHaveLength(2)
      expect(markerCount).toBeUndefined()
      const segment = document.querySelector('[hidden][id^="S:"]')!
      document.querySelector('[data-habit-create-screen]')!.replaceWith(...segment.childNodes)
      segment.remove()
      await fixture
      expect(markerCount).toBe(1)
      expect(document.querySelector('[data-habit-create-screen]')).toHaveTextContent('Ready form')
    } finally {
      document.querySelector('[hidden][id^="S:"]')?.remove()
      await fixture
    }
  })

  it('settles every navigation, including another streamed route on the same page', async () => {
    const page = pageForDocument(streamedMarkup)
    await registered.page!({ page }, async (layoutPage) => {
      for (const route of ['/habits/new', '/profile']) {
        let settled = false
        const navigation = layoutPage.goto(route).then(() => { settled = true })
        await Promise.resolve()
        await Promise.resolve()
        expect(settled).toBe(false)
        document.querySelector('[hidden][id^="S:"]')!.remove()
        await navigation
        expect(settled).toBe(true)
      }
    })
  })

  it.each(['commit', 'domcontentloaded'] as const)('preserves explicit %s navigation for first paint inspection', async (waitUntil) => {
    await registered.page!({ page: pageForDocument(streamedMarkup) }, async (page) => {
      await page.goto('/progress', { waitUntil })
      expect(document.querySelectorAll('[data-habit-create-screen]')).toHaveLength(2)
    })
  })

  it('accepts a document with no streamed segments and ignores ordinary hidden content', async () => {
    await registered.page!({ page: pageForDocument('<div hidden id="settings">Settings</div><main>Ready route</main>') }, async (page) => {
      await page.goto('/profile')
      expect(document.querySelector('main')).toHaveTextContent('Ready route')
    })
  })

  it('waits through unrelated mutations and until every streamed segment is removed', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = streamedMarkup
    const segment = document.querySelector('[hidden][id^="S:"]')!
    const anotherSegment = segment.cloneNode(true) as HTMLElement
    anotherSegment.id = 'S:1'
    document.body.append(anotherSegment)
    let settled = false
    const waiting = waitForStreamedDocument().then(() => { settled = true })
    segment.remove()
    document.body.append(document.createElement('p'))
    await vi.advanceTimersByTimeAsync(100)
    expect(settled).toBe(false)
    anotherSegment.remove()
    await waiting
    expect(settled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a segment that never settles instead of continuing to strict locators', async () => {
    vi.useFakeTimers()
    const page = pageForDocument(streamedMarkup)
    let inspected = false
    const fixture = registered.page!({ page }, async (layoutPage) => {
      await layoutPage.goto('/habits/new')
      inspected = true
    })
    const rejection = expect(fixture).rejects.toThrow('React streamed segments remained pending before layout inspection')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
    expect(inspected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves a navigation failure', async () => {
    const page = pageForDocument('')
    page.goto = async () => { throw new Error('Navigation failed') }
    await expect(registered.page!({ page }, async (layoutPage) => {
      await layoutPage.goto('/habits/new')
    })).rejects.toThrow('Navigation failed')
  })
})
