import type { ReactElement } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'
import SearchPage from '@/app/(app)/search/page'
import { CommandPalette } from '@/components/command/command-palette'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { GoalLoadError } from '@/components/goals/goal-detail-drawer/goal-load-error'
import { GoalHabitsPicker } from '@/components/goals/goal-habits-field'
import { useShellStore } from '@/stores/shell-store'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { measureStartEdgeIconAction } from '@/__tests__/support/start-edge-icon-action'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsDesktop: () => false, useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useSearchHabits: () => ({ data: undefined, isPending: false, isFetching: false, isSuccess: false, isError: true, refetch: vi.fn() }),
  useHabits: () => ({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { ...profileFixture, timeZone: 'UTC' }, patchProfile: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: vi.fn(), isPending: false }), useSkipHabit: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-logging', () => ({ useLogHabit: () => ({ mutate: vi.fn(), isPending: false }), useSkipHabit: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/hooks/use-account-scoped-mutation', () => ({ useAccountScopedMutation: () => ({ isPending: false, mutate: vi.fn() }) }))
vi.mock('@/lib/actions/api-keys', () => ({ requestApiKeyCreationChallenge: vi.fn() }))
vi.mock('@/hooks/use-api-key-management', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: new Error('API keys unavailable'), refetch: vi.fn() },
    apiKeys: [],
    canCreateKey: true,
    createGrantAvailable: true,
    createKeyError: null,
    clearCreateKeyError: vi.fn(),
    revokingKeyId: null,
    setRevokingKeyId: vi.fn(),
    revokeKeyMutation: { mutate: vi.fn(), isPending: false },
    handleCreateKey: vi.fn(),
  }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

type Owner = { name: string; render: () => ReactElement; query?: boolean; palette?: boolean }

const owners: Owner[] = [
  { name: 'habit search page load error', render: () => <SearchPage />, query: true },
  { name: 'command palette load error', render: () => <CommandPalette navItems={[]} onCreateHabit={vi.fn()} />, query: true, palette: true },
  { name: 'MCP API keys load error', render: () => <QueryClientProvider client={new QueryClient()}><div className="orbit-content-frame"><ProfileApiKeys profile={{ ...profileFixture, hasProAccess: true }} unlocked /></div></QueryClientProvider> },
  { name: 'goal detail sheet load error', render: () => <div className="orbit-sheet-body"><GoalLoadError onRetry={vi.fn()} /></div> },
  { name: 'goal detail inline load error', render: () => <div className="px-screen-gutter pt-4"><GoalLoadError onRetry={vi.fn()} /></div> },
  { name: 'linked habits sheet load error', render: () => <div className="orbit-sheet-body"><GoalHabitsPicker selectedIds={[]} goalType="Standard" disabled={false} onChange={vi.fn()} onClose={vi.fn()} /></div> },
]

const cases = owners.flatMap((owner) => [412, 1280].flatMap((width) => ([['en', en], ['pt-BR', ptBR]] as const).map(([locale, messages]) => ({ ...owner, width, locale, messages }))))

describe('start-edge retry actions below load error text in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => {
    cleanup()
    useShellStore.setState({ paletteOpen: false })
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres the $name glyph and starts it on the text column at $width px in $locale', async ({ render: owner, query, palette, width, locale, messages }) => {
    useShellStore.setState({ paletteOpen: Boolean(palette) })
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>{owner()}</NextIntlClientProvider>)
    if (query) {
      fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'walk' } })
      await screen.findByText(messages.habits.search.loadError)
    }
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
    const markup = palette ? screen.getByRole('dialog').outerHTML : container.innerHTML
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body style="margin:0">${markup}</body></html>`)
      const action = await measureStartEdgeIconAction(page, messages.common.retry)
      const detail = JSON.stringify(action)
      expect(action.paintWidth, detail).toBe(44)
      expect(action.targetWidth, detail).toBe(48)
      expect(action.glyphCentreOffset.x, detail).toBeLessThanOrEqual(0.5)
      expect(action.glyphCentreOffset.y, detail).toBeLessThanOrEqual(0.5)
      expect(action.glyphTextOffset, detail).toBeLessThanOrEqual(0.5)
      expect(action.gutter, detail).toBeGreaterThanOrEqual(14)
      expect(action.targetStartClearance, detail).toBeGreaterThanOrEqual(0)
    } finally { await page.close() }
  })
})
