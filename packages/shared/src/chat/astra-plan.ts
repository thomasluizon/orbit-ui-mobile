import type { AstraPlan, AstraPlanStep } from '../types/astra-plan'
import type { ChatMessage } from '../types/chat'
import type { ChatStoreState } from '../stores/chat-store'
import type { AgentExecuteOperationResponse } from '../types/ai'

export function planStepStatus(status: string): 'pending' | 'running' | 'done' | 'failed' | 'skipped' {
  switch (status) {
    case 'running': case 'done': case 'failed': case 'skipped': return status
    default: return 'pending'
  }
}

export class PlanAnnouncementTracker {
  private readonly announced = new Set<string>()
  private readonly observedPlans = new Set<string>()

  next(messages: readonly ChatMessage[], runningLabel: string): string | null {
    const lines: string[] = []
    for (const message of messages) {
      if (!message.plan) continue
      const restoring = message.restored && !this.observedPlans.has(message.plan.id)
      this.observedPlans.add(message.plan.id)
      for (const step of message.plan.steps) {
        const identity = `${message.plan.id}:${step.id}`
        if (step.status !== 'running' || this.announced.has(identity)) continue
        this.announced.add(identity)
        if (!restoring) lines.push(`${step.text}: ${runningLabel}`)
      }
    }
    return lines.length ? lines.join('. ') : null
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

export function unplannedToolSteps(plan: AstraPlan | null | undefined, steps: ChatMessage['toolSteps']): NonNullable<ChatMessage['toolSteps']> {
  return plan ? [] : steps ?? []
}

export function applyChatPlan(chat: PlanChat, plan: AstraPlan | null | undefined): void {
  if (!plan) return
  for (const message of chat.messages) {
    if (message.plan?.id === plan.id) chat.transitionMessage(message.id, current => ({ ...current, plan }))
  }
}

export function reconcileChatPlanApproval(
  chat: PlanChat, pendingOperationId: string, status: 'pending' | 'running' | 'done' | 'failed' | 'skipped',
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

export function reconcileChatPlanExecution(chat: PlanChat, pendingOperationId: string, response: AgentExecuteOperationResponse): void {
  const status = response.operation.status === 'Succeeded' ? 'done'
    : response.operation.status === 'PendingConfirmation' ? 'pending' : 'failed'
  reconcileChatPlanApproval(chat, pendingOperationId, status, response.plan)
}
