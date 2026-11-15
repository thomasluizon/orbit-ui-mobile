import { useState } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { HabitCheck } from '@/components/habits/habit-check'
import { HabitRow } from '@/components/habits/habit-row'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))
afterEach(() => { motion.reduced = false })

const EMPTY = createMockHabit({ id: 'habit-1', title: 'Read', isCompleted: false, isLoggedInRange: false })
const LOGGED = { ...EMPTY, isLoggedInRange: true }

/** The row owner swaps in the logged habit in the press handler, as the optimistic log does, so the measure is the press to the rendered state. */
function LoggedRow({ onLog }: Readonly<{ onLog: () => void }>) {
  const [done, setDone] = useState(false)
  return <HabitRow habit={done ? LOGGED : EMPTY}
    actions={{ onLog: () => { setDone(true); onLog() }, onUnlog: () => setDone(false) }} />
}

const SAMPLES = 20
const TARGET_MS = 100

describe.each([false, true])('the Android press to the state change of a log, reduced motion %s', (reduced) => {
  it('changes the check in the same tick, with no dialog, no mascot and no awaited request, under 100 ms', () => {
    enableTestFlags('orbit_guided_flows')
    motion.reduced = reduced
    const durations: number[] = []
    for (let sample = 0; sample < SAMPLES; sample++) {
      const request = vi.fn()
      let tree!: TestRenderer.ReactTestRenderer
      void act(() => { tree = TestRenderer.create(<LoggedRow onLog={request} />) })
      const hosts = () => tree.root.findAll((node) => typeof node.type === 'string')
      const check = () => tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'habit-check')[0]!
      const press = hosts().find((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function' && node.findAll((child) => child === check()).length > 0)!
      expect(tree.root.findAllByType(HabitCheck)[0]!.props.status).toBe('empty')
      const started = performance.now()
      void act(() => { (press.props.onPress as () => void)() })
      const elapsed = performance.now() - started
      expect(request).toHaveBeenCalledOnce()
      expect(tree.root.findAllByType(HabitCheck)[0]!.props.status).toBe('done')
      expect(hosts().some((node) => node.props.accessibilityViewIsModal === true || node.props.role === 'dialog')).toBe(false)
      expect(hosts().some((node) => node.props['data-orbit-state'] !== undefined)).toBe(false)
      durations.push(elapsed)
      void act(() => tree.unmount())
    }
    const sorted = [...durations].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    expect(median, `median ${median.toFixed(2)} ms, slowest ${sorted.at(-1)!.toFixed(2)} ms`).toBeLessThan(TARGET_MS)
  })
})
