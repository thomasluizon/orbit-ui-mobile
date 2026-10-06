import React from 'react'
import { act, create } from 'react-test-renderer'
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { makeHabitDetail, makeHabitDetailScopedParent } from '@orbit/shared/test-support/habit-detail-fixtures'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { __setWindowDimensions } from '../../../test-mocks/react-native'

vi.mock('expo-router', () => ({ useIsFocused: () => true, useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile() }) }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: makeHabitDetail(), isLoading: false, isError: false }),
  useHabitLogs: () => ({ data: [] }),
  useHabitMetrics: () => ({ data: undefined, isLoading: false, isError: false }),
  useHabits: () => ({ data: { habitsById: new Map([['habit-1', makeHabitDetailScopedParent()]]) }, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutateAsync: vi.fn() }),
  useUpdateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateChecklist: () => ({ mutateAsync: vi.fn() }),
  useDeleteHabit: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => ({ suggestion: null }) }))
vi.mock('@/app/(tabs)/use-today-date', () => ({ useCurrentDate: () => '2026-08-28' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark', surfaces: { screen: { backgroundColor: '#111111' } } }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/habit-detail-fields', () => ({ HabitDetailFields: () => null, HabitDetailSchedule: () => null }))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))

function applyColumnStyle(node: YogaNode, style: ViewStyle) {
  if (style.width === '100%' || typeof style.width === 'number') node.setWidth(style.width)
  if (typeof style.maxWidth === 'number') node.setMaxWidth(style.maxWidth)
  if (typeof style.flex === 'number') node.setFlex(style.flex)
  if (typeof style.flexGrow === 'number') node.setFlexGrow(style.flexGrow)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  if (style.alignSelf) node.setAlignSelf({
    auto: Yoga.ALIGN_AUTO, 'flex-start': Yoga.ALIGN_FLEX_START, center: Yoga.ALIGN_CENTER,
    'flex-end': Yoga.ALIGN_FLEX_END, stretch: Yoga.ALIGN_STRETCH, baseline: Yoga.ALIGN_BASELINE,
  }[style.alignSelf])
}

describe('habit detail content edge', () => {
  it.each([412, 840])('starts the capped body on the FlowShell content edge at %i', async (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree!: ReturnType<typeof create> & { unmount: () => void }
    await act(() => { tree = create(<HabitDetailScreen habitId="habit-1" />) as typeof tree })
    const viewport = Yoga.Node.create()
    const scroller = Yoga.Node.create()
    const column = Yoga.Node.create()
    const content = Yoga.Node.create()
    try {
      const scrollView = tree.root.findAll((node) => node.type === ScrollView)[0]!
      const body = tree.root.findAll((node) => node.type === View && node.props.testID === 'habit-detail-content')[0]!
      applyColumnStyle(scroller, StyleSheet.flatten(scrollView.props.style as ViewStyle))
      applyColumnStyle(column, StyleSheet.flatten(scrollView.props.contentContainerStyle as ViewStyle))
      applyColumnStyle(content, StyleSheet.flatten(body.props.style as ViewStyle))
      viewport.insertChild(scroller, 0)
      scroller.insertChild(column, 0)
      column.insertChild(content, 0)
      viewport.calculateLayout(width, 915, Yoga.DIRECTION_LTR)
      expect(content.getComputedLeft()).toBe(16)
      expect(content.getComputedWidth()).toBe(Math.min(column.getComputedWidth() - 32, 620))
      expect(content.getComputedWidth()).toBeLessThanOrEqual(620)
      expect(column.getComputedLeft()).toBe((width - column.getComputedWidth()) / 2)
    } finally {
      viewport.freeRecursive()
      await act(() => { tree.unmount() })
      __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
    }
  })
})
