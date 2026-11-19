import { createGuidedFlowTracker, resetGuidedFlowCompleted, takeGuidedFlowCompleted, type GuidedFlowId, type GuidedFlowSink } from '../utils/guided-flow-events'
import type { StateHook } from './state-adapter'

const TYPING_PAUSE_MS = 1000

/** The React hooks of the platform, and its analytics sink. */
export interface QuestionFlowAdapters {
  useState: StateHook
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
  useRef: <Value>(initial: Value) => { current: Value }
  capture: GuidedFlowSink
}

/**
 * `useFlowAnnouncement` gives the text of the one polite live region of a flow. A line that changes inside a step is
 * announced after a one second pause, and a step change announces nothing, because the question carries the line.
 * `useGuidedFlowTracking` reports the step views and the abandon of one run of a flow. A completed flow reports
 * `guided_flow_completed` through `captureGuidedFlowCompleted`, and it is never reported as abandoned.
 */
export interface QuestionFlowHooks {
  useFlowAnnouncement: (line: string | null | undefined, stepKey: string) => string
  /** For a question that takes focus on arrival and carries its first line as its description: no line until the line changes, then each later line. */
  useLineAfterArrival: (line: string | null | undefined, carriedByQuestion: boolean) => string | null | undefined
  useGuidedFlowTracking: (flow: GuidedFlowId, stepKey: string, stepCount: number) => void
}

/** The hooks of the one-question flow shell: the announcement of its polite live region and the step analytics. */
export function createQuestionFlowHooks({ useState, useEffect, useRef, capture }: QuestionFlowAdapters): QuestionFlowHooks {
  function useFlowAnnouncement(line: string | null | undefined, stepKey: string): string {
    const [announced, setAnnounced] = useState('')
    const previousStep = useRef(stepKey)
    useEffect(() => {
      if (previousStep.current !== stepKey) {
        previousStep.current = stepKey
        setAnnounced('')
        return undefined
      }
      if (!line) return undefined
      const timer = setTimeout(() => setAnnounced(line), TYPING_PAUSE_MS)
      return () => clearTimeout(timer)
    }, [line, stepKey])
    return announced
  }

  function useLineAfterArrival(line: string | null | undefined, carriedByQuestion: boolean): string | null | undefined {
    const [arrival, setArrival] = useState<{ line: string | null | undefined } | null>(carriedByQuestion ? { line } : null)
    if (arrival && arrival.line !== line) setArrival(null)
    return arrival ? null : line
  }

  function useGuidedFlowTracking(flow: GuidedFlowId, stepKey: string, stepCount: number): void {
    const tracker = useRef<ReturnType<typeof createGuidedFlowTracker> | null>(null)
    useEffect(() => {
      resetGuidedFlowCompleted(flow)
      const current = createGuidedFlowTracker(flow, capture)
      tracker.current = current
      return () => {
        if (!takeGuidedFlowCompleted(flow)) current.abandoned()
        tracker.current = null
      }
    }, [flow])
    useEffect(() => {
      tracker.current?.viewed(stepKey, stepCount)
    }, [stepKey, stepCount])
  }

  return { useFlowAnnouncement, useLineAfterArrival, useGuidedFlowTracking }
}
