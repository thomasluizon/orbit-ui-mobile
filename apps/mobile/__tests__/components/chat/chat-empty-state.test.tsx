import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import Yoga from 'yoga-layout'
import { habitKeys } from '@orbit/shared/query'
import { habitListQueryFilters } from '@orbit/shared/utils'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'
import { createStyles } from '@/components/chat/conversation.styles'
import { createTokensV2 } from '@/lib/theme'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.habit === undefined ? key : `${key}:${values.habit}`,
    i18n: { language: 'pt-BR' },
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC' } }),
}))

const habitRequest = vi.hoisted(() => ({
  apiClient: vi.fn((_url: string): Promise<unknown> =>
    Promise.reject(new Error('the empty state must read the cached habit list'))),
}))

vi.mock('@/lib/api-client', () => habitRequest)

const TestRenderer = require('react-test-renderer')

const TODAY = '2026-08-28'
const tokens = createTokensV2('orange', 'dark')
const styles = createStyles(tokens)

function makeTopLevelItem(overrides: Partial<HabitScheduleItem>): HabitScheduleItem {
  return makeHabitScheduleItem({
    children: [],
    hasSubHabits: false,
    scheduledDates: [TODAY],
    ...overrides,
  })
}

function renderEmptyState(
  items: HabitScheduleItem[] | null,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (items !== null) {
    queryClient.setQueryData(
      habitKeys.list(habitListQueryFilters({ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }, true)),
      items,
    )
  }
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <ChatEmptyState styles={styles} />
      </QueryClientProvider>,
    )
  })
  return { tree }
}

function suggestionLabels(tree: any): string[] {
  return tree.root
    .findAll((node: any) => typeof node.type === "string" && node.props?.accessibilityRole === "button")
    .map((node: any) => node.props.accessibilityLabel as string)
}

describe('ChatEmptyState (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([240, 416, 493, 731])('keeps the empty content reachable with padding in a %ipx scroll area', (height) => {
    const { tree } = renderEmptyState([])
    const scroll = tree.root.find((node: { type: unknown }) => node.type === 'ScrollView')
    const contentStyle = StyleSheet.flatten(scroll.props.contentContainerStyle)
    const viewport = Yoga.Node.create()
    const content = Yoga.Node.create()
    viewport.setWidth(368)
    viewport.setHeight(height)
    viewport.setOverflow(Yoga.OVERFLOW_SCROLL)
    viewport.insertChild(content, 0)
    content.setFlexGrow(contentStyle.flexGrow)
    content.setFlexShrink(contentStyle.flexShrink)
    content.setHeight(contentStyle.height)
    content.setMinHeight(contentStyle.minHeight)
    content.setJustifyContent(contentStyle.justifyContent === 'center' ? Yoga.JUSTIFY_CENTER : Yoga.JUSTIFY_FLEX_START)
    content.setGap(Yoga.GUTTER_ALL, contentStyle.gap)
    content.setPadding(Yoga.EDGE_VERTICAL, contentStyle.paddingVertical ?? 0)
    content.setPadding(Yoga.EDGE_HORIZONTAL, contentStyle.paddingHorizontal ?? 0)
    /** Synthetic intrinsic blocks exercise spare space and overflow using the mounted content styles. */
    expect(scroll.props.children.filter(Boolean)).toHaveLength(2)
    for (const intrinsicHeight of [244, 48]) {
      const block = Yoga.Node.create()
      block.setHeight(intrinsicHeight)
      content.insertChild(block, content.getChildCount())
    }
    try {
      viewport.calculateLayout(undefined, undefined)
      const firstTop = content.getChild(0).getComputedTop()
      const last = content.getChild(1)
      const lastBottom = last.getComputedTop() + last.getComputedHeight()
      const contentHeight = content.getComputedHeight()
      const scrollEnd = Math.max(0, contentHeight - height)
      expect(firstTop).toBeGreaterThanOrEqual(16)
      expect(height - (lastBottom - scrollEnd)).toBeGreaterThanOrEqual(16)
      if (height >= 348) {
        expect(contentHeight).toBe(height)
        expect(Math.abs(firstTop - (height - lastBottom))).toBeLessThanOrEqual(1)
      } else {
        expect(contentHeight).toBeGreaterThan(height)
      }
    } finally {
      viewport.freeRecursive()
      TestRenderer.act(() => tree.unmount())
    }
  })

  it('heads the empty thread with the Astra mark, on no disc and with no accent', () => {
    const { tree } = renderEmptyState([])

    expect(tree.root.findAll((node: any) =>
      typeof node.type === 'string' && node.props?.testID === 'empty-state-mark-astra',
    )).toHaveLength(1)
    const rendered = JSON.stringify(tree.toJSON())
    expect(rendered).not.toContain(tokens.primary)
    expect(rendered).not.toContain(tokens.primaryRgb)
  })

  it('sets the disclosure on the type scale, in the third text tone', () => {
    const { tree } = renderEmptyState([])
    const disclosure = tree.root.find((node: any) => node.type === 'Text' && node.props.children === 'aiDisclosure.notMedicalAdvice')

    expect(StyleSheet.flatten(disclosure.props.style)).toMatchObject({ fontSize: 12, color: tokens.fg3 })
  })

  it.each([{ habits: [] }, { habits: [makeTopLevelItem({ id: 'walk', title: 'Caminhar', position: 0 })] }])(
    'renders only the mark, title and disclosure with habits $habits', ({ habits: items }) => {
      const { tree } = renderEmptyState(items)
      const rendered = JSON.stringify(tree.toJSON())

      expect(rendered).toContain('chat.empty.title')
      expect(rendered).toContain('aiDisclosure.notMedicalAdvice')
      expect(suggestionLabels(tree)).toEqual([])
      expect(tree.root.findAll((node: any) => node.type === 'Text' && typeof node.props.children === 'string').map((node: any) => node.props.children)).toEqual(['chat.empty.title', 'aiDisclosure.notMedicalAdvice'])
    },
  )
})
