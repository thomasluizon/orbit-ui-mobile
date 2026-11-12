import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import React, { createRef } from 'react'
import { act, create } from 'react-test-renderer'
import { FlatList, RefreshControl, StyleSheet, type FlatListProps, type ViewStyle } from 'react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { motionDurations, orbitalMotion } from '@orbit/shared/theme'
import { HabitDrill } from '@/components/habit-list/habit-drill'
import { createStyles } from '@/components/habit-list/styles'
import { createTokensV2 } from '@/lib/theme'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('react-native', async (load) => {
  const native = await load<typeof import('react-native')>()
  return { ...native, FlatList: ({ ListHeaderComponent }: FlatListProps<NormalizedHabit>) =>
    <native.ScrollView>{ListHeaderComponent as React.ReactNode}</native.ScrollView> }
})
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

function renderDrill() {
  const parent = createMockHabit({ id: 'parent', title: 'General' })
  const drill = {
    drillStack: [parent.id], currentParentId: parent.id, currentParent: parent,
    drillChildren: [], settlementHabitsById: new Map(), settlementUpdatedAtById: new Map(), hasUnfilteredChildren: false, canRevealCompletedChildren: false, completedCount: 0,
    drillLoading: false, drillError: '', drillInto: vi.fn(async () => {}), drillBack: vi.fn(), drillReset: vi.fn(),
    refreshCurrent: vi.fn(async () => {}), getDrillChildren: () => [],
  }
  return <HabitDrill drill={drill} styles={createStyles(createTokensV2(undefined, 'light'))} t={(key) => key}
    listHeaderComponent={null} drillListRef={createRef<FlatList<NormalizedHabit>>()}
    refreshControl={<RefreshControl refreshing={false} />} onListScroll={vi.fn()} bulkBarStyle={{}}
    renderHabitCard={() => null} onAddSubHabit={vi.fn()} />
}

describe('drill back press feedback', () => {
  it.each([false, true])('scales on the press token only when motion is allowed (reduced: %s)', async (reduced) => {
    preference.reduced = reduced
    let tree!: ReturnType<typeof create>
    await act(() => { tree = create(renderDrill()) })
    const back = () => tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'common.back')[0]!
    const onPressIn = back().props.onPressIn as () => void
    await act(() => onPressIn())
    const pressed = StyleSheet.flatten(back().props.style as ViewStyle) as ViewStyle & { transition?: string }
    expect(pressed).toMatchObject({ transform: [{ scale: reduced ? 1 : orbitalMotion.press.scale }] })
    if (reduced) expect(pressed.transition).toBe('none')
    else expect(pressed.transition).toContain(`transform ${motionDurations.press}ms`)
    expect(Object.keys(pressed).filter((key) => key.startsWith('transition'))).toEqual(['transition'])
    await act(() => tree.unmount())
  })
})
