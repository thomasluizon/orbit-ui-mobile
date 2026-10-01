import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launchChrome, closeChrome } from '@/__tests__/support/chromium'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import type { NextRouter } from 'next/router'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { TodayAstra } from '@/components/today/today-astra'
import { useUIStore } from '@/stores/ui-store'

interface TodayAstraMocks {
  notifications: NotificationItem[]
  markRead: ReturnType<typeof vi.fn>
  profile: { id: string; timeZone: string; lastCompletionDate?: string | null; aiMessagesUsed?: number; aiMessagesLimit?: number }
}

const mocks = vi.hoisted((): TodayAstraMocks => ({
  notifications: [],
  markRead: vi.fn(),
  profile: { id: 'profile', timeZone: 'UTC' },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { days: number }) =>
    values ? `${key}:${values.days}` : key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, isPending: false, isError: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: mocks.notifications }),
  useMarkNotificationRead: () => ({ mutate: mocks.markRead }),
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))

function renderTodayAstra() {
  return render(<TodayAstra isTodaySelected suppressed={false} />)
}

describe('web Today Astra', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.notifications = []
    mocks.markRead.mockReset()
    mocks.profile = { id: 'profile', timeZone: 'UTC' }
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'))
    useUIStore.setState({ astraConversationOpen: false })
    document.getElementById('today-composer-slot')?.remove()
  })

  function appendComposerSlot() {
    const slot = document.createElement('div')
    slot.id = 'today-composer-slot'
    document.body.append(slot)
    return slot
  }

  it('leaves the retired Today composer slot empty', () => {
    const slot = appendComposerSlot()

    renderTodayAstra()

    expect(slot).toBeEmptyDOMElement()
  })

  it('renders no proactive row when there is no unread check-in', () => {
    const { container } = renderTodayAstra()

    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['three-day completion', '2026-08-26', 'todayAstra.returningElapsed:3'],
    ['four-day completion', '2026-08-25', 'todayAstra.returningElapsed:4'],
    ['window boundary', '2026-07-30', 'todayAstra.returningElapsed:30'],
    ['gap beyond the window', '2026-07-29', 'todayAstra.returningBounded'],
  ])('shows the profile interval for %s', (_scenario, lastCompletionDate, expected) => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate }

    renderTodayAstra()

    expect(screen.getByText(expected, { exact: false })).toBeInTheDocument()
  })

  it.each([null, undefined])('shows no interval for %s completion', (lastCompletionDate) => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate }

    const { container } = renderTodayAstra()

    expect(container).toBeEmptyDOMElement()
  })

  it('links to Progress from the returning line without marking a notification read', () => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate: '2026-08-26' }

    renderTodayAstra()
    expect(screen.getByRole('link', { name: 'todayAstra.viewProgress' })).toHaveAttribute('href', '/progress')
    expect(screen.getByRole('link', { name: 'todayAstra.viewProgress' })).toHaveClass('today-astra-action')

    expect(mocks.markRead).not.toHaveBeenCalled()
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })

  it('routes the returning Progress action in-app without document navigation', () => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate: '2026-08-26' }
    const push = vi.fn()
    const router = {
      pathname: '/', asPath: '/', push, prefetch: vi.fn(), beforePopState: vi.fn(),
    } as unknown as NextRouter

    render(
      <RouterContext.Provider value={router}>
        <TodayAstra isTodaySelected suppressed={false} />
      </RouterContext.Provider>,
    )

    const action = screen.getByRole('link', { name: 'todayAstra.viewProgress' })
    expect(action).toHaveAttribute('href', '/progress')
    const click = fireEvent.click(action)

    expect(click).toBe(false)
    expect(push).toHaveBeenCalledWith('/progress', '/progress', {
      shallow: undefined, locale: undefined, scroll: true,
    })
  })

  it.each(['offline', 'quota exhausted'])('keeps Progress available when %s', (state) => {
    mocks.profile = {
      id: 'profile', timeZone: 'UTC', lastCompletionDate: '2026-08-26',
      aiMessagesUsed: state === 'quota exhausted' ? 10 : 0, aiMessagesLimit: 10,
    }
    if (state === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    renderTodayAstra()

    expect(screen.getByText('todayAstra.returningElapsed:3', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'todayAstra.viewProgress' })).toHaveAttribute('href', '/progress')
  })

  it('renders a proactive check-in and opens its conversation', () => {
    mocks.notifications = [{
      id: 'check-in',
      title: 'Astra',
      body: 'Check in',
      url: '/chat',
      habitId: null,
      isRead: false,
      createdAtUtc: '2026-08-29T10:00:00Z',
    }]

    renderTodayAstra()

    expect(screen.getByText(/Check in/)).toBeInTheDocument()
    const action = screen.getByRole('button', { name: 'todayAstra.openConversation' })
    expect(action).toHaveClass('orbit-link-action-persistent')
    fireEvent.click(action)
    expect(mocks.markRead).toHaveBeenCalledWith('check-in')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('renders both inline actions with the drawn emphasis and scale spacing in both themes', async () => {
    const cssPath = resolve(process.cwd(), 'app/globals.css')
    const stylesheet = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath })
    vi.useRealTimers()
    const launch = launchChrome()
    try {
      const browser = await launch
      for (const proactive of [true, false]) {
        mocks.profile.lastCompletionDate = proactive ? null : new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
        mocks.notifications = proactive ? [{
          id: 'check-in', title: 'Astra', body: 'Check in', url: '/chat', habitId: null,
          isRead: false, createdAtUtc: new Date().toISOString(),
        }] : []
        const { container, unmount } = renderTodayAstra()
        for (const mode of ['dark', 'light'] as const) {
          const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value};`).join('')
          const page = await browser.newPage()
          await page.setContent(`<html class="${mode}"><style>${stylesheet.css}:root{${variables}}</style><body>${container.innerHTML}</body></html>`)
          const action = page.getByRole(proactive ? 'button' : 'link')
          const appearance = await action.evaluate((element) => {
            const style = getComputedStyle(element)
            const reference = document.createElement('span')
            reference.style.color = 'var(--fg-1)'
            reference.style.textDecorationColor = 'var(--hairline-strong)'
            document.body.append(reference)
            return {
              fontSize: style.fontSize, fontWeight: style.fontWeight,
              color: style.color, expectedColor: getComputedStyle(reference).color,
              underline: style.textDecorationLine, underlineColor: style.textDecorationColor,
              expectedUnderlineColor: getComputedStyle(reference).textDecorationColor,
              marginStart: style.marginInlineStart,
              previousText: element.previousSibling?.textContent,
              background: style.backgroundColor,
              generatedUnderline: getComputedStyle(element, '::after').content,
            }
          })
          expect(appearance).toMatchObject({
            fontSize: '14px', fontWeight: '500', color: appearance.expectedColor,
            underline: 'underline', underlineColor: appearance.expectedUnderlineColor,
            marginStart: '4px', background: 'rgba(0, 0, 0, 0)', generatedUnderline: 'none',
          })
          expect(appearance.previousText?.endsWith(' ')).toBe(false)
          await action.hover()
          await page.waitForFunction(() => {
            const element = document.querySelector('button, a')!
            const style = getComputedStyle(element)
            return style.textDecorationColor === style.color
          })
          await page.close()
        }
        unmount()
      }
    } finally {
      await closeChrome(launch)
    }
  }, 45_000)

  it('shows returning Progress when a proactive check-in is unavailable offline', () => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate: '2026-08-26' }
    mocks.notifications = [{
      id: 'check-in', title: 'Astra', body: 'Check in', url: '/chat', habitId: null,
      isRead: false, createdAtUtc: '2026-08-29T10:00:00Z',
    }]
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    renderTodayAstra()

    expect(screen.getByRole('link', { name: 'todayAstra.viewProgress' })).toHaveAttribute('href', '/progress')
    expect(screen.queryByText('Check in', { exact: false })).not.toBeInTheDocument()
  })

})
