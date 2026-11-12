import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { withSpringCalls, withTimingCalls } from '@/test-mocks/react-native-reanimated'
import { HabitListMotionRow } from '@/components/motion/habit-list-row'
import { useRetainedHabitList } from '@/hooks/use-retained-habit-list'
import { motionSprings, resolveMotionPreset } from '@orbit/shared/theme'

const preference = vi.hoisted(() => ({ reduced: false }))
const sharedValueWrites = vi.hoisted(() => [] as { initial: unknown; value: unknown }[])
vi.mock('react-native-reanimated', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/test-mocks/react-native-reanimated')>(),
  useSharedValue: <Value,>(initial: Value) => {
    const [shared] = React.useState(() => {
      let current = initial
      return {
        get value() { return current },
        set value(value: Value) { sharedValueWrites.push({ initial, value }); current = value },
      }
    })
    return shared
  },
}))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
afterEach(() => { vi.useRealTimers(); preference.reduced = false })

function List({ items, scope = 'account:today', collapsedIds }: Readonly<{ items: { id: string; parentId?: string | null }[]; scope?: string; collapsedIds?: ReadonlySet<string> }>) {
  const presentation = useRetainedHabitList(items, scope, preference.reduced, collapsedIds)
  return <>{presentation.rows.map((row) => <HabitListMotionRow key={row.item.id} id={row.item.id}
    phase={row.phase} offset={row.offset} itemIds={presentation.itemIds} measure={presentation.measure}>{row.item.id}</HabitListMotionRow>)}</>
}

it.each([false, true])('retains each exit with only opacity under reduced motion: %s', async (reduced) => {
  preference.reduced = reduced
  vi.useFakeTimers()
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={[{ id: 'first' }, { id: 'second' }]} />) })
  withTimingCalls.length = 0
  await act(() => { tree.update(<List items={[]} />) })
  const rows = tree.root.findAllByType('AnimatedView')
  expect(rows).toHaveLength(2)
  for (const row of rows) {
    expect(row.props.entering).toBeUndefined()
    expect(row.props.exiting).toBeUndefined()
    expect(row.props.pointerEvents).toBe('none')
    if (reduced) expect(row.props.style).toMatchObject({ transform: [] })
  }
  const exit = resolveMotionPreset('list-exit', reduced)
  expect(withTimingCalls.filter((call) => call.value === 0 && (call.config as { duration: number }).duration === exit.exitDuration)).toHaveLength(2)
  await act(() => { vi.advanceTimersByTime(exit.exitDuration) })
  expect(tree.root.findAllByType('AnimatedView')).toHaveLength(0)
  await act(() => tree.unmount())
})

it('restores a departing row and discards retained rows on account replacement', async () => {
  vi.useFakeTimers()
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={[{ id: 'first' }]} />) })
  await act(() => { tree.update(<List items={[]} />) })
  await act(() => { tree.update(<List items={[{ id: 'first' }]} />) })
  await act(() => { vi.advanceTimersByTime(300) })
  expect(tree.root.findAllByType('AnimatedView')[0]!.props['data-phase']).toBe('present')
  await act(() => { tree.update(<List items={[]} scope="another-account:today" />) })
  expect(tree.root.findAllByType('AnimatedView')).toHaveLength(0)
  await act(() => tree.unmount())
})

it.each(['search:walk', 'filter:Day', 'date:2026-09-04'])('drops the rows a scope change removes at once, without an exit: %s', async (nextScope) => {
  vi.useFakeTimers()
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={[{ id: 'walk' }, { id: 'run' }]} scope="account:today" />) })
  await act(() => { tree.update(<List items={[{ id: 'walk' }]} scope={nextScope} />) })
  expect(tree.root.findAllByType('AnimatedView').map((row) => row.props['data-phase'])).toEqual(['present'])
  await act(() => tree.unmount())
})

it('keeps the exit for a row a person logs or deletes while the scope stays the same', async () => {
  vi.useFakeTimers()
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={[{ id: 'walk' }, { id: 'run' }]} />) })
  await act(() => { tree.update(<List items={[{ id: 'walk' }]} />) })
  expect(tree.root.findAllByType('AnimatedView').map((row) => row.props['data-phase'])).toEqual(['present', 'exit'])
  await act(() => tree.unmount())
})

it('drops the rows a collapse hides at once and keeps the fade when the group expands', async () => {
  vi.useFakeTimers()
  const parent = { id: 'parent', parentId: null }
  const child = { id: 'child', parentId: 'parent' }
  const grandchild = { id: 'grandchild', parentId: 'child' }
  const sibling = { id: 'sibling', parentId: null }
  const expanded = [parent, child, grandchild, sibling]
  const collapsed = [parent, sibling]
  const phases = () => tree.root.findAllByType('AnimatedView').map((row) => `${String(row.props.testID)}:${String(row.props['data-phase'])}`)
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={expanded} collapsedIds={new Set()} />) })
  await act(() => { tree.update(<List items={collapsed} collapsedIds={new Set(['parent'])} />) })
  expect(phases()).toEqual(['habit-motion-parent:present', 'habit-motion-sibling:present'])
  await act(() => { tree.update(<List items={expanded} collapsedIds={new Set()} />) })
  expect(phases()).toEqual(['habit-motion-parent:present', 'habit-motion-child:enter', 'habit-motion-grandchild:enter', 'habit-motion-sibling:present'])
  await act(() => tree.unmount())
})

it('keeps the exit for a logged sub-habit and drops it at once when its group collapses', async () => {
  vi.useFakeTimers()
  const parent = { id: 'parent', parentId: null }
  const child = { id: 'child', parentId: 'parent' }
  const sibling = { id: 'sibling', parentId: null }
  const expandedIds = new Set<string>()
  const phases = () => tree.root.findAllByType('AnimatedView').map((row) => `${String(row.props.testID)}:${String(row.props['data-phase'])}`)
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={[parent, child, sibling]} collapsedIds={expandedIds} />) })
  await act(() => { tree.update(<List items={[parent, sibling]} collapsedIds={expandedIds} />) })
  expect(phases()).toEqual(['habit-motion-parent:present', 'habit-motion-child:exit', 'habit-motion-sibling:present'])
  await act(() => { tree.update(<List items={[parent, sibling]} collapsedIds={new Set(['parent'])} />) })
  expect(phases()).toEqual(['habit-motion-parent:present', 'habit-motion-sibling:present'])
  await act(() => tree.unmount())
})

it('keeps measured rows moving when a virtualized row above them has no measurement', async () => {
  const unmeasured = { id: 'offscreen' }
  const first = { id: 'first' }
  const second = { id: 'second' }
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={[unmeasured, first, second]} />) })
  const row = (id: string) => tree.root.findAllByType('AnimatedView').find((entry) => entry.props.testID === `habit-motion-${id}`)!
  const measureRow = (id: string, height: number) => {
    const onLayout = row(id).props.onLayout as (event: { nativeEvent: { layout: { height: number } } }) => void
    onLayout({ nativeEvent: { layout: { height } } })
  }
  await act(() => {
    measureRow(first.id, 100)
    measureRow(second.id, 120)
  })
  expect(tree.root.findAllByType(HabitListMotionRow).find((entry) => entry.props.id === second.id)!.props.offset).toBe(100)
  sharedValueWrites.length = 0
  await act(() => { tree.update(<List items={[unmeasured, second, first]} />) })
  const offsets = tree.root.findAllByType(HabitListMotionRow).map((entry) => entry.props.offset)
  expect(offsets.slice(1)).toEqual([0, 120])
  expect(sharedValueWrites.filter((write) => write.initial === 0).map((write) => write.value)).toEqual([100, 0, -120, 0])
  await act(() => tree.unmount())
})

it('rebases measured rows without translation when an unmeasured predecessor reports its height', async () => {
  const items = [{ id: 'offscreen' }, { id: 'first' }, { id: 'second' }]
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={items} />) })
  const measureRow = (id: string, height: number) => {
    const row = tree.root.findAllByType('AnimatedView').find((entry) => entry.props.testID === `habit-motion-${id}`)!
    const onLayout = row.props.onLayout as (event: { nativeEvent: { layout: { height: number } } }) => void
    onLayout({ nativeEvent: { layout: { height } } })
  }
  await act(() => {
    measureRow('first', 100)
    measureRow('second', 120)
  })
  sharedValueWrites.length = 0
  await act(() => { measureRow('offscreen', 80) })
  expect(tree.root.findAllByType(HabitListMotionRow).map((row) => row.props.offset)).toEqual([0, 80, 180])
  expect(sharedValueWrites.filter((write) => write.initial === 0)).toEqual([])
  await act(() => { tree.update(<List items={[items[0]!, items[2]!, items[1]!]} />) })
  expect(sharedValueWrites.filter((write) => write.initial === 0).map((write) => write.value)).toEqual([100, 0, -120, 0])
  await act(() => tree.unmount())
})

it('moves measured survivors after an exit below an unmeasured row', async () => {
  vi.useFakeTimers()
  const items = [{ id: 'offscreen' }, { id: 'first' }, { id: 'second' }]
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={items} />) })
  await act(() => {
    for (const [id, height] of [['first', 100], ['second', 120]] as const) {
      const row = tree.root.findAllByType('AnimatedView').find((entry) => entry.props.testID === `habit-motion-${id}`)!
      const onLayout = row.props.onLayout as (event: { nativeEvent: { layout: { height: number } } }) => void
      onLayout({ nativeEvent: { layout: { height } } })
    }
  })
  await act(() => { tree.update(<List items={[items[0]!, items[2]!]} />) })
  sharedValueWrites.length = 0
  await act(() => { vi.advanceTimersByTime(resolveMotionPreset('list-exit', false).exitDuration) })
  expect(tree.root.findAllByType(HabitListMotionRow).map((row) => row.props.id)).toEqual(['offscreen', 'second'])
  expect(sharedValueWrites.filter((write) => write.initial === 0).map((write) => write.value)).toEqual([100, 0])
  await act(() => tree.unmount())
})

it('reorders rows on the shared soft spring without a timing curve', async () => {
  const items = [{ id: 'first' }, { id: 'second' }]
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={items} />) })
  await act(() => {
    for (const [id, height] of [['first', 100], ['second', 120]] as const) {
      const row = tree.root.findAllByType('AnimatedView').find((entry) => entry.props.testID === `habit-motion-${id}`)!
      const onLayout = row.props.onLayout as (event: { nativeEvent: { layout: { height: number } } }) => void
      onLayout({ nativeEvent: { layout: { height } } })
    }
  })
  withSpringCalls.length = 0
  withTimingCalls.length = 0
  await act(() => { tree.update(<List items={[items[1]!, items[0]!]} />) })
  expect(withSpringCalls).toEqual([
    { value: 0, config: { ...motionSprings.soft, overshootClamping: true } },
    { value: 0, config: { ...motionSprings.soft, overshootClamping: true } },
  ])
  expect(withTimingCalls.filter((call) => call.value === 0)).toEqual([])
  await act(() => tree.unmount())
})

it('moves no row on reorder under reduced motion', async () => {
  preference.reduced = true
  const items = [{ id: 'first' }, { id: 'second' }]
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<List items={items} />) })
  withSpringCalls.length = 0
  await act(() => { tree.update(<List items={[items[1]!, items[0]!]} />) })
  expect(withSpringCalls).toEqual([])
  await act(() => tree.unmount())
})
