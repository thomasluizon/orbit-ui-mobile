import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserCalendar } from '@orbit/shared/types/calendar'
import { ApiClientError } from '@orbit/shared'

import { CalendarPickerSection } from '@/components/calendar-sync/calendar-picker-section'
import { createStyles } from '@/components/calendar-sync/calendar-import-styles'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  calendars: undefined as UserCalendar[] | undefined,
  isLoading: false,
  isError: false,
  mutate: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  radius: new Proxy({}, { get: () => 8 }),
  easings: { smooth: [0.2, 0, 0, 1] },
  tintFromPrimary: () => 'rgba(127,70,247,0.1)',
}))

vi.mock('@/lib/motion', () => ({
  usePrefersReducedMotion: () => false,
  toAnimatedEasing: () => (value: number) => value,
}))

vi.mock('@/hooks/use-calendars', () => ({
  useCalendars: () => ({
    data: mocks.calendars,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
  }),
  useSetSelectedCalendars: () => ({ mutate: mocks.mutate }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))

const tokens = new Proxy({}, { get: () => '#111111' }) as never
const styles = createStyles()
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as never

function buildCalendar(overrides: Partial<UserCalendar> = {}): UserCalendar {
  return {
    id: 'cal-1',
    name: 'Personal',
    accessRole: 'owner',
    primary: true,
    backgroundColor: '#C4530F',
    isSynced: true,
    ...overrides,
  }
}

type TestNode = { props: Record<string, unknown>; type?: unknown }

function render(enabled: boolean) {
  let tree: {
    root: {
      findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
    }
  } | null = null
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      React.createElement(CalendarPickerSection, { styles, tokens, t, enabled }),
    )
  })
  return tree!
}

function checkboxes(tree: ReturnType<typeof render>) {
  return tree.root.findAll(
    (node) => node.props.accessibilityRole === 'checkbox' && typeof node.type === 'string',
  )
}

beforeEach(() => {
  mocks.calendars = undefined
  mocks.isLoading = false
  mocks.isError = false
  mocks.mutate.mockReset()
  mocks.showError.mockReset()
})

describe('mobile CalendarPickerSection', () => {
  it('renders nothing when disabled', () => {
    mocks.calendars = [buildCalendar()]
    const tree = render(false)
    const hostNodes = tree.root.findAll((node) => typeof node.type === 'string')
    expect(hostNodes).toHaveLength(0)
  })

  it('renders a check row per calendar reflecting its synced state', () => {
    mocks.calendars = [
      buildCalendar({ id: 'cal-1', isSynced: true }),
      buildCalendar({ id: 'cal-2', name: 'Work', primary: false, isSynced: false }),
    ]
    const found = checkboxes(render(true))
    expect(found).toHaveLength(2)
    expect((found[0]!.props.accessibilityState as { checked: boolean }).checked).toBe(true)
    expect((found[1]!.props.accessibilityState as { checked: boolean }).checked).toBe(false)
  })

  it('pages a long calendar list while keeping the total visible', () => {
    mocks.calendars = Array.from({ length: 21 }, (_, index) =>
      buildCalendar({ id: `cal-${index}`, name: `Calendar ${index}` }))
    const tree = render(true)
    expect(checkboxes(tree)).toHaveLength(20)
    const showMore = tree.root.findAll((node) => node.props.children === 'calendar.showMore'
      && typeof node.props.onClick === 'function')[0]
    expect(showMore).toBeDefined()
    TestRenderer.act(() => { (showMore!.props.onClick as () => void)() })
    expect(checkboxes(tree)).toHaveLength(21)
  })

  it('opens the full Google calendar name without changing selection', () => {
    const name = ('Calendário dos compromissos de toda a família ' + 'encontros '.repeat(12)).trim()
    mocks.calendars = [buildCalendar({ name })]
    const tree = render(true)
    const title = tree.root.findAll((node) => node.type === 'Text' && node.props.children === name)[0]!
    expect(title.props.numberOfLines).toBe(2)
    const open = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === name)[0]!
    expect((open.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded).toBe(false)
    TestRenderer.act(() => { (open.props.onPress as () => void)() })
    expect((open.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded).toBe(true)
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === name && node.props.numberOfLines === undefined)).toHaveLength(1)
    expect((checkboxes(tree)[0]!.props.accessibilityState as { checked: boolean }).checked).toBe(true)
    TestRenderer.act(() => { (open.props.onPress as () => void)() })
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === name && node.props.numberOfLines === undefined)).toHaveLength(0)
    expect((open.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded).toBe(false)
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect((checkboxes(tree)[0]!.props.accessibilityState as { checked: boolean }).checked).toBe(true)
  })

  it('persists the flipped synced value on toggle', () => {
    mocks.calendars = [buildCalendar({ id: 'cal-1', isSynced: true })]
    const found = checkboxes(render(true))

    TestRenderer.act(() => {
      ;(found[0]!.props.onPress as () => void)()
    })

    expect(mocks.mutate).toHaveBeenCalledWith(
      { id: 'cal-1', isSynced: false },
      expect.anything(),
    )
  })

  it('shows textless recovery when saving a calendar is blocked', () => {
    mocks.calendars = [buildCalendar()]
    const tree = render(true)
    const found = checkboxes(tree)

    TestRenderer.act(() => {
      ;(found[0]!.props.onPress as () => void)()
      const options = mocks.mutate.mock.calls[0]?.[1] as { onError: (error: unknown) => void }
      options.onError(new ApiClientError(403, 'Forbidden'))
    })

    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'alert' && node.props.children === 'errors.api.edgeBlockedRetry')).toHaveLength(1)
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('renders the empty state when no calendars are returned', () => {
    mocks.calendars = []
    const tree = render(true)
    const texts = tree.root.findAll(
      (node) => node.props.children === 'calendar.calendars.empty',
    )
    expect(texts.length).toBeGreaterThan(0)
  })

  it('renders the error state', () => {
    mocks.isError = true
    const tree = render(true)
    const texts = tree.root.findAll(
      (node) => node.props.children === 'calendar.calendars.error',
    )
    expect(texts.length).toBeGreaterThan(0)
  })
})
