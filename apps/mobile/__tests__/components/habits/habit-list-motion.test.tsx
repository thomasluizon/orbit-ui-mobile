import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { withTimingCalls } from '@/test-mocks/react-native-reanimated'
import { HabitListMotionRow } from '@/components/motion/habit-list-row'
import { useRetainedHabitList } from '@/hooks/use-retained-habit-list'
import { resolveMotionPreset } from '@orbit/shared/theme'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
afterEach(() => { vi.useRealTimers(); preference.reduced = false })

function List({ items, scope = 'account:today' }: Readonly<{ items: { id: string }[]; scope?: string }>) {
  const presentation = useRetainedHabitList(items, scope, preference.reduced)
  return <>{presentation.rows.map((row) => <HabitListMotionRow key={row.item.id} id={row.item.id}
    phase={row.phase} offset={row.offset} measure={presentation.measure}>{row.item.id}</HabitListMotionRow>)}</>
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
