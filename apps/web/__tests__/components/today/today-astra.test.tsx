import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launchChrome, closeChrome } from '@/__tests__/support/chromium'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import type { NextRouter } from 'next/router'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { formatAPIDateInTimeZone } from '@orbit/shared/utils'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { TodayAstra } from '@/components/today/today-astra'
import { useUIStore } from '@/stores/ui-store'
import { Composer } from '@/components/shell/composer'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'

interface TodayAstraMocks {
  portuguese: boolean
  notifications: NotificationItem[]
  markRead: ReturnType<typeof vi.fn>
  profile: { id: string; timeZone: string; lastCompletionDate?: string | null; aiMessagesUsed?: number; aiMessagesLimit?: number }
}

const mocks = vi.hoisted((): TodayAstraMocks => ({
  portuguese: false,
  notifications: [],
  markRead: vi.fn(),
  profile: { id: 'profile', timeZone: 'UTC' },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { days: number }) =>
    mocks.portuguese
      ? ptBr.todayAstra[key.split('.')[1] as keyof typeof ptBr.todayAstra].replace('{days}', String(values?.days))
      : values ? `${key}:${values.days}` : key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, isPending: false, isError: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: mocks.notifications }),
  useMarkNotificationRead: () => ({ mutate: mocks.markRead }),
}))

function renderTodayAstra() {
  return render(<TodayAstra today={formatAPIDateInTimeZone(new Date(), mocks.profile.timeZone)} isTodaySelected suppressed={false} />)
}

describe('web Today Astra', () => {
  it.each([
    ['proactive', 'Check in', 'todayAstra.openConversation'],
    ['elapsed', 'todayAstra.returningElapsed:3', 'todayAstra.viewProgress'],
    ['bounded', 'todayAstra.returningBounded', 'todayAstra.viewProgress'],
  ])('makes the %s sentence the whole row target with a destination description', (variant, sentence, destination) => {
    mocks.profile.lastCompletionDate = variant === 'bounded' ? '2026-07-29' : '2026-08-26'
    if (variant === 'proactive') mocks.notifications = [createMockNotification({
      id: 'check-in', url: '/chat', body: sentence, createdAtUtc: '2026-08-29T10:00:00Z',
    })]
    const { container } = renderTodayAstra()
    const action = screen.getByRole(variant === 'proactive' ? 'button' : 'link', { name: sentence })
    expect(container.querySelectorAll('button, a')).toHaveLength(1)
    expect(action).toHaveAccessibleDescription(destination)
    expect(action.textContent).toBe(sentence)
    expect(action.querySelector('button, a')).toBeNull()
    if (variant === 'proactive') {
      fireEvent.click(action)
      expect(mocks.markRead).toHaveBeenCalledWith('check-in')
      expect(useUIStore.getState().astraConversationOpen).toBe(true)
    } else {
      expect(action).toHaveAttribute('href', '/progress')
      expect(mocks.markRead).not.toHaveBeenCalled()
      expect(useUIStore.getState().astraConversationOpen).toBe(false)
    }
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.portuguese = false
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

  it('keeps exactly one conversation glyph target beside the proactive sentence', () => {
    mocks.portuguese = true
    mocks.notifications = [createMockNotification({
      url: '/chat', body: 'Sua rotina mudou. Vamos conversar?', createdAtUtc: '2026-08-29T10:00:00Z',
    })]
    renderTodayAstra()
    render(<Composer state="idle" value="" suggestions={[]} words={ptBr.shell.composer}
      onChangeValue={vi.fn()} onSend={vi.fn()} onOpenConversation={vi.fn()}
      conversationLabel={ptBr.todayAstra.openConversation} />)

    expect(screen.getAllByRole('button', { name: ptBr.todayAstra.openConversation })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Sua rotina mudou. Vamos conversar?' })).toHaveAccessibleDescription(ptBr.todayAstra.openConversation)
  })

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
    expect(screen.getByRole('link', { name: 'todayAstra.returningElapsed:3' })).toHaveAttribute('href', '/progress')

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
        <TodayAstra today={formatAPIDateInTimeZone(new Date(), mocks.profile.timeZone)} isTodaySelected suppressed={false} />
      </RouterContext.Provider>,
    )

    const action = screen.getByRole('link', { name: 'todayAstra.returningElapsed:3' })
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
    expect(screen.getByRole('link', { name: 'todayAstra.returningElapsed:3' })).toHaveAttribute('href', '/progress')
  })

  it.each([
    ['23:59 yesterday locally', '2026-08-29T02:59:00Z', false, false],
    ['00:01 today locally', '2026-08-29T03:01:00Z', false, true],
    ['read today', '2026-08-29T03:01:00Z', true, false],
  ])('filters the proactive line using the profile timezone: %s', (_scenario, createdAtUtc, isRead, visible) => {
    mocks.profile.timeZone = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-08-29T03:02:00Z'))
    mocks.notifications = [createMockNotification({ url: '/chat', body: 'Check in', createdAtUtc, isRead })]

    const { container } = renderTodayAstra()

    expect(screen.queryByRole('button', { name: 'Check in' }) !== null).toBe(visible)
    if (!visible) expect(container).toBeEmptyDOMElement()
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
    const action = screen.getByRole('button', { name: 'Check in' })
    fireEvent.click(action)
    expect(mocks.markRead).toHaveBeenCalledWith('check-in')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it.each(['proactive', 'elapsed', 'bounded'])('keeps the pt-BR %s variant within two lines at 320 and grows at 200% text in both themes', async (variant) => {
    const cssPath = resolve(process.cwd(), 'app/globals.css')
    const stylesheet = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath })
    vi.useRealTimers()
    const launch = launchChrome()
    try {
      const browser = await launch
      const page = await browser.newPage()
      await page.setViewportSize({ width: 320, height: 800 })
      mocks.profile.lastCompletionDate = variant === 'proactive' ? null
        : new Date(Date.now() - (variant === 'elapsed' ? 3 : 31) * 86_400_000).toISOString().slice(0, 10)
      mocks.notifications = variant === 'proactive' ? [createMockNotification({
        url: '/chat', body: 'Sua rotina mudou. Vamos conversar sobre os hábitos que você quer retomar e organizar os próximos passos?',
        createdAtUtc: new Date().toISOString(),
      })] : []
      mocks.portuguese = true
      const { container, unmount } = renderTodayAstra()
      for (const mode of ['dark', 'light'] as const) {
        const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value};`).join('')
        for (const fontSize of [16, 32]) {
          await page.mouse.move(0, 0)
          await page.setContent(`<html class="${mode}" lang="pt-BR"><style>${stylesheet.css}:root{${variables}font-size:${fontSize}px}body{padding:16px}</style><body>${container.innerHTML}</body></html>`)
          await loadAppFonts(page)
          const action = page.getByRole(variant === 'proactive' ? 'button' : 'link')
          const appearance = await action.evaluate((element) => {
            const style = getComputedStyle(element)
            const sentence = element.querySelector('.today-astra-sentence')!
            const sentenceStyle = getComputedStyle(sentence)
            const reference = document.createElement('span')
            reference.style.background = 'var(--bg-well)'
            document.body.append(reference)
            const target = element.getBoundingClientRect()
            const prose = sentence.getBoundingClientRect()
            return {
              height: target.height, width: target.width, right: target.right,
              paddingStart: style.paddingInlineStart, paddingEnd: style.paddingInlineEnd,
              radius: style.borderRadius, background: style.backgroundColor,
              textColor: sentenceStyle.color, glyphColor: getComputedStyle(element.querySelector('svg')!).color,
              canvas: getComputedStyle(document.body).backgroundColor,
              expectedBackground: getComputedStyle(reference).backgroundColor,
              proseHeight: prose.height, lineHeight: parseFloat(sentenceStyle.lineHeight),
              clamp: sentenceStyle.webkitLineClamp,
              fullText: sentence.textContent, name: element.textContent,
              extraTarget: getComputedStyle(element, '::before').content,
              overflow: document.documentElement.scrollWidth > window.innerWidth,
            }
          })
          expect(appearance).toMatchObject({
            width: 288, paddingStart: '16px', paddingEnd: '16px', radius: '12px',
            background: appearance.expectedBackground, clamp: '2', extraTarget: 'none', overflow: false,
          })
          expect(appearance.height).toBeGreaterThanOrEqual(48)
          expect(appearance.proseHeight).toBeLessThanOrEqual(appearance.lineHeight * 2)
          expect(appearance.name).toBe(appearance.fullText)
          if (fontSize === 32) expect(appearance.height).toBeGreaterThan(48)
          expect(contrastOnSurface(appearance.textColor, [appearance.canvas, appearance.background])).toBeGreaterThanOrEqual(4.5)
          expect(contrastOnSurface(appearance.glyphColor, [appearance.canvas, appearance.background])).toBeGreaterThanOrEqual(3)
          await page.keyboard.press('Tab')
          expect(await action.evaluate((element) => document.activeElement === element)).toBe(true)
          expect(await action.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
          await action.hover()
          const hoveredFill = await action.evaluate((element) => getComputedStyle(element).backgroundColor)
          expect(hoveredFill).not.toBe(appearance.background)
          expect(contrastOnSurface(appearance.textColor, [appearance.canvas, hoveredFill])).toBeGreaterThanOrEqual(4.5)
        }
      }
      unmount()
      await page.close()
    } finally {
      await closeChrome(launch)
    }
  })
})
