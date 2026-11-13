'use client'

import { useEffect, useRef } from 'react'
import { createGuidedFlowTracker, resetGuidedFlowCompleted, takeGuidedFlowCompleted, type GuidedFlowId } from '@orbit/shared/utils'
import { captureGuidedFlowEvent } from '@/lib/posthog'

/** Reports the step views and the abandon of one run of a flow. A completed flow reports `guided_flow_completed` through `captureGuidedFlowCompleted`, and it is never reported as abandoned. */
export function useGuidedFlowTracking(flow: GuidedFlowId, stepKey: string, stepCount: number): void {
  const tracker = useRef<ReturnType<typeof createGuidedFlowTracker> | null>(null)
  useEffect(() => {
    resetGuidedFlowCompleted(flow)
    const current = createGuidedFlowTracker(flow, captureGuidedFlowEvent)
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
