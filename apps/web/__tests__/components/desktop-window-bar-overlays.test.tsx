import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { act, cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import en from '@orbit/shared/i18n/en.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { DESKTOP_WINDOW_BAR_END_INSET, DESKTOP_WINDOW_BAR_HEIGHT, DESKTOP_WINDOW_CONTROL_WIDTH } from '@/lib/desktop-window'
import { OnboardingActionsProvider, type OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { ThrottleScreen } from '@/components/ui/throttle-screen'
import { useThrottleStore } from '@/stores/throttle-store'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/onboarding',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined, refetch: vi.fn() }) }))
vi.mock('@/lib/actions/profile', () => ({ updateTimezone: vi.fn() }))
vi.mock('@/hooks/use-onboarding-suggestion', () => ({
  useOnboardingSuggestion: () => ({ available: false, mutateAsync: vi.fn(), verification: null, cancel: vi.fn() }),
}))
vi.mock('@/hooks/use-push-notification-preferences', () => ({
  usePushNotificationPreferences: () => ({ supported: true, permission: 'default', status: 'not-registered' }),
  subscribeToPushNotifications: vi.fn(),
  requestWebPushPermission: vi.fn(),
}))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: ({ sentence, onChange }: { sentence: string; onChange: (value: string) => void }) =>
    <input aria-label="sentence" value={sentence} onChange={(event) => onChange(event.target.value)} />,
}))

const PLATFORMS = ['windows', 'macos'] as const
const WINDOWS = [{ width: 800, height: 600 }, { width: 1280, height: 800 }] as const

function bundleConversation() {
  const contents = `import React, { createRef } from 'react';
    import { createRoot } from 'react-dom/client';
    import { NextIntlClientProvider } from 'next-intl';
    import { createChatThreadScroll } from '@orbit/shared/hooks';
    import en from '@orbit/shared/i18n/en.json';
    import { DestinationShell } from './components/shell/destination-shell';
    import { AstraConversation } from './components/chat/conversation';
    import { DesktopWindowBar } from './components/desktop-window-bar';
    import { useUIStore } from './stores/ui-store';
    useUIStore.getState().setAstraConversationOpen(true);
    const threadScroll = createChatThreadScroll();
    const chatContainerRef = createRef();
    function App() {
      const open = useUIStore(state => state.astraConversationOpen);
      const composerProps = { state: 'idle', value: '', onChangeValue: () => {}, onSend: () => {}, suggestions: [], words: en.shell.composer };
      const chat = { composerProps, threadScroll, chatContainerRef, messages: [], activeSteps: [],
        isTyping: false, streamingMessageId: null, showSuggestions: false, canShowFollowUps: false, scrollToBottom: () => {} };
      return <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <DestinationShell onCreate={() => {}} conversationOpen={open} conversationLabel="Astra" conversation={<AstraConversation chat={chat} />}>
          <h1 className="p-4">Destination</h1>
        </DestinationShell>
        <DesktopWindowBar />
      </NextIntlClientProvider>;
    }
    createRoot(document.getElementById('root')).render(<App />);`
  const boundaries = {
    '@sentry/nextjs': 'export * from "@sentry/browser";',
    'next/link': "import { createElement } from 'react'; export default function Link(props) { return createElement('a', props); }",
    'next/navigation': `export { unstable_isUnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
      export const usePathname = () => '/';
      export const useParams = () => ({}); export const useRouter = () => ({ push() {} });`,
    '@/hooks/use-color-scheme': 'export const useColorScheme = () => ({ currentTheme: "dark", toggleTheme() {} });',
    '@/hooks/use-profile': "export const useProfile = () => ({ profile: { name: 'Person', email: 'person@example.test' } });",
    '@/hooks/use-notification-inbox': 'export const useNotificationInbox = () => ({ visibleUnreadCount: 1 });',
    '@/components/command/command-palette': 'export const CommandPalette = () => null;',
    '@/components/goals/goal-detail-drawer': 'export const GoalDetailDrawer = () => null;',
    '@/components/chat/message-bubble': 'export const MessageBubble = () => null;',
    '@/components/chat/prompt-library': 'export const PromptLibrary = () => null;',
    './proactive-action': 'export const ProactiveAction = () => null;',
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

const onboardingActions: OnboardingActions = {
  createHabit: vi.fn(), updateHabit: vi.fn(), createHabitsBulk: vi.fn(), logHabit: vi.fn(), createGoal: vi.fn(),
  setWeekStartDay: vi.fn(), deferPushRegistration: vi.fn(), recordCompletion: vi.fn(), finishOnboarding: vi.fn(),
}

function rootMarkup(platform: string, body: string, stylesheet: string) {
  const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
  return `<html class="dark" data-desktop-window-bar="${platform}" style="${variables}"><style>${stylesheet}</style>${body}</html>`
}

/** The top of every visible control inside the surface, so a test can require each one below the bar. */
function controlTops(page: Page, surface: string) {
  return page.locator(surface).evaluate((element) => [...element.querySelectorAll('button, a[href], input, textarea, [role="tab"]')]
    .map((control) => control.getBoundingClientRect())
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => rect.top))
}

describe('the desktop window bar is a top inset for the surfaces fixed to the viewport', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let conversation: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    conversation = bundleConversation()
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-desktop-window-bar')
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(PLATFORMS.flatMap((platform) => WINDOWS.map((size) => ({ platform, ...size }))))(
    'starts the Astra conversation header and the wide sidebar below the $platform bar at $width x $height', async ({ platform, width, height }) => {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
      page.setDefaultTimeout(2000)
      try {
        await page.setContent(rootMarkup(platform, '<div id="root"></div>', stylesheet))
        await page.addScriptTag({ content: conversation })
        const close = page.getByRole('button', { name: en.common.closeConversation, exact: true })
        await close.waitFor()
        const bar = await page.locator('[data-desktop-window-bar-content]').boundingBox()
        expect(bar).toEqual({ x: 0, y: 0, width, height: DESKTOP_WINDOW_BAR_HEIGHT })
        expect((await close.boundingBox())!.y).toBeGreaterThanOrEqual(DESKTOP_WINDOW_BAR_HEIGHT)
        const tops = await controlTops(page, '[data-shell-conversation]')
        expect(tops.length).toBeGreaterThan(0)
        expect(Math.min(...tops)).toBeGreaterThanOrEqual(DESKTOP_WINDOW_BAR_HEIGHT)
        if (width < 1024) expect((await page.locator('[data-shell-conversation]').boundingBox())!.height).toBe(height)
        else expect(Math.min(...await controlTops(page, '[data-shell-sidebar]'))).toBeGreaterThanOrEqual(DESKTOP_WINDOW_BAR_HEIGHT)
      } finally { await page.close() }
    },
  )

  it.each(PLATFORMS.flatMap((platform) => WINDOWS.map((size) => ({ platform, ...size }))))(
    'starts the onboarding header below the $platform bar at $width x $height and keeps the shell full height', async ({ platform, width, height }) => {
      await act(async () => {
        render(<QueryClientProvider client={new QueryClient()}>
          <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
            <OnboardingActionsProvider actions={onboardingActions} isLive={false}><OnboardingFlow /></OnboardingActionsProvider>
          </NextIntlClientProvider>
        </QueryClientProvider>)
      })
      const popup = screen.getByRole('dialog').outerHTML
      const page = await browser.newPage({ viewport: { width, height } })
      try {
        await page.setContent(rootMarkup(platform, popup, stylesheet))
        const geometry = await page.evaluate(() => ({
          shell: document.querySelector('[data-shell="wide"]')!.getBoundingClientRect().toJSON() as DOMRect,
          header: document.querySelector('[data-shell-header]')!.getBoundingClientRect().toJSON() as DOMRect,
        }))
        expect(geometry.header.top).toBe(DESKTOP_WINDOW_BAR_HEIGHT)
        expect(geometry.shell.top).toBe(0)
        expect(geometry.shell.bottom).toBe(height)
        const tops = await controlTops(page, '[data-shell-header]')
        expect(tops.length).toBeGreaterThan(0)
        expect(Math.min(...tops)).toBeGreaterThanOrEqual(DESKTOP_WINDOW_BAR_HEIGHT)
      } finally { await page.close() }
    },
  )

  it.each(PLATFORMS)('keeps the %s bar visible and on top of the throttle screen, whose modal dialog covers the root bar', async (platform) => {
    document.documentElement.setAttribute('data-desktop-window-bar', platform)
    const dialogs = HTMLDialogElement.prototype as HTMLDialogElement & { showModal: () => void; close: () => void }
    dialogs.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
    dialogs.close = function close(this: HTMLDialogElement) { this.removeAttribute('open') }
    let throttle: string
    try {
      render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><ThrottleScreen /></NextIntlClientProvider>)
      act(() => { useThrottleStore.getState().show(429, { retryAfterUtc: new Date(Date.now() + 42000).toISOString() }) })
      throttle = screen.getByRole('dialog', { name: en.errorScreen.throttleTitle }).outerHTML
      act(() => { useThrottleStore.getState().clear() })
    } finally {
      Reflect.deleteProperty(dialogs, 'showModal')
      Reflect.deleteProperty(dialogs, 'close')
    }
    const width = 800
    const page = await browser.newPage({ viewport: { width, height: 600 } })
    try {
      await page.setContent(rootMarkup(platform, throttle, stylesheet))
      await page.evaluate(() => {
        const dialog = document.querySelector('dialog')!
        dialog.removeAttribute('open')
        dialog.showModal()
      })
      const half = DESKTOP_WINDOW_CONTROL_WIDTH / 2
      const points = platform === 'windows'
        ? [DESKTOP_WINDOW_BAR_END_INSET + half, ...[1, 2, 3].map((index) => width - DESKTOP_WINDOW_BAR_END_INSET - index * DESKTOP_WINDOW_CONTROL_WIDTH + half)]
        : [width / 2]
      const hits = await page.evaluate(({ points, middle }) => points.map((x) =>
        document.elementFromPoint(x, middle)?.closest('dialog [data-desktop-window-bar-content]') !== null), { points, middle: DESKTOP_WINDOW_BAR_HEIGHT / 2 })
      expect(hits).toEqual(points.map(() => true))
      const tops = await page.locator('dialog').evaluate((dialog) => [...dialog.querySelectorAll('button, a[href]')]
        .filter((control) => !control.closest('[data-desktop-window-bar-content]'))
        .map((control) => control.getBoundingClientRect().top))
      expect(tops.length).toBeGreaterThan(0)
      expect(Math.min(...tops)).toBeGreaterThanOrEqual(DESKTOP_WINDOW_BAR_HEIGHT)
    } finally { await page.close() }
  })
})
