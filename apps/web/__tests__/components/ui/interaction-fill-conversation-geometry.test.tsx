import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { INTERACTION_FILL_CLEARANCE, PADDING } from '@orbit/shared/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectControls } from '@/e2e/layout/interaction-fill-states'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

function bundleConversation() {
  const contents = `import React, { createRef, lazy, Suspense, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { NextIntlClientProvider } from 'next-intl';
    import { createChatThreadScroll } from '@orbit/shared/hooks';
    import en from '@orbit/shared/i18n/en.json';
    import ptBR from '@orbit/shared/i18n/pt-BR.json';
    import { DestinationShell } from './components/shell/destination-shell';
    import { AstraConversation } from './components/chat/conversation';
    import { Composer } from './components/shell/composer';
    import { useUIStore } from './stores/ui-store';
    const configuration = JSON.parse(document.getElementById('configuration').textContent);
    const DeferredConversation = lazy(() => new Promise(resolve => setTimeout(() => resolve({ default: AstraConversation }), 500)));
    const messages = configuration.locale === 'en' ? en : ptBR;
    useUIStore.getState().setAstraConversationOpen(configuration.open);
    const threadScroll = createChatThreadScroll();
    const chatContainerRef = createRef();
    function App() {
      const [value, onChangeValue] = useState(configuration.draft);
      const open = useUIStore(state => state.astraConversationOpen);
      const onOpenConversation = () => useUIStore.getState().setAstraConversationOpen(true);
      const composerProps = { state: 'idle', value, onChangeValue, onSend: () => {},
        suggestions: [], words: messages.shell.composer };
      const chat = { composerProps, threadScroll, chatContainerRef, messages: [], activeSteps: [],
        isTyping: false, streamingMessageId: null, showSuggestions: false, canShowFollowUps: false,
        scrollToBottom: () => {} };
      return <NextIntlClientProvider locale={configuration.locale} messages={messages} timeZone="UTC">
        <DestinationShell onCreate={() => {}} conversationOpen={open} conversationLabel="Astra"
          conversation={configuration.delayed ? <Suspense fallback={null}><DeferredConversation chat={chat} /></Suspense> : <AstraConversation chat={chat} />}
          composer={<Composer {...composerProps} onOpenConversation={onOpenConversation}
            conversationLabel={messages.todayAstra.openConversation} />}>
          <h1 className="p-4">Destination</h1>
        </DestinationShell>
      </NextIntlClientProvider>;
    }
    createRoot(document.getElementById('root')).render(<App />);`
  const boundaries = {
    '@sentry/nextjs': 'export * from "@sentry/browser";',
    'next/link': "import { createElement } from 'react'; export default function Link(props) { return createElement('a', props); }",
    'next/navigation': `const configuration = JSON.parse(document.getElementById('configuration').textContent);
      export const usePathname = () => ['/chat', '/r/invalid'].includes(configuration.route) ? '/' : configuration.route;
      export const useParams = () => ({}); export const useRouter = () => ({ push: () => {} });`,
    '@/hooks/use-profile': "export const useProfile = () => ({ profile: { name: 'Person', email: 'person@example.test' } });",
    '@/hooks/use-notification-inbox': 'export const useNotificationInbox = () => ({ visibleUnreadCount: 1 });',
    '@/components/command/command-palette': 'export const CommandPalette = () => null;',
    '@/components/goals/goal-detail-drawer': 'export const GoalDetailDrawer = () => null;',
    '@/components/chat/message-bubble': 'export const MessageBubble = () => null;',
    '@/components/chat/prompt-library': 'export const PromptLibrary = () => null;',
  }
  const options = { stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } }
  return execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const boundaries = ${JSON.stringify(boundaries)};
    const result = await build({ ...${JSON.stringify(options)}, plugins: [{ name: 'conversation-boundaries', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in boundaries ? { path: args.path, namespace: 'boundary' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ contents: boundaries[args.path], loader: 'js', resolveDir: process.cwd() }));
    } }] });
    process.stdout.write(result.outputFiles[0].text);
  `], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
}

async function installConversationCollision(page: Page) {
  await page.evaluate(() => {
    const addNeighbour = () => {
      const conversation = document.querySelector('[data-shell-conversation]')
      const row = conversation?.querySelector('[data-composer-input-row]')
      if (!conversation || !row || conversation.querySelector('[data-testid="field-paint-neighbour"]')) return
      const bounds = row.getBoundingClientRect()
      const overlay = conversation.getBoundingClientRect()
      const neighbour = document.createElement('span')
      neighbour.dataset.testid = 'field-paint-neighbour'
      neighbour.style.cssText = `position:absolute;left:${bounds.right - overlay.left + 2}px;top:${bounds.top - overlay.top + 8}px;width:4px;height:24px;background:var(--fg-1);pointer-events:none`
      conversation.append(neighbour)
    }
    new MutationObserver(addNeighbour).observe(document.body, { subtree: true, childList: true })
    addNeighbour()
  })
}

describe('interaction fill guard with the mounted conversation owners', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = bundleConversation()
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function mount(width: number, locale: 'en' | 'pt-BR', route: string, open: boolean, draft: string, delayed = false) {
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    page.setDefaultTimeout(2000)
    const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<html class="dark" style="${variables}"><style>${stylesheet}</style><div id="root"></div>
      <script id="configuration" type="application/json">${JSON.stringify({ locale, route, open, draft, delayed })}</script></html>`)
    await page.addScriptTag({ content: script })
    await page.locator('[data-shell]').waitFor()
    return page
  }

  it.each([320, 412, 600].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    ['/', '/habits/habit-1', '/r/invalid'].flatMap(route => ['', 'Retained draft'].map(draft => ({ width, locale, route, draft }))))))(
    'returns from a focus-opened layer at $route, $width in $locale with draft "$draft" and continues the inventory', async ({ width, locale, route, draft }) => {
      const page = await mount(width, locale, route, false, draft)
      try {
        const heading = await page.getByRole('heading', { name: 'Destination' }).elementHandle()
        const create = route === '/habits/habit-1' ? null : await page.locator('[data-shell-fab] button').elementHandle()
        const controls = page.locator('[data-shell-pinned-slot] textarea, [data-shell-tab-bar] a[href], [data-shell-fab] button')
        const counts = await inspectControls(page, controls, `${route}, ${width}px, ${locale}`, INTERACTION_FILL_CLEARANCE)
        expect(counts).toEqual({ inspectedControls: route === '/habits/habit-1' ? 5 : 6, skippedSentinels: 0 })
        expect(await heading!.evaluate(element => element.isConnected)).toBe(true)
        if (create) expect(await create.evaluate(element => element.isConnected)).toBe(false)
        expect(await page.getByRole('dialog').count()).toBe(0)
        expect(await page.getByRole('textbox').inputValue()).toBe(draft)
        expect(await page.getByRole('heading', { name: 'Destination' }).isVisible()).toBe(true)
      } finally { await page.close() }
    })

  it.each([1024, 1352].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale }))))(
    'keeps the wide habit composer clear while the conversation loads at $width in $locale', async ({ width, locale }) => {
      const page = await mount(width, locale, '/habits/habit-1', false, '', true)
      try {
        const inset = await page.locator('[data-shell-pinned-slot] [data-composer-input-row]').evaluate(element => {
          const row = element.getBoundingClientRect()
          const column = element.closest('[data-shell-column]')!.getBoundingClientRect()
          const composer = element.closest('[data-composer-root]')!.getBoundingClientRect()
          return { leading: row.left - composer.left, trailing: composer.right - row.right,
            columnLeading: row.left - column.left, columnTrailing: column.right - row.right }
        })
        expect(inset.leading).toBe(PADDING.screenGutter)
        expect(inset.trailing).toBe(PADDING.screenGutter)
        expect(inset.columnLeading).toBeGreaterThanOrEqual(PADDING.screenGutter)
        expect(inset.columnTrailing).toBeGreaterThanOrEqual(PADDING.screenGutter)
        expect(await page.locator('[data-shell-pinned-slot] [data-composer-root]').evaluate(element => getComputedStyle(element).gap)).toBe('12px')
        const counts = await inspectControls(page, page.locator('[data-shell-pinned-slot] textarea'), `/habits/habit-1, ${width}px, ${locale}`, INTERACTION_FILL_CLEARANCE)
        expect(counts).toEqual({ inspectedControls: 1, skippedSentinels: 0 })
      } finally { await page.close() }
    })

  it.each([1024, 1352].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale }))))(
    'rejects a real collision after the wide habit conversation loads at $width in $locale', async ({ width, locale }) => {
      const page = await mount(width, locale, '/habits/habit-1', false, '', true)
      try {
        await installConversationCollision(page)
        await expect(inspectControls(page, page.locator('[data-shell-pinned-slot] textarea'), `/habits/habit-1, ${width}px, ${locale}`, INTERACTION_FILL_CLEARANCE))
          .rejects.toThrow(/press[\s\S]*span\[field-paint-neighbour\]/)
      } finally { await page.close() }
    })

  it.each([320, 412, 600, 1024, 1352].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale }))))(
    'measures the reached conversation focus when the skip link is off screen at $width in $locale', async ({ width, locale }) => {
      const page = await mount(width, locale, '/chat', true, '')
      try {
        const messages = locale === 'en' ? en : ptBR
        await page.getByRole('button', { name: messages.common.closeConversation }).waitFor()
        const skip = page.getByRole('link', { name: messages.common.skipToContent })
        const counts = await inspectControls(page, skip, `/chat, ${width}px, ${locale}`, INTERACTION_FILL_CLEARANCE)
        expect(counts).toEqual({ inspectedControls: 1, skippedSentinels: 0 })
        expect(await skip.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0)
        expect(await page.getByRole('dialog').count()).toBe(1)
      } finally { await page.close() }
    })

  it.each([320, 1352].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale }))))(
    'measures the explicit Composer paint owner at $width in $locale', async ({ width, locale }) => {
      const page = await mount(width, locale, '/chat', true, '')
      try {
        const field = page.locator('[data-shell-conversation] textarea[data-composer-input]')
        await field.waitFor()
        const result = await field.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
        expect(result.hasFill).toBe(true)
        expect(result.fill).toEqual(await page.locator('[data-shell-conversation] [data-composer-input-row]').evaluate(element => {
          const { left, right, top, bottom } = element.getBoundingClientRect()
          return { left, right, top, bottom }
        }))
      } finally { await page.close() }
    })

  it.each((['composer', 'skip link'] as const).flatMap(entry => (['en', 'pt-BR'] as const).map(locale => ({ entry, locale }))))(
    'rejects reached Composer paint within 2px of a neighbour through $entry in $locale', async ({ entry, locale }) => {
      const route = entry === 'composer' ? '/' : '/chat'
      const page = await mount(320, locale, route, entry === 'skip link', '')
      try {
        await installConversationCollision(page)
        const control = entry === 'composer' ? page.locator('[data-shell-pinned-slot] textarea')
          : page.getByRole('link', { name: (locale === 'en' ? en : ptBR).common.skipToContent })
        await expect(inspectControls(page, control, `${route}, 320px, ${locale}`, INTERACTION_FILL_CLEARANCE))
          .rejects.toThrow(/(?:press|focus-visible)[\s\S]*span\[field-paint-neighbour\]/)
      } finally { await page.close() }
    })
})
