import type {
  AgentOperationResult,
  AgentPolicyDenial,
  PendingAgentOperation,
} from '../types/ai'
import type {
  ActionResult,
  ChatMessage,
  GoalListCard,
  HabitListCard,
  SuggestedSubHabit,
} from '../types/chat'
import type { BulkCreateResponse } from '../types/habit'

export const breakdownSubHabits: SuggestedSubHabit[] = [
  { title: 'Dishes', description: '', frequencyUnit: 'Day' },
  { title: 'Laundry', description: '', frequencyUnit: 'Week' },
]

export const habitListCardFixture: HabitListCard = {
  scope: 'today',
  items: ['Water', 'Walk', 'Read', 'Stretch'].map((title, index) => ({
    id: `habit-${index + 1}`,
    title,
    depth: 0,
    isBadHabit: false,
    status: 'today',
  })),
}

export const goalListCardFixture: GoalListCard = {
  items: [
    {
      id: 'goal-1',
      title: 'Run 10 km',
      current: 4,
      target: 10,
      unit: 'km',
    },
  ],
}

export const agentPolicyDenialFixture: AgentPolicyDenial = {
  operationId: 'policy-1',
  sourceName: 'DeleteAccount',
  riskClass: 'High',
  confirmationRequirement: 'StepUp',
  reason: 'Profile only',
}

export function makeActionResult(
  overrides: Partial<ActionResult> = {},
): ActionResult {
  return {
    type: 'LogHabit',
    status: 'Success',
    entityId: 'habit-1',
    entityName: 'Meditate',
    ...overrides,
  }
}

export function makePendingAgentOperation(
  overrides: Partial<PendingAgentOperation> = {},
): PendingAgentOperation {
  return {
    id: 'pending-1',
    capabilityId: 'habits.delete',
    displayName: 'DeleteHabit',
    summary: 'raw server summary',
    riskClass: 'Destructive',
    confirmationRequirement: 'FreshConfirmation',
    expiresAtUtc: '2026-09-02T12:00:00Z',
    ...overrides,
  }
}

export function makeAgentOperationResult(
  status: AgentOperationResult['status'],
  index: number,
): AgentOperationResult {
  return {
    operationId: `operation-${index}`,
    sourceName: 'CreateHabit',
    riskClass: status === 'Failed' ? 'Destructive' : 'Low',
    confirmationRequirement: 'None',
    status,
    targetName: `Habit ${index}`,
  }
}

export function makeHeldHabitMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'held-habit-message',
    role: 'ai',
    content: 'Review the habit.',
    timestamp: new Date('2026-09-29T12:00:00Z'),
    pendingOperations: [makePendingAgentOperation({
      id: 'held-habit',
      capabilityId: 'habits.write',
      displayName: 'CreateHabit',
      riskClass: 'Low',
      confirmationRequirement: 'None',
      previewFingerprint: 'habit-preview',
      changeTargetCount: 1,
      items: [{
        itemId: 'new-habit',
        entityId: null,
        entityName: 'Beber água',
        stateFingerprint: 'habit-state',
        fields: [{ entityId: 'new-habit', entityName: 'Beber água', field: 'title', oldValue: null, newValue: 'Beber água', valueType: 'string' }],
      }],
    })],
    ...overrides,
  }
}

export function makeHeldGoalMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const message = makeHeldHabitMessage()
  return {
    ...message,
    pendingOperations: [makePendingAgentOperation({
      id: 'held-goal',
      capabilityId: 'goals.write',
      displayName: 'CreateGoal',
      riskClass: 'Low',
      confirmationRequirement: 'None',
      previewFingerprint: 'goal-preview',
      changeTargetCount: 1,
      items: [{
        itemId: 'new-goal', entityId: null, entityName: 'Run 10 km', stateFingerprint: 'goal-state',
        fields: [{ entityId: 'new-goal', entityName: 'Run 10 km', field: 'title', oldValue: null, newValue: 'Run 10 km', valueType: 'string' }],
      }],
    })],
    ...overrides,
  }
}

export function makeClarificationPreviewMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return makeHeldHabitMessage({
    pendingOperations: [],
    actions: [makeActionResult({
      type: 'CreateHabit', status: 'NeedsClarification', entityName: 'Beber água',
      clarificationRequest: {
        question: 'habits.clarification.questionFallback',
        operationId: '00000000-0000-0000-0000-000000000001',
        missingArgumentKey: 'frequency_unit',
        quickActions: [{ label: 'habits.clarification.quickAction.daily', value: 'daily' }],
      },
    })],
    ...overrides,
  })
}

export function makeBulkCreateResponse(
  statuses: Array<'Success' | 'Failed'>,
): BulkCreateResponse {
  return {
    results: statuses.map((status, index) => ({
      index,
      status,
      habitId: status === 'Success' ? `habit-${index}` : null,
      title: breakdownSubHabits[index]?.title ?? null,
      error: status === 'Failed' ? 'failed' : null,
      field: null,
    })),
  }
}
