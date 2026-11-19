/** The ids of the one-question flows. Each consumer of the flow shell passes its own. */
export const GUIDED_FLOW_IDS = [
  'habit_create',
  'habit_edit',
  'goal_create',
  'goal_edit',
  'onboarding',
  'sign_in',
  'fresh_start',
  'delete_account',
  'support_request',
  'api_key_create',
] as const

export type GuidedFlowId = (typeof GUIDED_FLOW_IDS)[number]

/** The three events of a flow. No property holds typed text: a step is an id, a count is a number. */
export type GuidedFlowEvent =
  | { readonly name: 'guided_flow_step_viewed'; readonly properties: { flow: GuidedFlowId; step: string; step_count: number } }
  | { readonly name: 'guided_flow_completed'; readonly properties: { flow: GuidedFlowId; step_count: number; used_ai_read: boolean } }
  | { readonly name: 'guided_flow_abandoned'; readonly properties: { flow: GuidedFlowId; step: string } }

export type GuidedFlowSink = (event: GuidedFlowEvent) => void

export interface GuidedFlowTracker {
  viewed: (step: string, stepCount: number) => void
  /** Reports the flow as left. It sends once, and nothing before the first step shows. */
  abandoned: () => void
}

/** One tracker for one run of a flow. A step is reported once, so a rerender never repeats it. */
export function createGuidedFlowTracker(flow: GuidedFlowId, sink: GuidedFlowSink): GuidedFlowTracker {
  let lastStep: string | null = null
  let finished = false
  return {
    viewed(step, stepCount) {
      if (finished || step === lastStep) return
      lastStep = step
      sink({ name: 'guided_flow_step_viewed', properties: { flow, step, step_count: stepCount } })
    },
    abandoned() {
      if (finished || lastStep === null) return
      finished = true
      sink({ name: 'guided_flow_abandoned', properties: { flow, step: lastStep } })
    },
  }
}

const completedFlows = new Set<GuidedFlowId>()

/** The shell and a consumer share one fact: this flow completed. The shell reads it on unmount, so a flow that ends in its result dialog is never reported as abandoned. */
export function markGuidedFlowCompleted(flow: GuidedFlowId): void {
  completedFlows.add(flow)
}

/** Reads and clears the fact. The shell calls it once on unmount. */
export function takeGuidedFlowCompleted(flow: GuidedFlowId): boolean {
  return completedFlows.delete(flow)
}

/** Clears a stale fact when a flow starts again. */
export function resetGuidedFlowCompleted(flow: GuidedFlowId): void {
  completedFlows.delete(flow)
}
