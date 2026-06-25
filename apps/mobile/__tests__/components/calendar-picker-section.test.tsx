import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserCalendar } from '@orbit/shared/types/calendar'

import { CalendarPickerSection } from '@/app/calendar-picker-section'
import { createStyles } from '@/app/calendar-sync-styles'

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
  easings: { smooth: [0.2, 0, 0, 1] },
  tintFromPrimary: () => 'rgba(127,70,247,0.1)',
}))

vi.mock('@/lib/motion', () => ({
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
    backgroundColor: '#7f46f7',
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

function switches(tree: ReturnType<typeof render>) {
  return tree.root.findAll(
    (node) => node.props.accessibilityRole === 'switch' && typeof node.type === 'string',
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
    expect(hostNodes.length).toBe(0)
  })

  it('renders a switch per calendar reflecting its synced state', () => {
    mocks.calendars = [
      buildCalendar({ id: 'cal-1', isSynced: true }),
      buildCalendar({ id: 'cal-2', name: 'Work', primary: false, isSynced: false }),
    ]
    const found = switches(render(true))
    expect(found).toHaveLength(2)
    expect((found[0]!.props.accessibilityState as { checked: boolean }).checked).toBe(true)
    expect((found[1]!.props.accessibilityState as { checked: boolean }).checked).toBe(false)
  })

  it('persists the flipped synced value on toggle', () => {
    mocks.calendars = [buildCalendar({ id: 'cal-1', isSynced: true })]
    const found = switches(render(true))

    TestRenderer.act(() => {
      ;(found[0]!.props.onPress as () => void)()
    })

    expect(mocks.mutate).toHaveBeenCalledWith(
      { id: 'cal-1', isSynced: false },
      expect.anything(),
    )
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
