import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { withTimingCalls } from '@/test-mocks/react-native-reanimated'
import { HabitListMotionRow } from '@/components/motion/habit-list-row'
import { useRetainedHabitList } from '@/hooks/use-retained-habit-list'
import { resolveMotionPreset } from '@orbit/shared/theme'

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

function List({ items, scope = 'account:today' }: Readonly<{ items: { id: string }[]; scope?: string }>) {
  const presentation = useRetainedHabitList(items, scope, preference.reduced)
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
