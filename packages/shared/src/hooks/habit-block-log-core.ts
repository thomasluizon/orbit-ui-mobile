import type { StateHook } from './state-adapter'

type HabitLogInput = { habitId: string; date: string; intent: 'log' | 'unlog' }

interface HabitBlockLogState {
  pendingIds: ReadonlySet<string>
  failedIds: ReadonlySet<string>
  log: (input: HabitLogInput) => Promise<void>
}

export function createUseHabitBlockLog({ useState, useRef }: {
  useState: StateHook
  useRef: <Value>(initial: Value) => { current: Value }
}) {
  return function useHabitBlockLog(mutate: (input: HabitLogInput) => Promise<unknown>): HabitBlockLogState {
    const inFlight = useRef(new Set<string>())
    const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
    const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set())
    const log = async (input: HabitLogInput) => {
      const id = input.habitId
      if (inFlight.current.has(id)) return
      inFlight.current.add(id)
      setPendingIds(new Set(inFlight.current))
      setFailedIds(current => new Set([...current].filter(value => value !== id)))
      try {
        await mutate(input)
      } catch {
        setFailedIds(current => new Set([...current, id]))
      } finally {
        inFlight.current.delete(id)
        setPendingIds(new Set(inFlight.current))
      }
    }
    return { pendingIds, failedIds, log }
  }
}
