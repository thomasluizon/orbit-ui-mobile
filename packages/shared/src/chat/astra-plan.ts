import type { AstraPlan, AstraPlanStep } from '../types/astra-plan'
import type { ChatMessage } from '../types/chat'
import type { ChatStoreState } from '../stores/chat-store'

export function planStepStatus(status: string) {
  switch (status) {
    case 'running': case 'done': case 'failed': case 'skipped': return status
    default: return 'pending'
  }
}

export function planStepStatusKey(status: string): string {
  switch (planStepStatus(status)) {
    case 'running': return 'blockFrame.status.acting'
    case 'done': return 'blockFrame.status.done'
    case 'failed': return 'blockFrame.status.failed'
    case 'skipped': return 'habits.statusDot.skip'
    case 'pending': return 'chat.habitList.pending'
  }
}

export function updateMessagePlanStep(message: ChatMessage, planId: string, step: AstraPlanStep): ChatMessage {
  if (message.plan?.id !== planId || !message.plan.steps.some(current => current.id === step.id)) return message
  return { ...message, plan: { ...message.plan, steps: message.plan.steps.map(current => current.id === step.id ? step : current) } }
}

type PlanChat = Pick<ChatStoreState, 'messages' | 'transitionMessage'>

export function applyChatPlan(chat: PlanChat, plan: AstraPlan | null | undefined): void {
  if (!plan) return
  for (const message of chat.messages) {
    if (message.plan?.id === plan.id) chat.transitionMessage(message.id, current => ({ ...current, plan }))
  }
}

export function reconcileChatPlanApproval(
  chat: PlanChat, pendingOperationId: string, status: 'running' | 'done' | 'failed' | 'skipped',
  plan: AstraPlan | null | undefined,
): void {
  if (plan) { applyChatPlan(chat, plan); return }
  for (const message of chat.messages) {
    if (!message.plan?.steps.some(step => step.phase === 'approval' && step.pendingOperationId === pendingOperationId)) continue
    chat.transitionMessage(message.id, current => ({ ...current, plan: current.plan ? {
      ...current.plan,
      steps: current.plan.steps.map(step => step.phase === 'approval' && step.pendingOperationId === pendingOperationId ? { ...step, status } : step),
    } : current.plan }))
  }
}
