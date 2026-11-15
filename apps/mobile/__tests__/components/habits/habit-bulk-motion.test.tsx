import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionPresets } from '@orbit/shared/theme'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { HabitCheck } from '@/components/habits/habit-check'
import { BulkMotionScope } from '@/components/habit-list/bulk-motion-scope'
import { HabitListMotionRow } from '@/components/motion/habit-list-row'
import { useUIStore } from '@/stores/ui-store'
import { withSpringCalls, withTimingCalls } from '@/test-mocks/react-native-reanimated'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))
/** A shared value keeps its identity across renders, as it does on a device. */
vi.mock('react-native-reanimated', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/test-mocks/react-native-reanimated')>(),
  useSharedValue: <Value,>(initial: Value) => React.useState(() => ({ value: initial }))[0],
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))

const ROWS = Array.from({ length: 50 }, (_, index) => `habit-${index}`)

function Rows({ done, exiting = false }: Readonly<{ done: boolean; exiting?: boolean }>) {
  return <BulkMotionScope scope="2026-11-13">{ROWS.map((id) => (
    <HabitListMotionRow key={id} id={id} phase={exiting ? 'exit' : 'present'} offset={null} itemIds={ROWS} measure={() => {}}>
      <HabitCheck status={done ? 'done' : 'empty'} label={id} />
    </HabitListMotionRow>
  ))}</BulkMotionScope>
}

const groupRuns = () => withTimingCalls.filter(({ value, config }) => value === 1 && (config as { duration?: number }).duration === motionPresets['list-enter'].enterDuration)
const checkPops = () => withSpringCalls.length
function clearRuns() { withTimingCalls.length = 0; withSpringCalls.length = 0 }
async function mount(element: React.ReactElement) {
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(element) })
  return {
    update: (next: React.ReactElement) => act(() => { tree.update(next) }),
    store: (change: () => void) => act(() => { change() }),
    hosts: () => tree.root.findAll((node) => typeof node.type === 'string'),
    unmount: () => act(() => { tree.unmount() }),
  }
}

beforeEach(() => {
  motion.reduced = false
  useUIStore.setState({ bulkMotionGeneration: 0, bulkMotionActive: false })
})
afterEach(clearRuns)

describe('one animation for an Android bulk action of the selection tray', () => {
  it('logs 50 rows with one settle of the group and no check pop for any row', async () => {
    enableTestFlags('orbit_guided_flows')
    const tree = await mount(<Rows done={false} />)
    clearRuns()
    await tree.store(() => useUIStore.getState().beginBulkMotion())
    await tree.update(<Rows done />)
    await tree.store(() => useUIStore.getState().endBulkMotion())
    expect(checkPops()).toBe(0)
    expect(groupRuns()).toHaveLength(1)
    expect(withTimingCalls).toHaveLength(1)
    await tree.unmount()
  })

  it('removes 50 skipped rows at once, with the one settle of the group', async () => {
    enableTestFlags('orbit_guided_flows')
    const tree = await mount(<Rows done={false} />)
    clearRuns()
    await tree.store(() => useUIStore.getState().beginBulkMotion())
    await tree.update(<Rows done={false} exiting />)
    await tree.store(() => useUIStore.getState().endBulkMotion())
    expect(withTimingCalls).toHaveLength(1)
    expect(groupRuns()).toHaveLength(1)
    expect(tree.hosts().filter((node) => String(node.props.testID).startsWith('habit-motion-')).every((node) => (node.props.style as { opacity: number }).opacity === 0)).toBe(true)
    await tree.unmount()
  })

  it('keeps the group and every row still under reduced motion', async () => {
    enableTestFlags('orbit_guided_flows')
    motion.reduced = true
    const tree = await mount(<Rows done={false} />)
    clearRuns()
    await tree.store(() => useUIStore.getState().beginBulkMotion())
    await tree.update(<Rows done />)
    await tree.store(() => useUIStore.getState().endBulkMotion())
    expect(checkPops()).toBe(0)
    expect(groupRuns()).toHaveLength(0)
    await tree.unmount()
  })

  it('still pops the one check a person logs outside a bulk action', async () => {
    enableTestFlags('orbit_guided_flows')
    const one = (done: boolean) => <BulkMotionScope scope="2026-11-13"><HabitCheck status={done ? 'done' : 'empty'} /></BulkMotionScope>
    const tree = await mount(one(false))
    clearRuns()
    await tree.update(one(true))
    expect(checkPops()).toBe(1)
    expect(groupRuns()).toHaveLength(0)
    await tree.unmount()
  })

  it('keeps the current motion of each row with the flag off', async () => {
    const tree = await mount(<Rows done={false} />)
    clearRuns()
    await tree.store(() => useUIStore.getState().beginBulkMotion())
    await tree.update(<Rows done />)
    await tree.store(() => useUIStore.getState().endBulkMotion())
    expect(checkPops()).toBe(50)
    expect(tree.hosts().some((node) => node.props.testID === 'list-bulk-settle')).toBe(false)
    await tree.unmount()
  })
})

