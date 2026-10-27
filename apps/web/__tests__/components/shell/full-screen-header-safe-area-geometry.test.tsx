import { createRef } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import en from '@orbit/shared/i18n/en.json'
import { AstraConversation } from '@/components/chat/conversation'
import { FlowShell } from '@/components/shell/flow-shell'
import { ShellWide } from '@/components/shell/shell-wide'
import { PageHeader } from '@/components/ui/page-header'
import { Sheet } from '@/components/ui/sheet'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', async (original) => ({
  ...await original<typeof import('next-intl')>(),
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('motion/react', async (original) => ({
  ...await original<typeof import('motion/react')>(), useReducedMotion: () => true,
}))

type ChatController = Parameters<typeof AstraConversation>[0]['chat']

function createEmptyChat(): ChatController {
  return {
    threadScroll: createChatThreadScroll(), chatContainerRef: createRef<HTMLDivElement>(),
    messages: [], activeSteps: [], isTyping: false, streamingMessageId: null,
    showSuggestions: false, canShowFollowUps: false, isOnline: true,
    scrollToBottom: vi.fn(), sendMessage: vi.fn(),
    composerProps: {
      state: 'idle', value: '', suggestions: [], words: en.shell.composer,
      onChangeValue: vi.fn(), onSend: vi.fn(),
    },
  } as unknown as ChatController
}

const viewports = [
  { width: 412, height: 915, left: 28, right: 64 },
  { width: 844, height: 390, left: 44, right: 44 },
  { width: 844, height: 390, left: 28, right: 64 },
  { width: 844, height: 390, left: 64, right: 28 },
  { width: 1352, height: 915, left: 44, right: 44 },
]

describe('full-screen header safe rectangles', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function mount(markup: string, viewport: typeof viewports[number]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' })
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 24, bottom: 21, left: viewport.left, right: viewport.right } })
    const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([property, value]) => `${property}:${value}`).join(';')
    await page.setContent(`<style>${stylesheet}:root {${variables}}</style>${markup}`)
    return page
  }

  it.each(viewports)('insets the real conversation and Ideas headers at $width by $height with $left/$right side insets', async (viewport) => {
    const view = render(<ShellWide nav={false} conversationOpen conversationLabel="Astra"
      conversation={<AstraConversation chat={createEmptyChat()} />}><p>Today</p></ShellWide>)
    const page = await mount(view.container.innerHTML, viewport)
    try {
      for (const ideas of [false, true]) {
        if (ideas) {
          fireEvent.click(screen.getByRole('button', { name: 'chat.templates.browse' }))
          await screen.findByRole('heading', { name: 'chat.templates.title' })
          await page.locator('body').evaluate((body, markup) => { body.innerHTML = markup }, view.container.innerHTML)
        }
        const geometry = await page.evaluate((ideas) => {
          const layer = document.querySelector('[data-shell-conversation]')!.getBoundingClientRect()
          const header = document.querySelector(ideas ? '[data-prompt-library] header' : '[data-shell-conversation] header')!
          const bounds = header.getBoundingClientRect()
          const results = document.querySelector('[data-prompt-results]')
          return {
            layer: { left: layer.left, right: layer.right },
            header: { left: bounds.left, right: bounds.right },
            padding: { left: parseFloat(getComputedStyle(header).paddingLeft), right: parseFloat(getComputedStyle(header).paddingRight) },
            resultsPadding: results ? { left: parseFloat(getComputedStyle(results).paddingLeft), right: parseFloat(getComputedStyle(results).paddingRight) } : null,
            controls: [...header.querySelectorAll('button, h1')].map(element => {
              const box = element.getBoundingClientRect()
              return { left: box.left, right: box.right }
            }),
          }
        }, ideas)
        if (viewport.width < 1024) expect(geometry.layer).toEqual({ left: 0, right: viewport.width })
        expect.soft(geometry.padding).toEqual({ left: 16, right: 16 })
        if (ideas) expect.soft(geometry.resultsPadding).toEqual(viewport.width < 1024 ? { left: viewport.left, right: viewport.right } : { left: 0, right: 0 })
        for (const box of [geometry.header, ...geometry.controls]) {
          expect.soft(box.left, JSON.stringify({ ideas, geometry })).toBeGreaterThanOrEqual(viewport.left)
          expect.soft(box.right, JSON.stringify({ ideas, geometry })).toBeLessThanOrEqual(viewport.width - viewport.right)
        }
      }
    } finally { await page.close(); view.unmount() }
  })

  it.each(viewports.flatMap(viewport => (['card', 'detail', 'document', 'onboarding'] as const).map(mode => ({ ...viewport, mode }))))(
    'insets the $mode flow header at $width by $height with $left/$right side insets', async (viewport) => {
      const view = render(<FlowShell mode={viewport.mode}
        header={<PageHeader title="Flow" backLabel="Back" onBack={vi.fn()} />}
        action={<button type="button">Continue</button>}><p>Content</p></FlowShell>)
      const page = await mount(view.container.innerHTML, viewport)
      try {
        const geometry = await page.evaluate(() => {
          const shell = document.querySelector('[data-shell="wide"]')!.getBoundingClientRect()
          const header = document.querySelector('[data-shell-header]')!
          const rectangle = header.getBoundingClientRect()
          const surface = header.parentElement!
          const surfaceBounds = surface.getBoundingClientRect()
          return {
            shell: { left: shell.left, right: shell.right },
            surface: { left: surfaceBounds.left, right: surfaceBounds.right, shadow: getComputedStyle(surface).boxShadow },
            header: { left: rectangle.left, right: rectangle.right },
          }
        })
        expect(geometry.shell).toEqual({ left: 0, right: viewport.width })
        if (viewport.width < 1024) {
          expect(geometry.surface.left).toBe(0)
          expect(geometry.surface.right).toBe(viewport.width)
        }
        expect.soft(geometry.header.left).toBeGreaterThanOrEqual(viewport.left)
        expect.soft(geometry.header.right).toBeLessThanOrEqual(viewport.width - viewport.right)
        expect(geometry.surface.shadow).not.toBe('none')
      } finally { await page.close(); view.unmount() }
    },
  )

  it.each(viewports)('insets the sheet header inside its painted panel at $width by $height with $left/$right side insets', async (viewport) => {
    const view = render(<Sheet open title="Options" onClose={vi.fn()} actions={<button type="button">Save</button>}><p>Content</p></Sheet>)
    await act(async () => {})
    const page = await mount(view.baseElement.innerHTML, viewport)
    try {
      const geometry = await page.evaluate(() => {
        const bounds = (element: Element) => {
          const box = element.getBoundingClientRect()
          return { left: box.left, right: box.right }
        }
        const header = document.querySelector('.orbit-sheet-header')!
        return {
          panel: bounds(document.querySelector('.orbit-sheet-panel')!),
          header: bounds(header),
          controls: [...header.querySelectorAll('h2, button')].map(bounds),
        }
      })
      if (viewport.width < 640) expect(geometry.panel).toEqual({ left: 0, right: viewport.width })
      expect.soft(geometry.header.left - geometry.panel.left).toBe(viewport.left)
      expect.soft(geometry.panel.right - geometry.header.right).toBe(viewport.right)
      for (const box of [geometry.header, ...geometry.controls]) {
        expect.soft(box.left).toBeGreaterThanOrEqual(viewport.left)
        expect.soft(box.right).toBeLessThanOrEqual(viewport.width - viewport.right)
      }
    } finally { await page.close(); view.unmount() }
  })
})
