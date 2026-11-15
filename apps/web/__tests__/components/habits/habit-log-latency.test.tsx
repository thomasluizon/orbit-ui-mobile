import { useState } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { HabitRow } from '@/components/habits/habit-row'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** The row owner flips the state in the press handler, as the optimistic log does, so the measure is the press to the painted state. */
function LoggedRow({ onLog }: Readonly<{ onLog: () => void }>) {
  const [done, setDone] = useState(false)
  return <HabitRow habit={createMockHabit({ id: 'habit-1', title: 'Read' })} state={done ? 'done' : 'empty'}
    actions={{ onLog: () => { setDone(true); onLog() }, onUnlog: () => setDone(false) }} />
}

const SAMPLES = 20
const TARGET_MS = 100

describe.each([false, true])('the press to the state change of a log, reduced motion %s', (reduced) => {
  it('changes the check in the same tick, with no dialog, no mascot and no awaited request, under 100 ms', () => {
    enableTestFlags('orbit_guided_flows')
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    const durations: number[] = []
    for (let sample = 0; sample < SAMPLES; sample++) {
      const request = vi.fn()
      const view = render(<LoggedRow onLog={request} />)
      const check = () => document.querySelector('[data-habit-check]')!
      const press = check().closest('button')!
      const started = performance.now()
      act(() => { fireEvent.click(press) })
      const elapsed = performance.now() - started
      expect(check()).toHaveAttribute('data-status', 'done')
      expect(request).toHaveBeenCalledOnce()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.querySelector('[data-orbit-state]')).toBeNull()
      durations.push(elapsed)
      view.unmount()
    }
    const sorted = [...durations].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    expect(median, `median ${median.toFixed(2)} ms, slowest ${sorted.at(-1)!.toFixed(2)} ms`).toBeLessThan(TARGET_MS)
  })
})
