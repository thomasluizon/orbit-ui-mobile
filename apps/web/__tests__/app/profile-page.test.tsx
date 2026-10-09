import { personalText } from '@/__tests__/support/personal-text'
import React from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { ShellWide } from '@/components/shell/shell-wide'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import en from '@orbit/shared/i18n/en.json'
import { useUIStore } from '@/stores/ui-store'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ChevronRight, Trash2 } from '@/components/ui/icons'

import type { PushPreferenceSnapshot } from '@/hooks/use-push-notification-preferences'

interface MockDeviceState {
  count: number | undefined
  max: number
  isCurrentDeviceRegistered: boolean
  isLoading: boolean
  isError: boolean
  refresh: ReturnType<typeof vi.fn>
}

const {
  mockExportUserData,
  mockUpdateAiSummary,
  mockUpdateProactiveAstra,
  mockShellNoticeSlot,
  mockUseGamificationProfile,
  mockPatchProfile,
  mockRefetchProfile,
  mockProfileState,
  mockRouterPush,
  mockSearchParams,
  mockStepUpVerified,
  mockCreateGrant,
  mockApiKeys,
  mockCreateApiKey,
  mockRequestApiKeyCreationChallenge,
  mockApplyTheme,
  mockUpdateWeekStartDay,
  mockUpdateLanguage,
  mockTogglePush,
  mockPushPreferenceState,
  mockDeviceState,
  mockTranslate,
  mockLocale,
} = vi.hoisted(() => {
  const deviceState: MockDeviceState = { count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false, refresh: vi.fn() }
  return ({
  mockExportUserData: vi.fn(),
  mockUpdateAiSummary: vi.fn(),
  mockUpdateProactiveAstra: vi.fn(),
  mockShellNoticeSlot: vi.fn(),
  mockUseGamificationProfile: vi.fn(() => ({ profile: null })),
  mockPatchProfile: vi.fn(),
  mockRefetchProfile: vi.fn(),
  mockRouterPush: vi.fn(),
  mockSearchParams: { current: '' },
  mockStepUpVerified: { current: false },
  mockCreateGrant: { consumed: false },
  mockApiKeys: { current: [] as Record<string, unknown>[] },
  mockCreateApiKey: vi.fn(),
  mockRequestApiKeyCreationChallenge: vi.fn(),
  mockApplyTheme: vi.fn(),
  mockUpdateWeekStartDay: vi.fn(),
  mockUpdateLanguage: vi.fn(),
  mockTogglePush: vi.fn(),
  mockPushPreferenceState: { current: { supported: true, subscribed: false, permission: 'default', status: 'not-registered' } as PushPreferenceSnapshot },
  mockDeviceState: { current: deviceState },
  mockTranslate: { current: (key: string, params?: Record<string, string | number>) => key === 'profile.settingsRows.devicesCount' ? [params?.count ?? '', 'of', params?.max ?? ''].join(' ') : key },
  mockLocale: { current: 'en' },
  mockProfileState: {
    current: {
      profile: undefined as ReturnType<typeof createMockProfile> | undefined,
      isLoading: false,
      error: null as Error | null,
    },
  },
}) })

vi.mock('@/lib/actions/profile', () => ({
  exportUserData: mockExportUserData,
  updateAiSummary: mockUpdateAiSummary,
  updateProactiveAstra: mockUpdateProactiveAstra,
  updateWeekStartDay: mockUpdateWeekStartDay,
  updateLanguage: mockUpdateLanguage,
}))

vi.mock('@/hooks/use-push-notification-preferences', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePushNotificationPreferences: () => ({
    ...mockPushPreferenceState.current,
    loading: false,
    togglePush: mockTogglePush,
  }),
}))

vi.mock('@/hooks/use-push-subscriptions', () => ({
  usePushSubscriptions: () => mockDeviceState.current,
}))

vi.mock('@/lib/actions/api-keys', () => ({
  createApiKey: mockCreateApiKey,
  revokeApiKey: vi.fn(),
  requestApiKeyCreationChallenge: mockRequestApiKeyCreationChallenge,
}))

vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: vi.fn(),
  isStepUpVerified: () => mockStepUpVerified.current,
  hasApiKeyCreationGrant: () => mockStepUpVerified.current && !mockCreateGrant.consumed,
  consumeApiKeyCreationGrant: () => {
    mockCreateGrant.consumed = true
  },
  clearApiKeyCreationGrant: () => {
    mockCreateGrant.consumed = true
  },
}))

vi.mock('@/hooks/use-shell-notice-slot', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useShellNoticeSlot: mockShellNoticeSlot,
}))

vi.mock('next-intl', () => ({
  useLocale: () => mockLocale.current,
  useTranslations: () => (key: string, params?: Record<string, string | number>) => mockTranslate.current(key, params),
}))

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ currentTheme: 'dark', applyTheme: mockApplyTheme }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/profile',
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterPush,
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(mockSearchParams.current),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey?: string[] }) => ({
    data: queryKey?.[0] === 'apiKeys' ? mockApiKeys.current : undefined,
    error: null,
    isLoading: false,
    isError: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useMutation: (options: { mutationFn?: (value: boolean) => unknown }) => ({
    mutate: (value: boolean) => options.mutationFn?.(value),
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ ...mockProfileState.current, patchProfile: mockPatchProfile, refetch: mockRefetchProfile }),
  useTrialExpired: () => true,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: mockUseGamificationProfile,
  useStreakInfo: () => ({ data: { currentStreak: 0 } }),
  useReportEvent: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => 'account-a',
  useAuthStore: (selector: (state: { logout: () => void; isAuthenticated: boolean }) => unknown) =>
    selector({ logout: vi.fn(), isAuthenticated: true }),
  useHeldAccountId: () => 'user-1',
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => null,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => null,
}))

vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))

vi.mock('@/app/(app)/profile/_components/fresh-start-modal', () => ({
  FreshStartModal: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="profile.freshStart.heading" /> : null,
}))

vi.mock('@/app/(app)/profile/_components/delete-account-modal', () => ({
  DeleteAccountModal: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="profile.deleteAccount.headingAreYouSure" /> : null,
}))

vi.mock('@/app/(app)/profile/_components/profile-nav-card', () => ({
  ProfileNavCard: () => null,
}))



vi.mock('@/components/referral/referral-card', () => ({
  ReferralCard: ({ onOpen }: { onOpen: () => void; onDismiss?: () => void }) => (
    <button data-testid="profile-referral-card" onClick={onOpen}>
      referral
    </button>
  ),
}))

vi.mock('@/components/referral/referral-drawer', () => ({
  ReferralDrawer: ({ open }: { open: boolean; onOpenChange?: (open: boolean) => void }) =>
    open ? <div data-testid="profile-referral-drawer" /> : null,
}))

import ProfilePage from '@/app/(app)/profile/page'

import ProfileAccountRoute from '@/app/(app)/profile/account/page'
import ProfilePreferencesRoute from '@/app/(app)/profile/preferences/page'
import ProfileAstraRoute from '@/app/(app)/profile/astra/page'
import ProfileNotificationsRoute from '@/app/(app)/profile/notifications/page'
import { ProfileSubscreen } from '@/app/(app)/profile/_components/profile-subscreen'

const PROFILE_ROUTES = { account: ProfileAccountRoute, preferences: ProfilePreferencesRoute, astra: ProfileAstraRoute, notifications: ProfileNotificationsRoute }

describe('ProfilePage', () => {
  it.each([
    ['profile.settingsRows.editName', 'profile.editName.title'],
    ['profile.settingsRows.startOver', 'profile.freshStart.heading'],
    ['profile.settingsRows.deleteAccount', 'profile.deleteAccount.headingAreYouSure'],
  ] as const)('opens the owned dialog from the %s account action', (label, heading) => {
    render(<ProfileAccountRoute />)
    expect(screen.queryByRole('dialog', { name: heading })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(screen.getByRole('dialog', { name: heading })).toBeInTheDocument()
  })

  it.each(['en', 'pt-BR'].flatMap((locale) => (['account', 'preferences'] as const).map((surface) => ({ locale, surface }))))('renders the drawn subscreen row glyphs in $surface in $locale', ({ locale, surface }) => {
    translateProMessages(locale as 'en' | 'pt-BR')
    const Destination = PROFILE_ROUTES[surface]
    const { container } = render(<Destination />)
    const reference = render(<div><ProfileNavIcon iconKey="account" /><Trash2 size={24} /><ChevronRight size={24} /></div>).container.querySelectorAll('svg')
    const rows = container.querySelectorAll('.orbit-list-row-shell:has([data-slot="list-row-chevron"])')
    expect(rows).toHaveLength(4)
    for (const [index, row] of rows.entries()) {
      const glyphs = row.querySelectorAll('svg')
      expect(glyphs, row.textContent!).toHaveLength(surface === 'account' ? 2 : 1)
      const chevron = glyphs[glyphs.length - 1]!
      expect(chevron.innerHTML).toBe(reference[2]!.innerHTML)
      expect(chevron).toHaveAttribute('width', '24')
      expect(chevron).toHaveAttribute('height', '24')
      expect(chevron).toHaveAttribute('stroke', 'var(--fg-3)')
      expect(chevron).toHaveAttribute('aria-hidden', 'true')
      if (surface === 'account') {
        expect(glyphs[0]).toHaveAttribute('width', '24')
        if (index === 0) expect(glyphs[0]!.innerHTML).toBe(reference[0]!.innerHTML)
        if (index === 3) {
          expect(glyphs[0]!.innerHTML).toBe(reference[1]!.innerHTML)
          expect(glyphs[0]!.parentElement!.style.color).toBe('var(--status-bad)')
        }
      }
    }
  })

  describe('destination top inset', () => {
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    let stylesheet: string
    registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    })
    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    it.each(['en', 'pt-BR'].flatMap((locale) => [320, 412, 1280].flatMap((width) => ['Ana', 'Ana Silva'].flatMap((name) => (['account', 'preferences'] as const).map((surface) => ({ locale, width, surface, name }))))))('aligns subscreen glyphs and preserves labels in $surface in $locale at $width for $name', async ({ locale, width, surface, name }) => {
      translateProMessages(locale as 'en' | 'pt-BR')
      mockProfileState.current.profile = createMockProfile({ name, email: 'a@b.co', timeZone: 'America/Sao_Paulo', weekStartDay: 1, uses24HourClock: true })
      const Destination = PROFILE_ROUTES[surface]
      const { container } = render(<Destination />)
      const page = await browser.newPage({ viewport: { width, height: 1600 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.evaluate(() => Array.from(document.querySelectorAll('.orbit-list-row-shell:has([data-slot="list-row-chevron"])')).map((row) => {
          const title = row.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
          const range = document.createRange()
          range.selectNodeContents(title)
          const icons = Array.from(row.querySelectorAll('svg')).map((icon) => ({ x: icon.getBoundingClientRect().x, width: icon.getBoundingClientRect().width, height: icon.getBoundingClientRect().height }))
          const description = row.querySelector('[data-slot="list-row-description"]')
          return { label: title.textContent, titleX: range.getBoundingClientRect().x, available: title.getBoundingClientRect().width, textWidth: range.getBoundingClientRect().width, icons, overflow: row.scrollWidth > row.clientWidth,
            descriptionGap: description ? description.getBoundingClientRect().top - title.getBoundingClientRect().bottom : null }
        }))
        expect(geometry).toHaveLength(4)
        for (const row of geometry) {
          expect(row.icons, row.label!).toHaveLength(surface === 'account' ? 2 : 1)
          for (const icon of row.icons) expect(icon).toMatchObject({ width: 24, height: 24 })
          expect.soft(row.titleX, row.label!).toBe(geometry[0]!.titleX)
          expect.soft(row.textWidth, row.label!).toBeLessThanOrEqual(row.available + 1)
          expect(row.overflow, row.label!).toBe(false)
          if (row.descriptionGap !== null) expect(row.descriptionGap, row.label!).toBeCloseTo(4, 1)
          if (surface === 'account') expect(row.icons[0]!.x).toBe(geometry[0]!.icons[0]!.x)
        }
      } finally { await page.close() }
    })

    it.each((['en', 'pt-BR'] as const).flatMap((locale) => [360, 384, 412].map((width) => ({ locale, width }))))('keeps all account action titles whole in $locale at $width px and 2 text scale', async ({ locale, width }) => {
      translateProMessages(locale)
      mockProfileState.current.profile = createMockProfile({ name: 'Ana Silva', email: 'a@b.co' })
      const { container } = render(<ProfileAccountRoute />)
      const page = await browser.newPage({ viewport: { width, height: 1600 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('.orbit-list-row-shell:has([data-slot="list-row-chevron"])'))
          const defaults = rows.map((row) => row.getBoundingClientRect().height)
          document.documentElement.style.fontSize = '32px'
          return rows.map((row, index) => {
            const title = row.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
            const range = document.createRange()
            range.selectNodeContents(title)
            const bounds = title.getBoundingClientRect()
            const fragments = Array.from(range.getClientRects())
            const style = getComputedStyle(title)
            return { label: title.textContent, height: row.getBoundingClientRect().height, defaultHeight: defaults[index]!, fontSize: parseFloat(style.fontSize), clipped: fragments.some((fragment) => fragment.left < bounds.left - 1 || fragment.right > bounds.right + 1 || fragment.bottom > bounds.bottom + 1) }
          })
        })
        expect(geometry).toHaveLength(4)
        for (const row of geometry) {
          expect.soft(row.fontSize, row.label!).toBe(34)
          expect.soft(row.clipped, row.label!).toBe(false)
          expect.soft(row.height, row.label!).toBeGreaterThan(row.defaultHeight)
        }
      } finally { await page.close() }
    })

    it.each(['en', 'pt-BR'].flatMap((locale) => [320, 412, 1280].map((width) => ({ locale, width }))))('keeps the export title and preparing value readable in $locale at $width', async ({ locale, width }) => {
      translateProMessages(locale as 'en' | 'pt-BR')
      mockExportUserData.mockReturnValueOnce(new Promise(() => {}))
      const messages = locale === 'pt-BR' ? ptBR : en
      const { container } = render(<ProfileAccountRoute />)
      fireEvent.click(screen.getByRole('button', { name: messages.profile.settingsRows.export }))
      expect(mockExportUserData).toHaveBeenCalledOnce()
      expect(container).toHaveTextContent(messages.dataExport.preparing)
      const page = await browser.newPage({ viewport: { width, height: 1600 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.evaluate(() => {
          const row = document.querySelectorAll('.orbit-list-row-shell:has([data-slot="list-row-chevron"])')[1]!
          return Array.from(row.querySelectorAll<HTMLElement>('[data-slot="list-row-title"], [data-slot="list-row-value"]')).map((text) => {
            const range = document.createRange()
            range.selectNodeContents(text)
            return { label: text.textContent, width: text.getBoundingClientRect().width, textWidth: range.getBoundingClientRect().width, lines: range.getClientRects().length }
          })
        })
        expect(geometry.map(({ label }) => label)).toEqual([messages.profile.settingsRows.export, messages.dataExport.preparing])
        for (const text of geometry) {
          expect(text.textWidth, text.label!).toBeLessThanOrEqual(text.width + 1)
          expect(text.lines, text.label!).toBe(1)
        }
      } finally { await page.close() }
    })

    it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 412].flatMap((width) => [1, 2].flatMap((textScale) => ['free', 'trial', 'paid', 'lifetime'].map((plan) => ({ locale, width, textScale, plan }))))))('keeps $plan Perfil rows readable in $locale at $width px and $textScale text scale', async ({ locale, width, textScale, plan }) => {
      translateProMessages(locale as 'en' | 'pt-BR')
      mockProfileState.current.profile = createMockProfile({
        name: 'Marina', email: 'marina.silva.long.address@example.com', hasProAccess: plan !== 'free',
        isTrialActive: plan === 'trial', isLifetimePro: plan === 'lifetime',
        trialEndsAt: plan === 'trial' ? '2099-10-09T12:00:00Z' : null,
      })
      const { container } = render(<ProfilePage />)
      const page = await browser.newPage({ viewport: { width, height: 1600 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        await page.evaluate((scale) => {
          for (const element of document.querySelectorAll<HTMLElement>('.orbit-list-row-shell span')) {
            if (element.children.length > 0 || !element.textContent) continue
            element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * scale}px`
          }
        }, textScale)
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.orbit-list-row-shell')).map((row) => {
          const title = row.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
          const range = document.createRange()
          range.selectNodeContents(title)
          const icon = row.querySelector('svg')!
          return {
            label: title.textContent,
            height: row.getBoundingClientRect().height,
            textEdge: title.getBoundingClientRect().left,
            textWidth: range.getBoundingClientRect().width,
            lines: range.getClientRects().length,
            titleTop: title.getBoundingClientRect().top,
            iconTop: icon.getBoundingClientRect().top,
            titleOverflow: title.scrollWidth > title.clientWidth,
            ellipsis: getComputedStyle(title).textOverflow === 'ellipsis',
            right: title.getBoundingClientRect().right,
            available: title.getBoundingClientRect().width,
            iconWidth: icon.getBoundingClientRect().width,
            iconHidden: icon.closest('[aria-hidden="true"]') !== null,
            overflow: row.scrollWidth > row.clientWidth,
          }
        }))
        expect(rows).toHaveLength(11)
        for (const row of rows) {
          if (textScale === 1) {
            expect(row.lines, row.label!).toBe(1)
          }
          expect(row.height, row.label!).toBeGreaterThanOrEqual(48)
          expect(row.textEdge, row.label!).toBe(rows[0]!.textEdge)
          expect.soft(row.textWidth, row.label!).toBeLessThanOrEqual(row.available + 1)
          expect(row.iconWidth, row.label!).toBe(24)
          expect(row.iconHidden, row.label!).toBe(true)
          expect(row.overflow, row.label!).toBe(false)
          expect(row.titleOverflow, row.label!).toBe(false)
          expect(row.ellipsis, row.label!).toBe(row.label === 'Marina')
          expect(row.right, row.label!).toBeLessThanOrEqual(width)
          if (textScale === 2 && row.label !== 'Marina') expect(Math.abs(row.iconTop - row.titleTop), row.label!).toBeLessThanOrEqual(12)
        }
        if (textScale === 2 && locale === 'pt-BR') expect(rows.find(({ label }) => label === ptBR.profile.calendarSync.title)!.lines).toBeGreaterThan(1)
      } finally { await page.close() }
    })

    it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412].flatMap((width) => [1, 2].map((textScale) => ({ locale, width, textScale })))))('wraps account names at word boundaries in $locale at $width px and $textScale text scale', async ({ locale, width, textScale }) => {
      translateProMessages(locale as 'en' | 'pt-BR')
      const name = locale === 'en' ? 'A person with a full name written in their own profile' : 'Pessoa com um nome completo escrito no próprio perfil'
      const email = `${'longaddress'.repeat(12)}@example.com`
      mockProfileState.current.profile = createMockProfile({ name, email })
      const profile = render(<ProfilePage />)
      expect(screen.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', '/profile/account')
      const account = render(<ProfileAccountRoute />)
      const page = await browser.newPage({ viewport: { width, height: 1600 } })
      try {
        for (const [surface, view] of [['profile', profile], ['account', account]] as const) {
          await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
          await loadAppFonts(page)
          const geometry = await page.evaluate(({ name, email, textScale }) => {
            const title = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="list-row-title"]')).find((element) => element.textContent === name)!
            const description = title.nextElementSibling!
            for (const element of [title, description] as HTMLElement[]) element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * textScale}px`
            const words: { word: string; tops: number[] }[] = []
            const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT)
            let text = walker.nextNode()
            while (text) {
              if (text.textContent?.trim()) {
                const range = document.createRange()
                range.selectNodeContents(text)
                words.push({ word: text.textContent, tops: Array.from(range.getClientRects()).map((rect) => rect.top) })
              }
              text = walker.nextNode()
            }
            const emailRange = document.createRange()
            const scroller = description.querySelector('[data-personal-text]') ?? description
            emailRange.selectNodeContents(scroller.firstElementChild ?? scroller)
            const titleStyle = getComputedStyle(title)
            return { words, titleHeight: title.getBoundingClientRect().height, lineHeight: parseFloat(titleStyle.lineHeight), clamp: titleStyle.webkitLineClamp, email: description.textContent, emailLines: new Set(Array.from(emailRange.getClientRects()).map((rect) => rect.top)).size, emailOverflow: scroller.scrollWidth > scroller.clientWidth, pageOverflow: document.documentElement.scrollWidth > innerWidth }
          }, { name, email, textScale })
          for (const word of geometry.words) expect(new Set(word.tops).size, `${surface}: ${word.word}`).toBe(1)
          if (surface === 'profile') {
            expect(geometry.clamp).toBe('2')
            expect(geometry.titleHeight).toBeLessThanOrEqual(2 * geometry.lineHeight + 1)
          } else expect(geometry.clamp).toBe('none')
          expect(geometry.email).toBe(email)
          expect(geometry.emailLines).toBe(1)
          expect(geometry.emailOverflow).toBe(true)
          expect(geometry.pageOverflow).toBe(false)
        }
      } finally { await page.close() }
    })

    it.each([1, 2])('reveals the full account email within the row at %s text scale', async (textScale) => {
      translateProMessages('en')
      const email = `${'address'.repeat(9)}@${'domain'.repeat(20)}.com`
      mockProfileState.current.profile = createMockProfile({ name: `Marina ${'Silva'.repeat(16)}`, email })
      render(<ProfilePage />)
      const accountLink = screen.getByRole('link', { name: /Marina/ })
      expect(accountLink).toHaveAttribute('href', '/profile/account')
      await act(async () => { fireEvent.click(accountLink) })
      const { container } = render(<ProfileAccountRoute />)
      const page = await browser.newPage({ viewport: { width: 320, height: 1600 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.evaluate(({ email, textScale }) => {
          const row = Array.from(document.querySelectorAll('.orbit-list-row-shell')).find((row) => row.textContent.includes(email))!
          const description = Array.from(row.querySelectorAll<HTMLElement>('span')).find((span) => span.textContent === email)!
          description.style.fontSize = `${parseFloat(getComputedStyle(description).fontSize) * textScale}px`
          const title = row.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
          title.style.fontSize = `${parseFloat(getComputedStyle(title).fontSize) * textScale}px`
          const range = document.createRange()
          range.selectNodeContents(title)
          return { overflow: row.scrollWidth > row.clientWidth, clamped: getComputedStyle(description).webkitLineClamp, text: description.textContent, nameLines: title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight), lineHeightRatio: parseFloat(getComputedStyle(title).lineHeight) / parseFloat(getComputedStyle(title).fontSize) }
        }, { email, textScale })
        expect(geometry.text).toBe(email)
        expect(geometry.clamped).toBe('none')
        expect(geometry.overflow).toBe(false)
        expect(geometry.nameLines).toBeLessThanOrEqual(2.1)
        expect(geometry.lineHeightRatio).toBeGreaterThanOrEqual(1.4)
      } finally { await page.close() }
    })

    it.each([320, 412, 600, 840, 1023, 1024, 1352])('insets the first account card at %ipx and preserves the wide shell', async (width) => {
      const { container } = render(
        <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={[]} activeId="perfil" navLabel="Navigation" tabBar={<nav>Tabs</nav>}>
          <ProfilePage />
        </ShellWide>,
      )
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const geometry = await page.evaluate(() => {
          const column = document.querySelector('[data-shell-column]')!.getBoundingClientRect()
          const scrollElement = document.querySelector<HTMLElement>('[data-shell-scroller]')!
          const scroller = scrollElement.getBoundingClientRect()
          const card = document.querySelector('[data-testid="profile-settings-group-you"] .orbit-row-list')!.getBoundingClientRect()
          const row = document.querySelector('[data-root-notification-header]')!.getBoundingClientRect()
          const bell = document.querySelector('[data-root-notification-header] button')!.getBoundingClientRect()
          return { columnTop: column.top, columnInset: card.top - column.top, scrollerInset: card.top - scroller.top,
            headerHeight: row.height, trailingInset: scroller.left + scrollElement.clientWidth - bell.right }
        })
        expect(geometry.columnTop).toBe(0)
        expect(geometry.columnInset).toBe(width < 1024 ? 76 : 32)
        expect(geometry.scrollerInset).toBe(width < 1024 ? 76 : 0)
        expect(geometry.headerHeight).toBe(width < 1024 ? 48 : 0)
        if (width < 1024) expect(geometry.trailingInset).toBe(16)
      } finally { await page.close() }
    })
  })

  const proPlans = [
    { state: 'free', hasProAccess: false, isTrialActive: false, isLifetimePro: false, en: 'Free', pt: 'Grátis' },
    { state: 'trial', hasProAccess: true, isTrialActive: true, isLifetimePro: false, en: 'Trial', pt: 'Teste' },
    { state: 'paid', hasProAccess: true, isTrialActive: false, isLifetimePro: false, en: 'Active', pt: 'Ativo' },
    { state: 'lifetime', hasProAccess: true, isTrialActive: false, isLifetimePro: true, en: 'Lifetime', pt: 'Vitalício' },
  ] as const

  function translateProMessages(locale: 'en' | 'pt-BR') {
    mockLocale.current = locale
    const messages = locale === 'en' ? en : ptBR
    mockTranslate.current = (key, params) => {
      let message: unknown = messages
      for (const segment of key.split('.')) {
        message = message && typeof message === 'object'
          ? (message as Record<string, unknown>)[segment]
          : undefined
      }
      return typeof message === 'string'
        ? message.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
        : key
    }
  }

  describe.each(['en', 'pt-BR'] as const)('Orbit Pro in %s', (locale) => {
    it.each(proPlans)('shows the $state plan directly after the account and opens its destination', (plan) => {
      translateProMessages(locale)
      mockProfileState.current.profile = createMockProfile({
        plan: plan.hasProAccess ? 'pro' : 'free',
        hasProAccess: plan.hasProAccess,
        isTrialActive: plan.isTrialActive,
        isLifetimePro: plan.isLifetimePro,
        trialEndsAt: plan.isTrialActive ? '2099-10-09T12:00:00Z' : null,
      })
      render(<ProfilePage />)
      const group = screen.getByTestId('profile-settings-group-you')
      const rows = group.querySelectorAll('.orbit-list-row-shell')
      expect(rows).toHaveLength(5)
      for (const row of rows) {
        const title = row.querySelector('[data-slot="list-row-title"]')!
        const icons = row.querySelectorAll('svg')
        const navigates = row.querySelector('a') !== null
        expect(icons, title.textContent!).toHaveLength(title.textContent === 'Alex' ? 3 : navigates ? 2 : 1)
        expect(icons[0]!.closest('[aria-hidden="true"]')).not.toBeNull()
        expect(icons[0]!.getAttribute('width')).toBe('24')
        expect(icons[0]!.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        if (navigates) {
          expect(title.compareDocumentPosition(icons[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
          expect(icons[1]!.getAttribute('aria-hidden')).toBe('true')
          expect(icons[1]!.getAttribute('focusable')).toBe('false')
        }
      }
      const titles = Array.from(group.querySelectorAll('[data-slot="list-row-title"]')).map((node) => node.textContent)
      expect(titles.slice(0, 3)).toEqual([mockProfileState.current.profile.name, 'Orbit Pro', locale === 'en' ? 'Preferences' : 'Preferências'])
      const expectedValue = locale === 'en' ? plan.en : plan.pt
      expect(within(group).getByText(expectedValue)).toHaveAttribute('data-slot', 'list-row-value')
      expect(mockRouterPush).not.toHaveBeenCalled()
      if (plan.isLifetimePro) {
        expect(within(group).queryByRole('link', { name: /Orbit Pro/ })).not.toBeInTheDocument()
        expect(within(group).queryByRole('button', { name: /Orbit Pro/ })).not.toBeInTheDocument()
      } else {
        const entry = within(group).getByRole('link', { name: /Orbit Pro/ })
        expect(entry).toHaveTextContent(expectedValue)
        expect(entry).toHaveAttribute('href', '/upgrade')
        expect(within(entry).queryByTestId('pro-badge')).not.toBeInTheDocument()
        fireEvent.click(entry)
      }
    })
  })


  it.each([true, false])('withholds the Pro entry while the plan is unknown and loading is %s', (isLoading) => {
    mockProfileState.current = { profile: undefined, isLoading, error: isLoading ? null : new Error('load failed') }
    render(<ProfilePage />)
    expect(screen.queryByText('upgrade.pitchTitle')).not.toBeInTheDocument()
  })

  it.each(['account', 'preferences', 'astra', 'notifications'] as const)('offers recovery for a failed %s load and keeps its settings hidden', (destination) => {
    mockProfileState.current = { profile: undefined, isLoading: false, error: new Error('load failed') }
    const Destination = PROFILE_ROUTES[destination]
    render(<Destination />)
    expect(screen.getByRole('alert')).toHaveTextContent('errors.loadProfile')
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(mockRefetchProfile).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'common.backToProfile' })).toBeInTheDocument()
    expect(screen.queryByTestId('profile-api-keys')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it.each([
    ['account', ['profile.settingsRows.editName', 'profile.settingsRows.export', 'profile.analytics.title', 'profile.settingsRows.startOver', 'profile.settingsRows.deleteAccount']],
    ['preferences', ['profile.settingsRows.timezone', 'profile.settingsRows.weekStart', 'settings.clock.title', 'profile.language.title', 'profile.settingsRows.theme', 'settings.homeScreen.showGeneral']],
    ['astra', ['profile.allowance.title', 'profile.proactiveAstra.title', 'profile.aiSummary.title', 'profile.settingsRows.apiKeysMcp']],
    ['notifications', ['profile.marketingEmails.question', 'profile.settingsRows.alertsOnThisDevice', 'profile.settingsRows.remindersNote']],
  ] as const)('opens %s from Perfil and keeps its settings in that screen alone', (destination, labels) => {
    const top = render(<ProfilePage />)
    const entry = screen.getAllByRole('link').find((link) => link.getAttribute('href') === `/profile/${destination}`)!
    fireEvent.click(entry)
    expect(entry).toHaveAttribute('href', `/profile/${destination}`)
    top.unmount()
    const Destination = PROFILE_ROUTES[destination]
    const content = render(<Destination />)
    const group = screen.getByTestId(`profile-settings-group-${destination}`)
    for (const label of labels.filter((key) => key !== 'profile.settingsRows.editName')) expect(group.textContent).toContain(label)
    if (destination === 'account') expect(within(group).getByRole('button', { name: /profile.settingsRows.editName/ })).toBeInTheDocument()
    const ordered = labels.filter((label) => label !== 'profile.settingsRows.editName')
    expect(ordered.map((label) => group.textContent.indexOf(label))).toEqual(ordered.map((label) => group.textContent.indexOf(label)).sort((left, right) => left - right))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'common.backToProfile' }))
    expect(mockRouterPush).toHaveBeenCalledWith('/profile')
    for (const other of ['account', 'preferences', 'astra', 'notifications']) {
      if (other !== destination) expect(screen.queryByTestId(`profile-settings-group-${other}`)).not.toBeInTheDocument()
    }
    content.unmount()
  })

  it('forwards a checkout return to Astra without dropping settlement parameters', () => {
    mockSearchParams.current = 'subscription=success&keep=1'
    render(<ProfilePage />)
    expect(mockRouterPush).toHaveBeenCalledWith('/profile/astra?subscription=success&keep=1')
  })

  it.each([['#you', '/profile/preferences'], ['#astra', '/profile/astra'], ['#api-keys', '/profile/astra'], ['#notifications', '/profile/notifications'], ['#ending', '/profile/account']])('forwards the saved %s section to %s', (hash, destination) => {
    history.replaceState({}, '', `/profile${hash}`)
    try {
      render(<ProfilePage />)
      expect(mockRouterPush).toHaveBeenCalledWith(destination)
    } finally {
      history.replaceState({}, '', '/')
    }
  })

  it('opens settings through four sub-menu entries instead of rendering their controls on Perfil', () => {
    render(<ProfilePage />)
    for (const path of ['/profile/account', '/profile/preferences', '/profile/astra', '/profile/notifications']) {
      expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === path)).toBe(true)
    }
    expect(screen.queryByRole('button', { name: /profile.settingsRows.timezone/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('profile-api-keys')).not.toBeInTheDocument()
  })

  beforeEach(() => {
    mockPushPreferenceState.current = { supported: true, subscribed: false, permission: 'default', status: 'not-registered' }
    mockTranslate.current = (key, params) => key === 'profile.settingsRows.devicesCount' ? [params?.count ?? '', 'of', params?.max ?? ''].join(' ') : key
    mockLocale.current = 'en'
    useUIStore.getState().setAstraConversationOpen(false)
    mockExportUserData.mockReset()
    mockUpdateAiSummary.mockReset()
    mockUpdateProactiveAstra.mockReset()
    mockShellNoticeSlot.mockReset()
    mockRefetchProfile.mockReset()
    mockPatchProfile.mockReset()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: vi.fn(() => 'blob:export') },
      revokeObjectURL: { configurable: true, value: vi.fn() },
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    mockUseGamificationProfile.mockClear()
    mockRouterPush.mockClear()
    mockSearchParams.current = ''
    mockStepUpVerified.current = false
    mockCreateGrant.consumed = false
    mockApiKeys.current = []
    mockCreateApiKey.mockReset()
    mockRequestApiKeyCreationChallenge.mockReset().mockResolvedValue(undefined)
    mockApplyTheme.mockReset()
    mockUpdateWeekStartDay.mockReset().mockResolvedValue(undefined)
    mockUpdateLanguage.mockReset().mockRejectedValue(new Error('save failed'))
    mockTogglePush.mockReset().mockResolvedValue(undefined)
    mockDeviceState.current = { count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false, refresh: vi.fn().mockResolvedValue(undefined) }
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'free',
        hasProAccess: false,
        currentStreak: 13,
        aiMessagesUsed: 2,
        aiMessagesLimit: 5,
      }),
      isLoading: false,
      error: null,
    }
  })

  it('renders the remaining phone feature sections in order', () => {
    render(<ProfilePage />)

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'profile.groups.more',
    ])
    expect(screen.getByText('profile.settingsRows.wrapped')).toBeInTheDocument()
    expect(screen.queryByText('profile.wrappedHint')).not.toBeInTheDocument()
    expect(screen.getByText('profile.widgetTitle')).toBeInTheDocument()
    expect(screen.getByText('profile.calendarSync.title')).toBeInTheDocument()
    expect(screen.getByText('profile.support.rowTitle')).toBeInTheDocument()
    expect(screen.getByText('profile.aboutRow')).toBeInTheDocument()
    expect(screen.queryByText('profile.aboutRowHint')).not.toBeInTheDocument()
    expect(screen.queryByText('profile.sections.preferences')).not.toBeInTheDocument()
    expect(screen.queryByText('profile.sections.aiFeatures')).not.toBeInTheDocument()
    expect(screen.queryByText('profile.sections.advanced')).not.toBeInTheDocument()
    const retiredLabels = [
      ['so', 'cial.profileNav.title'].join(''),
      ['profile.public', 'Profile.title'].join(''),
    ]
    for (const label of retiredLabels) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('places the clock choice between week start and language', () => {
    mockProfileState.current.profile = createMockProfile({ uses24HourClock: true })
    render(<ProfileSubscreen screen="preferences" />)
    const week = screen.getByRole('button', { name: /profile.settingsRows.weekStart/i })
    const clock = screen.getByRole('button', { name: /settings.clock.title/i })
    const language = screen.getByRole('button', { name: /profile.language.title/i })
    expect(week.compareDocumentPosition(clock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(clock.compareDocumentPosition(language) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(clock).toHaveTextContent('settings.clock.hour24')
  })

  it('opens each inline preference directly and sends Support to its form', () => {
    for (const label of ['profile.language.title', 'profile.settingsRows.weekStart', 'settings.clock.title']) {
      const view = render(<ProfileSubscreen screen="preferences" />)
      mockRouterPush.mockClear()
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label, 'i') }))
      expect(mockRouterPush).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      view.unmount()
    }
    render(<ProfileSubscreen screen="preferences" />)
    const themeChoices = screen.getByRole('group', { name: 'profile.settingsRows.theme' })
    expect(themeChoices).toContainElement(screen.getByRole('button', { name: 'preferences.themeModeDark' }))
    expect(themeChoices).toContainElement(screen.getByRole('button', { name: 'preferences.themeModeLight' }))
    expect(themeChoices).toHaveClass('flex-wrap', 'max-w-full')
    render(<ProfilePage />)
    expect(screen.getByRole('link', { name: /profile\.support\.rowTitle/i })).toHaveAttribute('href', '/support')
  })

  it('changes the inline theme and general habits preference', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    render(<ProfileSubscreen screen="preferences" />)
    fireEvent.click(screen.getByRole('button', { name: 'preferences.themeModeLight' }))
    expect(mockApplyTheme).toHaveBeenCalledWith('light')

    const showGeneral = screen.getByRole('switch', { name: 'settings.homeScreen.showGeneral' })
    fireEvent.click(showGeneral)
    expect(showGeneral).toHaveAttribute('aria-checked', 'true')
    expect(write).toHaveBeenCalledWith(expect.stringContaining('orbit_show_general_on_today'), 'true')
    write.mockRestore()
  })

  it('opens widget help inline', () => {
    render(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: /profile\.widgetTitle/i }))
    expect(screen.getByRole('dialog', { name: 'profile.widgetTitle' })).toBeInTheDocument()
  })

  it('commits a week start choice from the inline picker', () => {
    render(<ProfileSubscreen screen="preferences" />)
    fireEvent.click(screen.getByRole('button', { name: /profile\.settingsRows\.weekStart/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'settings.weekStartDay.sunday' }))
    expect(mockUpdateWeekStartDay).toHaveBeenCalledWith({ weekStartDay: 0 }, 'account-a')
  })

  it('submits a language choice from the inline picker', async () => {
    render(<ProfileSubscreen screen="preferences" />)
    fireEvent.click(screen.getByRole('button', { name: /profile\.language\.title/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'Português' }))
    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalledWith({ language: 'pt-BR' }, 'account-a'))
  })

  it('uses the current device switch to enable browser push', () => {
    render(<ProfileSubscreen screen="notifications" />)
    fireEvent.click(screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' }))
    expect(mockTogglePush).toHaveBeenCalledWith(true)
  })

  it.each([0, 1, 5])('shows one notification switch without a count for %i devices', (count) => {
    mockDeviceState.current.count = count
    render(<ProfileSubscreen screen="notifications" />)
    expect(screen.getAllByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })).toHaveLength(1)
    expect(screen.getByText('profile.settingsRows.alertsOnThisDevice')).toBeInTheDocument()
    expect(screen.queryByText(`${count} of 5`)).not.toBeInTheDocument()
    expect(screen.queryByText('profile.settingsRows.devices')).not.toBeInTheDocument()
  })

  it('turns a registered device off', () => {
    mockDeviceState.current.count = 5
    mockDeviceState.current.isCurrentDeviceRegistered = true
    render(<ProfileSubscreen screen="notifications" />)
    const control = screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })
    expect(control).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(control)
    expect(mockTogglePush).toHaveBeenCalledWith(false)
  })

  it('disables the switch while devices load', () => {
    mockDeviceState.current.count = undefined
    mockDeviceState.current.isLoading = true
    render(<ProfileSubscreen screen="notifications" />)
    const control = screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })
    expect(control).toBeDisabled()
    expect(control.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps browser push status empty and reserves the switch while checking', () => {
    mockPushPreferenceState.current = { supported: false, subscribed: false, permission: '', status: 'checking' }
    render(<ProfileSubscreen screen="notifications" />)
    expect(screen.queryByText('settings.notifications.unsupported')).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('push-status')).toHaveTextContent(/^\s*$/)
    expect(screen.getByTestId('push-status').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true')
  })

  it('reports unsupported after browser push checking finishes', () => {
    mockPushPreferenceState.current = { supported: false, subscribed: false, permission: '', status: 'unsupported' }
    render(<ProfileSubscreen screen="notifications" />)
    expect(screen.getByTestId('push-status')).toHaveTextContent('settings.notifications.unsupported')
    expect(screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })).toBeDisabled()
  })

  it('reports the cap only after an enable attempt without prompting or registering', () => {
    mockDeviceState.current.count = 5
    render(<ProfileSubscreen screen="notifications" />)
    expect(screen.queryByText('profile.settingsRows.pushDeviceLimit')).not.toBeInTheDocument()
    const control = screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })
    expect(control).not.toBeDisabled()
    fireEvent.click(control)
    expect(screen.getByText('profile.settingsRows.pushDeviceLimit')).toBeInTheDocument()
    expect(control).toHaveAttribute('aria-checked', 'false')
    expect(mockTogglePush).not.toHaveBeenCalled()
  })

  it('offers retry when the device list fails', () => {
    mockDeviceState.current.isError = true
    render(<ProfileSubscreen screen="notifications" />)
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(mockDeviceState.current.refresh).toHaveBeenCalledOnce()
  })

  it('keeps the share card off Perfil', () => {
    render(<ProfilePage />)
    expect(screen.queryByRole('button', { name: /shareCard\.entry/i })).not.toBeInTheDocument()
  })

  it('puts Sign out first in Ending things', () => {
    render(<ProfilePage />)
    const ending = screen.getByTestId('profile-settings-group-ending')

    expect(within(ending).getAllByRole('button')[0]).toHaveTextContent('profile.settingsRows.signOut')
  })

  it('routes every More of Orbit row', () => {
    const view = render(<ProfilePage />)
    const freeMore = within(screen.getByTestId('profile-settings-group-more'))

    expect(freeMore.getByRole('link', { name: /profile\.settingsRows\.wrapped/i })).toHaveAttribute('href', '/wrapped')
    expect(freeMore.getByRole('button', { name: /profile\.widgetTitle/i })).toBeInTheDocument()
    const calendarGate = freeMore.getByRole('link', { name: /profile\.calendarSync\.title/i })
    expect(calendarGate).toHaveAttribute('href', '/upgrade')
    expect(calendarGate).not.toHaveAttribute('aria-disabled', 'true')
    expect(freeMore.getByRole('link', { name: /profile\.support\.rowTitle/i })).toHaveAttribute('href', '/support')
    expect(freeMore.getByRole('link', { name: /profile\.aboutRow/i })).toHaveAttribute('href', '/about')
    expect(freeMore.getByText('common.proBadge')).toBeInTheDocument()

    view.unmount()
    mockRouterPush.mockClear()
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    render(<ProfilePage />)
    const proMore = within(screen.getByTestId('profile-settings-group-more'))
    expect(proMore.getByRole('link', { name: /profile\.calendarSync\.title/i })).toHaveAttribute('href', '/calendar?import=1')
    expect(proMore.queryByText('common.proBadge')).not.toBeInTheDocument()
  })

  it('shows the free daily allowance as an enabled route to Pro', () => {
    render(<ProfileSubscreen screen="astra" />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    const progress = astra.getByRole('progressbar', { name: 'profile.allowance.title' })
    expect(progress).toHaveAttribute('aria-valuenow', '2')
    expect(progress).toHaveAttribute('aria-valuemax', '5')
    expect(astra.getByText('profile.allowance.usage')).toBeInTheDocument()
    expect(astra.queryByText('profile.allowance.spent')).not.toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.manageSubscription' })).not.toBeInTheDocument()

    const allowanceGate = astra.getByRole('link', { name: 'profile.allowance.seePro' })
    expect(allowanceGate).toHaveAttribute('href', '/upgrade?from=%2Fprofile%2Fastra')
    expect(allowanceGate).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('shows both free Astra switch gates as enabled routes to Pro', () => {
    render(<ProfileSubscreen screen="astra" />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    const proactiveGate = astra.getByRole('button', { name: /profile\.proactiveAstra\.title/i })
    const summaryGate = astra.getByRole('button', { name: /profile\.aiSummary\.title/i })

    expect(proactiveGate).toBeEnabled()
    expect(summaryGate).toBeEnabled()
    fireEvent.click(proactiveGate)
    fireEvent.click(summaryGate)
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/upgrade?from=%2Fprofile%2Fastra')
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/upgrade?from=%2Fprofile%2Fastra')
  })

  it.each([
    ['pt-BR', false, 'Check-ins', 'Resumo diário'],
    ['pt-BR', true, 'Check-ins', 'Resumo diário'],
    ['en', false, 'Check-ins', 'Daily recap'],
    ['en', true, 'Check-ins', 'Daily recap'],
  ] as const)('renders the %s Astra labels for Pro access %s', (locale, hasProAccess, proactive, summary) => {
    mockLocale.current = locale
    const messages = locale === 'pt-BR' ? ptBR : en
    mockTranslate.current = (key) => {
      let message: unknown = messages
      for (const segment of key.split('.')) {
        message = message && typeof message === 'object'
          ? (message as Record<string, unknown>)[segment]
          : undefined
      }
      return typeof message === 'string' ? message : key
    }
    mockProfileState.current.profile = createMockProfile({
      plan: hasProAccess ? 'pro' : 'free', hasProAccess, language: locale,
    })
    render(<ProfileSubscreen screen="astra" />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    if (hasProAccess) {
      expect(astra.getByRole('switch', { name: proactive })).toBeInTheDocument()
      expect(astra.getByRole('switch', { name: summary })).toBeInTheDocument()
    } else {
      for (const label of [proactive, summary]) {
        const row = astra.getByRole('button', { name: new RegExp(label) })
        expect(within(row).getByText('Pro')).toBeInTheDocument()
        expect(row).toBeEnabled()
        fireEvent.click(row)
      }
      expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/upgrade?from=%2Fprofile%2Fastra')
      expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/upgrade?from=%2Fprofile%2Fastra')
    }
  })

  it('shows only the API key description and upgrade row to free accounts', () => {
    render(<ProfileSubscreen screen="astra" />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    expect(apiKeys.getByText('profile.apiKeys.description')).toBeInTheDocument()
    const upgradeRow = apiKeys.getByRole('button', { name: 'profile.apiKeys.unlock' })
    expect(apiKeys.queryByText('orbitMcp.noKeys')).not.toBeInTheDocument()
    expect(upgradeRow).toBeEnabled()

    fireEvent.click(upgradeRow)
    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade?from=%2Fprofile%2Fastra')
  })

  it('badges the locked API keys section Pro, never with the trial label', () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: true }),
      isLoading: false,
      error: null,
    }
    render(<ProfileSubscreen screen="astra" />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    const badges = apiKeys.getAllByText('common.proBadge')
    expect(badges).toHaveLength(2)
    expect(badges.map((badge) => badge.dataset.variant)).toEqual(['solid', 'solid'])
    expect(apiKeys.queryByText('trial.proBadge')).not.toBeInTheDocument()
  })

  it('keeps every free API key state on the enabled lock route', () => {
    mockStepUpVerified.current = true
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
    }]

    render(<ProfileSubscreen screen="astra" />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    const upgradeRow = apiKeys.getByRole('button', { name: 'profile.apiKeys.unlock' })
    expect(upgradeRow).toBeEnabled()
    expect(apiKeys.queryByText('Work key')).not.toBeInTheDocument()
    fireEvent.click(upgradeRow)
    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade?from=%2Fprofile%2Fastra')
  })

  it('puts the step up before the API key list for Pro accounts', () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    render(<ProfileSubscreen screen="astra" />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    expect(apiKeys.queryByText('orbitMcp.noKeys')).not.toBeInTheDocument()
    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.open' }))

    expect(
      apiKeys.getByRole('button', { name: 'profile.apiKeys.stepUpAction' }),
    ).toBeInTheDocument()
    expect(apiKeys.queryByText('orbitMcp.noKeys')).not.toBeInTheDocument()
  })

  it('does not unlock API keys from a manually typed return hint', () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockSearchParams.current = 'api-keys=1'
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
    }]

    render(<ProfileSubscreen screen="astra" />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    expect(apiKeys.getByRole('button', { name: 'profile.apiKeys.open' })).toBeInTheDocument()
    expect(apiKeys.queryByText('Work key')).not.toBeInTheDocument()
  })

  it('shows verified keys and submits a free-text scope', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
      scopes: [],
      isReadOnly: false,
      expiresAtUtc: null,
      createdAtUtc: '2026-09-14T12:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
    }]
    mockCreateApiKey.mockResolvedValue({
      success: true,
      response: {
        ...mockApiKeys.current[0],
        id: 'key-2',
        key: 'orb_secret',
      },
    })
    render(<ProfileSubscreen screen="astra" />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    expect(apiKeys.getByText(personalText('Work key'))).toBeInTheDocument()
    expect(apiKeys.getByText('orb_live_1234…')).toBeInTheDocument()
    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.revokeNamed' }))
    expect(screen.getByRole('dialog', { name: 'profile.apiKeys.revokeNamedQuestion' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'orbitMcp.cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'profile.apiKeys.revokeNamedQuestion' })).not.toBeInTheDocument()
    })

    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.createScoped' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' }), {
      target: { value: 'habits:read' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.scopeAction' }))

    await waitFor(() => {
      expect(mockCreateApiKey).toHaveBeenCalledWith({
        name: 'profile.apiKeys.newKeyName',
        scopes: ['habits:read'],
      }, 'account-a')
    })
  })

  it('resets scoped creation after cancellation and successful creation', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockCreateApiKey
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({
        success: true,
        response: { id: 'key-2', key: 'orb_secret' },
      })
    const firstView = render(<ProfileSubscreen screen="astra" />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.createScoped' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' }), {
      target: { value: 'stale:scope' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.scopeAction' }))
    expect(await screen.findByText('orbitMcp.createKeyError')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'profile.apiKeys.scopeTitle' })).not.toBeInTheDocument()
    })

    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.createScoped' }))
    expect(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' })).toHaveValue('')
    expect(screen.queryByText('orbitMcp.createKeyError')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' }), {
      target: { value: 'fresh:scope' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.scopeAction' }))
    expect(await screen.findByRole('dialog', { name: 'orbitMcp.revealHeading' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'orbitMcp.done' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'orbitMcp.revealHeading' })).not.toBeInTheDocument()
    })

    firstView.unmount()
    mockCreateGrant.consumed = false
    render(<ProfileSubscreen screen="astra" />)
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.createScoped' }))
    expect(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' })).toHaveValue('')
  })

  it('requires a fresh verified grant before creating a second key', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockCreateApiKey
      .mockResolvedValueOnce({
        success: true,
        response: { id: 'key-1', key: 'orb_first' },
      })
      .mockResolvedValueOnce({
        success: true,
        response: { id: 'key-2', key: 'orb_second' },
      })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    const firstView = render(<ProfileSubscreen screen="astra" />)

    const create = screen.getByRole('button', { name: 'profile.apiKeys.create' })
    fireEvent.click(create)
    await screen.findByText('orb_first')
    fireEvent.click(screen.getByRole('button', { name: 'orbitMcp.copy' }))
    expect(await screen.findByRole('button', { name: 'orbitMcp.copied' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'orbitMcp.done' }))
    await waitFor(() => expect(screen.queryByText('orb_first')).not.toBeInTheDocument())

    fireEvent.click(create)
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/step-up?operation=keys')
    })
    expect(mockCreateApiKey).toHaveBeenCalledTimes(1)

    firstView.unmount()
    mockStepUpVerified.current = true
    mockCreateGrant.consumed = false
    render(<ProfileSubscreen screen="astra" />)
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.create' }))
    await screen.findByText('orb_second')
    expect(screen.getByRole('button', { name: 'orbitMcp.copy' })).toBeInTheDocument()
  })

  it('restarts step up when the API rejects a stale create grant', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockCreateApiKey.mockResolvedValue({ success: false, challengeRequired: true })
    render(<ProfileSubscreen screen="astra" />)

    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.create' }))

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/step-up?operation=keys')
    })
    expect(mockCreateGrant.consumed).toBe(true)
    expect(screen.queryByText('orbitMcp.createKeyError')).not.toBeInTheDocument()
  })

  it('shows trial copy and routes its allowance action to the trial pitch', () => {
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'pro',
        hasProAccess: true,
        isTrialActive: true,
        aiMessagesUsed: 2,
        aiMessagesLimit: 50,
      }),
      isLoading: false,
      error: null,
    }
    render(<ProfileSubscreen screen="astra" />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    expect(astra.getByText('profile.subscription.trial')).toBeInTheDocument()
    expect(astra.getByRole('link', { name: 'profile.allowance.seePro' })).toHaveAttribute('href', '/upgrade?from=%2Fprofile%2Fastra')
    expect(astra.queryByRole('link', { name: 'profile.allowance.manageSubscription' })).not.toBeInTheDocument()
  })

  it('shows a spent Pro allowance and hands subscription management off directly', () => {
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'pro',
        hasProAccess: true,
        aiMessagesUsed: 50,
        aiMessagesLimit: 50,
      }),
      isLoading: false,
      error: null,
    }
    render(<ProfileSubscreen screen="astra" />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    const progress = astra.getByRole('progressbar', { name: 'profile.allowance.title' })
    expect(progress).toHaveAttribute('aria-valuenow', '50')
    expect(progress).toHaveAttribute('aria-valuemax', '50')
    expect(progress).toHaveAttribute('data-complete', 'true')
    expect(astra.getByText('profile.allowance.spent')).toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.seePro' })).not.toBeInTheDocument()

    expect(astra.getByRole('link', { name: 'profile.allowance.manageSubscription' })).toHaveAttribute('href', '/upgrade?from=%2Fprofile%2Fastra')
    const proactiveSwitch = astra.getByRole('switch', { name: 'profile.proactiveAstra.title' })
    const summarySwitch = astra.getByRole('switch', { name: 'profile.aiSummary.title' })
    const proactiveRow = proactiveSwitch.closest('.orbit-list-row-shell')
    const summaryRow = summarySwitch.closest('.orbit-list-row-shell')
    expect(summaryRow?.parentElement).not.toBe(proactiveRow?.parentElement)
    expect(summaryRow?.parentElement?.getAttribute('style')).toContain('border-top: 1px solid var(--hairline)')
    fireEvent.click(proactiveSwitch)
    fireEvent.click(summarySwitch)
    expect(mockUpdateProactiveAstra).toHaveBeenCalledWith({ enabled: true }, 'account-a')
    expect(mockUpdateAiSummary).toHaveBeenCalledWith({ enabled: false }, 'account-a')
  })

  it('shows lifetime Pro without advertising a subscription management action', () => {
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'pro',
        hasProAccess: true,
        isTrialActive: false,
        isLifetimePro: true,
        aiMessagesUsed: 2,
        aiMessagesLimit: 50,
      }),
      isLoading: false,
      error: null,
    }
    render(<ProfileSubscreen screen="astra" />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    expect(astra.getByText('profile.allowance.pro')).toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.seePro' })).not.toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.manageSubscription' })).not.toBeInTheDocument()
  })

  it('shows Preparing on the row and registers completion in the shell notice slot', async () => {
    let finishExport!: (value: Record<string, never>) => void
    mockExportUserData.mockReturnValueOnce(
      new Promise((resolve) => {
        finishExport = resolve
      }),
    )
    render(<ProfileSubscreen screen="account" />)

    const exportRow = screen.getByRole('button', { name: /profile\.settingsRows\.export/i })
    fireEvent.click(exportRow)
    expect(exportRow).toHaveTextContent('dataExport.preparing')

    await act(async () => finishExport({}))
    await waitFor(() => {
      expect(mockShellNoticeSlot.mock.calls.some(([enabled]) => enabled)).toBe(true)
    })
    const noticeCall = [...mockShellNoticeSlot.mock.calls]
      .reverse()
      .find((call) => call[0] === true)
    const notice = noticeCall?.[1]() as React.ReactElement<{ kind: string; message: string }>
    expect(notice.props).toMatchObject({ kind: 'done', message: 'dataExport.done' })
  })

  it('opens the timezone picker from the timezone row', () => {
    render(<ProfileSubscreen screen="preferences" />)

    fireEvent.click(
      screen.getByRole('button', { name: /profile.settingsRows.timezone/ }),
    )

    expect(
      screen.getByRole('dialog', { name: 'profile.settingsRows.timezone' }),
    ).toBeInTheDocument()
  })

  it.each([true, false])('renders answered email consent %s before the matching device row and reminders note', (consent) => {
    mockProfileState.current.profile = createMockProfile({ marketingEmailConsent: consent })
    render(<ProfileSubscreen screen="notifications" />)

    const group = screen.getByTestId('profile-settings-group-notifications')
    const titles = [...group.querySelectorAll('[data-slot="list-row-title"]')]
    expect(titles.map((title) => title.textContent)).toEqual([
      'profile.marketingEmails.title',
      'profile.settingsRows.alertsOnThisDevice',
    ])
    expect(group.querySelectorAll('svg')).toHaveLength(0)
    expect(within(group).getAllByRole('switch').map((control) => control.getAttribute('aria-label'))).toEqual([
      'profile.marketingEmails.title',
      'profile.settingsRows.alertsOnThisDevice',
    ])
    expect(within(group).getByRole('switch', { name: 'profile.marketingEmails.title' })).toHaveAttribute('aria-checked', String(consent))
    const note = within(group).getByText('profile.settingsRows.remindersNote')
    expect(titles[1]!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders only the drawn Notifications rows and the recorded deviations, in order', () => {
    render(<ProfileSubscreen screen="notifications" />)

    const notificationsGroup = screen.getByTestId('profile-settings-group-notifications')
    const controls = [...notificationsGroup.querySelectorAll('button, a, input')].map((control) =>
      `${control.getAttribute('role') ?? control.tagName.toLowerCase()}: ${control.getAttribute('aria-label') ?? control.textContent}`)
    const textLines = [...notificationsGroup.querySelectorAll('*')]
      .filter((element) => element.children.length === 0 && element.textContent.trim())
      .map((element) => element.textContent)

    expect(controls).toEqual([
      'button: profile.marketingEmails.decline',
      'button: profile.marketingEmails.accept',
      'switch: profile.settingsRows.alertsOnThisDevice',
    ])
    expect(textLines).toEqual([
      'profile.marketingEmails.question',
      'profile.marketingEmails.questionDescription',
      'profile.marketingEmails.decline',
      'profile.marketingEmails.accept',
      'profile.settingsRows.alertsOnThisDevice',
      'profile.settingsRows.remindersNote',
    ])
  })

  it('restores the analytics switch and explains a failed local save', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage failed')
    })
    try {
      render(<ProfileSubscreen screen="account" />)
      const control = screen.getByRole('switch', { name: 'profile.analytics.title' })
      fireEvent.click(control)
      await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'true'))
      expect(screen.getByRole('status')).toHaveTextContent('profile.analytics.saveError')
    } finally {
      write.mockRestore()
    }
  })

  it('shows one eight-row settings skeleton before the groups arrive', () => {
    mockProfileState.current = {
      profile: createMockProfile({ hasProAccess: false }),
      isLoading: true,
      error: null,
    }
    render(<ProfilePage />)

    expect(screen.getByRole('progressbar', { name: 'profile.loading' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-settings-skeleton-row]')).toHaveLength(8)
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
  })
})

it('places the Perfil bell inside the destination scroller and opens Avisos', () => {
  const { container } = render(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={[]} activeId="perfil" navLabel="Navigation" tabBar={<nav>Tabs</nav>}><ProfilePage /></ShellWide>)
  const row = container.querySelector<HTMLElement>('[data-root-notification-header]')!
  expect(container.querySelector('[data-shell-scroller]')).toContainElement(row)
  fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'notifications.bell' }))
  expect(mockRouterPush).toHaveBeenCalledWith('/notifications')
})
