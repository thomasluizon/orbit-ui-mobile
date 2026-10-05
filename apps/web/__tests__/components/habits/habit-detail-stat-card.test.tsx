import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitMetricsSchema, type HabitDetail, type HabitMetrics } from '@orbit/shared/types/habit'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { StatTile } from '@/components/ui/stat-tile'

vi.mock('next-intl', () => ({
  useLocale: () => mocks.language,
  useTranslations: (namespace?: string) => (key: string) => translate(namespace ? `${namespace}.${key}` : key),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/app/(app)/today-provider', () => ({ useToday: () => '2026-08-29' }))
vi.mock('@/components/shell/destination-shell', () => ({ useShellHeaderSlot: () => false }))
vi.mock('@/components/ui/stat-tile', async (original) => ({
  ...(await original<typeof import('@/components/ui/stat-tile')>()),
  StatTile: vi.fn((props: React.ComponentProps<typeof StatTile>) => <output>{props.label}{'value' in props ? props.value : ''}</output>),
}))
const mocks = vi.hoisted(() => ({
  detail: null as HabitDetail | null,
  metrics: undefined as HabitMetrics | undefined,
  loading: false,
  error: false,
  language: 'en',
}))

function translate(key: string): string {
  const catalog = mocks.language === 'pt-BR' ? ptBR : en
  const value = key.split('.').reduce<unknown>((branch, part) =>
    typeof branch === 'object' && branch !== null ? Reflect.get(branch, part) : undefined, catalog)
  return typeof value === 'string' ? value : key
}

vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: mocks.detail, isLoading: false, isError: false }),
  useHabitLogs: () => ({ data: [] }),
  useHabitMetrics: () => ({ data: mocks.metrics, isLoading: mocks.loading, isError: mocks.error }),
  useHabits: () => ({ data: { habitsById: new Map(), topLevelHabits: [] }, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutateAsync: vi.fn() }),
  useUpdateHabit: () => ({ mutateAsync: vi.fn() }),
  useUpdateChecklist: () => ({ mutateAsync: vi.fn() }),
  useDeleteHabit: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { hasProAccess: true, timeZone: 'UTC', language: mocks.language, weekStartDay: 1 } }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => ({ suggestion: null, error: null }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/components/habits/habit-detail-fields', () => ({ HabitDetailFields: () => null, HabitDetailSchedule: () => null }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/habit-log-button', () => ({ HabitLogButton: () => null }))
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: () => null }))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))

beforeEach(() => {
  mocks.detail = { ...makeHabitDetail(), children: [] }
  mocks.metrics = habitMetricsSchema.parse({ currentStreak: 2, longestStreak: 4, weeklyCompletionRate: 80, monthlyCompletionRate: 74.6, totalCompletions: 2, lastCompletedDate: null })
  mocks.loading = false
  mocks.error = false
  mocks.language = 'en'
})

afterEach(() => { cleanup(); vi.mocked(StatTile).mockClear() })

describe('habit detail stat card', () => {
  it.each(['en', 'pt-BR'])('renders three label and value rows in one card in %s', (language) => {
    mocks.language = language
    const { container } = render(<HabitDetailScreen habitId="habit-1" />)
    const cards = container.querySelectorAll('[data-habit-detail-content] [data-habit-detail-stat-card]')
    expect(cards).toHaveLength(1)
    const rows = cards[0]!.querySelectorAll('[data-habit-detail-stat-row]')
    expect(rows).toHaveLength(3)
    expect(Array.from(rows, (row) => `${row.querySelector('[data-habit-detail-stat-label]')!.textContent}${row.querySelector('[data-habit-detail-stat-value]')!.textContent}`)).toEqual([
      `${translate('habits.detail.currentStreak')}2`,
      `${translate('habits.detail.longestStreak')}4`,
      `${translate('habits.detail.monthlyRate')}75%`,
    ])
    expect(StatTile).not.toHaveBeenCalled()
  })

  it('uses Sem recaída for an avoid habit in Portuguese', () => {
    mocks.language = 'pt-BR'
    mocks.detail = { ...makeHabitDetail(), isBadHabit: true, children: [] }
    const { container } = render(<HabitDetailScreen habitId="habit-1" />)
    const card = container.querySelector('[data-habit-detail-stat-card]')!
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText('Sem recaída')).toBeInTheDocument()
    expect(within(card as HTMLElement).queryByText(ptBR.habits.detail.currentStreak)).not.toBeInTheDocument()
  })

  it('keeps the same three rows while loading and marks the card busy', () => {
    mocks.loading = true
    mocks.metrics = undefined
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    const card = view.container.querySelector('[data-habit-detail-stat-card]')!
    expect(card).not.toBeNull()
    expect(card).toHaveAttribute('aria-busy', 'true')
    const rows = card.querySelectorAll('[data-habit-detail-stat-row]')
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(within(row.querySelector('[data-habit-detail-stat-value]') as HTMLElement).getByText(en.common.loading)).toBeInTheDocument()
    expect(StatTile).not.toHaveBeenCalled()
    mocks.loading = false
    mocks.metrics = habitMetricsSchema.parse({ currentStreak: 2, longestStreak: 4, weeklyCompletionRate: 80, monthlyCompletionRate: 75, totalCompletions: 2, lastCompletedDate: null })
    view.rerender(<HabitDetailScreen habitId="habit-1" />)
    expect(view.container.querySelector('[data-habit-detail-stat-card]')).toBe(card)
    expect(card).not.toHaveAttribute('aria-busy', 'true')
    expect(card.querySelectorAll('[data-habit-detail-stat-row]')).toHaveLength(3)
  })

  it.each(['missing', 'empty', 'error'])('renders one no data line for %s metrics', (state) => {
    if (state === 'missing') mocks.metrics = undefined
    if (state === 'empty') mocks.metrics = { ...mocks.metrics!, totalCompletions: 0 }
    mocks.error = state === 'error'
    const { container } = render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.getAllByText(en.habits.detail.noDataYet)).toHaveLength(1)
    expect(container.querySelector('[data-habit-detail-stat-card]')).toBeNull()
    expect(StatTile).not.toHaveBeenCalled()
  })
})

describe('habit detail stat card geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const bodyFont = readFileSync(require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')).toString('base64')
    const displayFont = readFileSync(require.resolve('@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf')).toString('base64')
    stylesheet += `@font-face { font-family: GeometryGeist; src: url(data:font/ttf;base64,${bodyFont}); } @font-face { font-family: GeometryDisplay; font-weight: 600; src: url(data:font/ttf;base64,${displayFont}); } :root { --font-geist: GeometryGeist; --font-space-grotesk: GeometryDisplay; }`
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 412, 1280].flatMap((width) => [1, 2].flatMap((fontScale) => ['en', 'pt-BR'].flatMap((language) => [false, true].map((isBadHabit) => ({ width, fontScale, language, isBadHabit }))))))('keeps the card and value slots stable at $width and text scale $fontScale in $language with avoid $isBadHabit', async ({ width, fontScale, language, isBadHabit }) => {
    mocks.language = language
    mocks.detail = { ...makeHabitDetail(), isBadHabit, children: [] }
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      const scaledStyles = fontScale === 2 ? '[data-habit-detail-stat-label] { font-size: 28px; line-height: 40px; } [data-habit-detail-stat-value] { font-size: 44px; line-height: 1.3; } [data-habit-detail-stat-value] > span { font-size: 28px; } [data-habit-detail-stat-label] + span { font-size: 44px; } [data-habit-detail-stat-label] + span > [aria-hidden] { font-size: 28px; }' : ''
      const markup = view.container.querySelector('[data-habit-detail-content]')!.outerHTML
      await page.setContent(`<style>${stylesheet}${scaledStyles}</style>${markup}`)
      const card = page.locator('[data-habit-detail-stat-card]')
      expect(await card.count()).toBe(1)
      const geometry = await card.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { radius: style.borderRadius, padding: style.padding, rows: Array.from(element.querySelectorAll('[data-habit-detail-stat-row]'), (row) => {
          const label = row.querySelector('[data-habit-detail-stat-label]')!
          const value = row.querySelector('[data-habit-detail-stat-value]')!
          return { height: row.getBoundingClientRect().height, labelStart: label.getBoundingClientRect().left - rect.left, valueEnd: rect.right - value.getBoundingClientRect().right, labelHeight: label.getBoundingClientRect().height, labelLineHeight: Number.parseFloat(getComputedStyle(label).lineHeight), labelOverflow: label.scrollWidth > label.clientWidth, labelTruncated: getComputedStyle(label).textOverflow === 'ellipsis', fontSize: getComputedStyle(value).fontSize, weight: getComputedStyle(value).fontWeight }
        }) }
      })
      expect(geometry.radius).toBe('20px')
      expect(geometry.padding).toBe('24px')
      expect(geometry.rows).toHaveLength(3)
      for (const row of geometry.rows) {
        expect(row.height).toBeGreaterThanOrEqual(48)
        expect(Math.abs(row.labelStart - 24)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(row.valueEnd - 24)).toBeLessThanOrEqual(0.5)
        expect(row.fontSize).toBe(`${22 * fontScale}px`)
        expect(row.weight).toBe('600')
        expect(row.labelOverflow).toBe(false)
        expect(row.labelTruncated).toBe(false)
      }
      if (width === 320 && fontScale === 2) expect(geometry.rows.some((row) => row.labelHeight > row.labelLineHeight)).toBe(true)
      const loadedHeight = await card.evaluate((element) => element.getBoundingClientRect().height)
      mocks.loading = true
      view.rerender(<HabitDetailScreen habitId="habit-1" />)
      await page.setContent(`<style>${stylesheet}${scaledStyles}</style>${view.container.querySelector('[data-habit-detail-content]')!.outerHTML}`)
      expect(await card.getAttribute('aria-busy')).toBe('true')
      expect(await card.evaluate((element) => element.getBoundingClientRect().height)).toBe(loadedHeight)
    } finally { await page.close() }
  })
})
