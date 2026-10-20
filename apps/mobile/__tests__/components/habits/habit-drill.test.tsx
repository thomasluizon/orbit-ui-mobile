import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import React, { createRef } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { FlatList, RefreshControl } from 'react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitDrill } from '@/components/habit-list/habit-drill'
import { createStyles } from '@/components/habit-list/styles'
import { createTokensV2 } from '@/lib/theme'
import { expandedTextControls, expectPersonalTextLayout, pressTextControl } from '@/__tests__/support/personal-text'
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

describe('typed drill heading', () => {
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses %s and preserves the back action', async (name) => {
    const drillBack = vi.fn()
    const drill = {
      drillStack: ['habit-1'], currentParentId: 'habit-1', currentParent: createMockHabit({ title: name }),
      drillChildren: [], hasUnfilteredChildren: false, canRevealCompletedChildren: false, completedCount: 0,
      drillLoading: false, drillError: '', drillInto: vi.fn(async () => {}), drillBack, drillReset: vi.fn(),
      refreshCurrent: vi.fn(async () => {}), getDrillChildren: () => [],
    }
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<HabitDrill drill={drill} styles={createStyles(createTokensV2(undefined, 'light'))} t={(key) => key} hasProAccess listHeaderComponent={null} drillListRef={createRef<FlatList<NormalizedHabit>>()} refreshControl={<RefreshControl refreshing={false} />} onListScroll={vi.fn()} bulkBarStyle={{}} renderHabitCard={() => null} onAddSubHabit={vi.fn()} />) })
    const header = tree.root.findAll((node) => node.type === FlatList)[0]!.props.ListHeaderComponent as React.ReactNode
    await act(() => tree.update(<>{header}</>))
    await expectPersonalTextLayout(tree.root, name)
    await act(() => pressTextControl(expandedTextControls(tree.root, `common.showFullText:${JSON.stringify({ name })}`, false)[0]!))
    expect(tree.root.findAll((node) => String(node.type) === 'ScrollView' && node.props.horizontal === true).length).toBeGreaterThan(0)
    expect(drillBack).not.toHaveBeenCalled()
    const back = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'common.back')[0]!
    await act(() => pressTextControl(back))
    expect(drillBack).toHaveBeenCalledOnce()
    await act(() => tree.update(<></>))
  })
})
