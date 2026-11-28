import { expect, it, vi } from 'vitest'
import { createUseHabitBlockLog } from '../hooks/habit-block-log-core'
import { createHookStateHarness } from '../test-support/hook-state'

const input = { habitId: 'habit-a', date: '2027-01-15', intent: 'log' as const }

function mountHabitBlockLog(mutate: () => Promise<unknown>) {
  const harness = createHookStateHarness()
  const useHabitBlockLog = createUseHabitBlockLog({ useState: harness.useState, useRef: (initial) => harness.useState(() => ({ current: initial }))[0] })
  return () => harness.render(() => useHabitBlockLog(mutate))
}

it('holds one write for a habit, marks a failure and clears it on the next press', async () => {
  let refuse!: (error: Error) => void
  const mutate = vi.fn<() => Promise<unknown>>()
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { refuse = reject }))
    .mockResolvedValue(undefined)
  const render = mountHabitBlockLog(mutate)

  const first = render().log(input)
  await render().log(input)
  expect(mutate).toHaveBeenCalledExactlyOnceWith(input)
  expect([...render().pendingIds]).toEqual(['habit-a'])

  refuse(new Error('refused'))
  await first
  expect([...render().failedIds]).toEqual(['habit-a'])
  expect([...render().pendingIds]).toEqual([])

  await render().log(input)
  expect([...render().failedIds]).toEqual([])
  expect(mutate).toHaveBeenCalledTimes(2)
})
