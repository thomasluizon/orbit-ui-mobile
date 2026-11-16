import type { StateHook } from './state-adapter'

/** `leave` when the form closes after the request succeeds; the hold then lasts until `release`. */
export type SubmitOutcome = 'leave' | 'stay'

export interface SubmitHoldAdapters {
  useState: StateHook
  useRef: <Value>(initial: Value) => { current: Value }
}

/** Every function keeps its identity across renders. */
export interface SubmitHold {
  /** The save or create action shows its waiting face: from the request start until the form leaves or the request fails. */
  waiting: boolean
  /** A submission runs, from the press. Read it in event handlers only. */
  isRunning: () => boolean
  /** Runs one submission at a time. `startRequest` starts the waiting face just before the request. */
  run: (submit: (startRequest: () => void) => Promise<SubmitOutcome>) => Promise<void>
  /** Ends the hold. The close path calls it once the form has left. */
  release: () => void
}

export function createUseSubmitHold({ useState, useRef }: SubmitHoldAdapters): () => SubmitHold {
  return function useSubmitHold() {
    const [waiting, setWaiting] = useState(false)
    const running = useRef(false)
    const [controls] = useState(() => {
      const release = () => {
        running.current = false
        setWaiting(false)
      }
      const run = async (submit: (startRequest: () => void) => Promise<SubmitOutcome>) => {
        if (running.current) return
        running.current = true
        let outcome: SubmitOutcome = 'stay'
        try {
          outcome = await submit(() => setWaiting(true))
        } finally {
          if (outcome === 'stay') release()
        }
      }
      return { isRunning: () => running.current, run, release }
    })
    return { waiting, ...controls }
  }
}
