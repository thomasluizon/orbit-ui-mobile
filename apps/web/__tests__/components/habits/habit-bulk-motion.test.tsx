import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionPresets } from '@orbit/shared/theme'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { HabitCheck } from '@/components/habits/habit-check'
import { BulkMotionScope } from '@/components/habits/habit-list/bulk-motion-scope'
import { ListMotionItem, ListPresence } from '@/components/motion/list-motion'
import { useUIStore } from '@/stores/ui-store'

const motionRuns = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, animate: (...args: unknown[]) => {
    motionRuns.calls.push(args)
    return (actual.animate as (...input: unknown[]) => ReturnType<typeof actual.animate>)(...args)
  } }
})

const ROWS = Array.from({ length: 50 }, (_, index) => `habit-${index}`)

function Rows({ done, present = ROWS }: Readonly<{ done: boolean; present?: readonly string[] }>) {
  return <BulkMotionScope scope="2026-11-13"><ListPresence>{present.map((id) => (
    <ListMotionItem key={id}><HabitCheck status={done ? 'done' : 'empty'} label={id} /></ListMotionItem>
  ))}</ListPresence></BulkMotionScope>
}

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }))
}

const groupRuns = () => motionRuns.calls.filter(([from]) => from === motionPresets['list-enter'].scaleFrom)
const checkRuns = () => motionRuns.calls.filter(([from]) => from === motionPresets['success-feedback'].scaleFrom)

beforeEach(() => {
  motionRuns.calls = []
  useUIStore.setState({ bulkMotionGeneration: 0, bulkMotionActive: false })
  stubReducedMotion(false)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('one animation for a bulk action of the selection tray', () => {
  it('logs 50 rows with one settle of the group and no check pop for any row', () => {
    enableTestFlags('orbit_guided_flows')
    const view = render(<Rows done={false} />)
    act(() => useUIStore.getState().beginBulkMotion())
    view.rerender(<Rows done />)
    act(() => useUIStore.getState().endBulkMotion())
    expect(groupRuns()).toHaveLength(1)
    expect(checkRuns()).toHaveLength(0)
    expect(motionRuns.calls).toHaveLength(1)
    expect(document.querySelectorAll('[data-habit-check-settle]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-status="done"]')).toHaveLength(50)
  })

  it('removes 50 skipped rows at once, with the one settle of the group', () => {
    enableTestFlags('orbit_guided_flows')
    const view = render(<Rows done={false} />)
    act(() => useUIStore.getState().beginBulkMotion())
    view.rerender(<Rows done={false} present={[]} />)
    expect(document.querySelectorAll('[data-list-motion]')).toHaveLength(0)
    act(() => useUIStore.getState().endBulkMotion())
    expect(motionRuns.calls).toHaveLength(1)
    expect(groupRuns()).toHaveLength(1)
  })

  it('keeps the group and every row still under reduced motion', () => {
    enableTestFlags('orbit_guided_flows')
    stubReducedMotion(true)
    const view = render(<Rows done={false} />)
    act(() => useUIStore.getState().beginBulkMotion())
    view.rerender(<Rows done />)
    act(() => useUIStore.getState().endBulkMotion())
    expect(motionRuns.calls).toHaveLength(0)
    expect((document.querySelector('[data-list-bulk-settle]') as HTMLElement).style.transform).toBe('')
  })

  it('still pops the one check a person logs outside a bulk action', () => {
    enableTestFlags('orbit_guided_flows')
    const view = render(<Rows done={false} present={['habit-0']} />)
    view.rerender(<Rows done present={['habit-0']} />)
    expect(checkRuns()).toHaveLength(1)
    expect(groupRuns()).toHaveLength(0)
  })

  it('keeps the current motion of each row with the flag off', () => {
    const view = render(<Rows done={false} />)
    act(() => useUIStore.getState().beginBulkMotion())
    view.rerender(<Rows done />)
    act(() => useUIStore.getState().endBulkMotion())
    expect(groupRuns()).toHaveLength(0)
    expect(checkRuns()).toHaveLength(50)
    expect(document.querySelector('[data-list-bulk-settle]')).toBeNull()
  })
})
