import { describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import React, { createRef } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { FlatList, RefreshControl, StyleSheet, type FlatListProps } from 'react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitDrill } from '@/components/habit-list/habit-drill'
import { createStyles } from '@/components/habit-list/styles'
import { createTokensV2 } from '@/lib/theme'
import { measureClampedPersonalText, expandedTextControls, expectPersonalTextLayout, pressTextControl } from '@/__tests__/support/personal-text'
vi.mock('react-native', async (load) => {
  const native = await load<typeof import('react-native')>()
  const { useState } = await import('react')
  return { ...native, FlatList: ({ ListHeaderComponent, onScroll }: FlatListProps<NormalizedHabit>) => {
    const [offset, setOffset] = useState(0)
    return <native.ScrollView testID="native-drill-list" accessibilityValue={{ now: offset }} onScroll={(event) => {
      setOffset(event.nativeEvent.contentOffset.y)
      onScroll?.(event)
    }}>{ListHeaderComponent as React.ReactNode}</native.ScrollView>
  } }
})
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
    await act(() => { tree = create(<HabitDrill drill={drill} styles={createStyles(createTokensV2(undefined, 'light'))} t={(key) => key} listHeaderComponent={null} drillListRef={createRef<FlatList<NormalizedHabit>>()} refreshControl={<RefreshControl refreshing={false} />} onListScroll={vi.fn()} bulkBarStyle={{}} renderHabitCard={() => null} onAddSubHabit={vi.fn()} />) })
    await expectPersonalTextLayout(tree.root, name)
    await measureClampedPersonalText(tree.root, name)
    await act(() => pressTextControl(expandedTextControls(tree.root, `common.showFullText:${JSON.stringify({ name })}`, false)[0]!))
    expect(tree.root.findAll((node) => String(node.type) === 'ScrollView' && node.props.horizontal === true).length).toBeGreaterThan(0)
    expect(drillBack).not.toHaveBeenCalled()
    const back = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'common.back')[0]!
    await act(() => pressTextControl(back))
    expect(drillBack).toHaveBeenCalledOnce()
    await act(() => tree.update(<></>))
  })
})

it.each(['scroll', 'header'] as const)('keeps drill %s scoped to the current parent', async (check) => {
  const parent = createMockHabit({ id: 'parent', title: 'General' })
  const drill = {
    drillStack: [parent.id], currentParentId: parent.id, currentParent: parent,
    drillChildren: [], hasUnfilteredChildren: false, canRevealCompletedChildren: false, completedCount: 0,
    drillLoading: false, drillError: '', drillInto: vi.fn(async () => {}), drillBack: vi.fn(), drillReset: vi.fn(),
    refreshCurrent: vi.fn(async () => {}), getDrillChildren: () => [],
  }
  const renderDrill = (parentId: string) => <HabitDrill drill={{ ...drill, currentParentId: parentId }}
    styles={createStyles(createTokensV2(undefined, 'light'))} t={(key) => key}
    listHeaderComponent={null} drillListRef={createRef<FlatList<NormalizedHabit>>()}
    refreshControl={<RefreshControl refreshing={false} />} onListScroll={vi.fn()} bulkBarStyle={{}}
    renderHabitCard={() => null} onAddSubHabit={vi.fn()} />
  let tree!: ReactTestRenderer
  await act(() => { tree = create(renderDrill('parent')) })
  const list = () => tree.root.findAll((node) => String(node.type) === 'ScrollView' && node.props.testID === 'native-drill-list')[0]!
  const offset = () => (list().props.accessibilityValue as { now: number }).now
  expect(offset()).toBe(0)
  const scroll = list().props.onScroll as (event: { nativeEvent: { contentOffset: { x: number; y: number } } }) => void
  await act(() => scroll({ nativeEvent: { contentOffset: { x: 0, y: 650 } } }))
  await act(() => tree.update(renderDrill('parent')))
  expect(offset()).toBe(650)
  await act(() => tree.update(renderDrill('child')))
  if (check === 'scroll') expect(offset()).toBe(0)
  const back = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'common.back')[0]!
  let row = back.parent!
  while (String(row.type) !== 'View') row = row.parent!
  if (check === 'header') {
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', gap: 12 })
    expect(row.findAll((node) => node.props.accessibilityRole === 'header').length).toBeGreaterThan(0)
  }
  await act(() => tree.unmount())
})
