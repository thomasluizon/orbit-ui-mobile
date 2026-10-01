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

export const pendingWriteSummaryCases = [
  { name: 'abandon goal', field: 'status', newValue: 'Abandoned', proposedValue: 'Abandoned', oldValue: 'Active', capabilityId: 'goals.write', english: 'Mark abandoned', portuguese: 'Marcar abandonada' },
  { name: 'complete goal', field: 'status', newValue: 'Completed', proposedValue: 'Completed', oldValue: 'Active', capabilityId: 'goals.write', english: 'Complete goal', portuguese: 'Concluir meta' },
  { name: 'reopen goal', field: 'status', newValue: 'Active', proposedValue: 'Active', oldValue: 'Completed', capabilityId: 'goals.write', english: 'Reopen goal', portuguese: 'Reabrir meta' },
  { name: 'set goal progress', field: 'current_value', newValue: '100', proposedValue: 100, oldValue: '20', capabilityId: 'goals.write', english: 'Set progress to 100', portuguese: 'Definir progresso: 100' },
  { name: 'reset goal progress', field: 'current_value', newValue: '0', proposedValue: 0, oldValue: '20', capabilityId: 'goals.write', english: 'Set progress to 0', portuguese: 'Definir progresso: 0' },
  { name: 'replace tag names', field: 'tag_names', newValue: '["Reading","Evening"]', proposedValue: ['Reading', 'Evening'], oldValue: 'Morning', capabilityId: 'tags.write', english: 'Replace all tags with: Reading, Evening', portuguese: 'Substituir todas as tags por: Reading, Evening' },
  { name: 'remove all tags', field: 'tag_ids', newValue: '[]', proposedValue: [], oldValue: 'Morning', capabilityId: 'tags.write', english: 'Remove all tags', portuguese: 'Remover todas as tags' },
  { name: 'replace tag ids', field: 'tag_ids', newValue: '["00000000-0000-4000-8000-000000000002"]', proposedValue: ['00000000-0000-4000-8000-000000000002'], oldValue: 'Morning', capabilityId: 'tags.write', english: 'Replace all tags with 1 selected tag', portuguese: 'Substituir todas as tags por 1 tag selecionada' },
] as const

export function makePendingWriteSummaryOperation(scenario: typeof pendingWriteSummaryCases[number]): PendingAgentOperation {
  const entityId = '00000000-0000-4000-8000-000000000001'
  const entityName = 'Read'
  const fields = [
    { entityId, entityName, field: scenario.capabilityId === 'goals.write' ? 'goal_id' : 'habit_id', oldValue: null, newValue: entityId, proposedValue: entityId, valueType: 'text', isEditable: false },
    { entityId, entityName, field: scenario.field, oldValue: scenario.oldValue, newValue: scenario.newValue, proposedValue: scenario.proposedValue, valueType: typeof scenario.proposedValue === 'number' ? 'number' : 'text', isEditable: scenario.field !== 'tag_ids' },
  ]
  return makePendingAgentOperation({ capabilityId: scenario.capabilityId, riskClass: 'Low', confirmationRequirement: 'None',
    changes: fields, items: [{ itemId: entityId, entityId, entityName, fields, stateFingerprint: 'target-state' }], changeTargetCount: 1 })
}

export const partialScheduleSummaryCases = [
  { name: 'retain flexible tracking', fields: [
    { field: 'frequency_unit', oldValue: 'Week', newValue: 'Week', proposedValue: 'Week' },
    { field: 'frequency_quantity', oldValue: '2', newValue: '3', proposedValue: 3 },
  ], english: 'Use weeks for repetition · Set the repeat count to 3', portuguese: 'Repetir em semanas · Definir quantidade de repetições: 3' },
  { name: 'retain selected weekdays', fields: [
    { field: 'frequency_unit', oldValue: 'Week', newValue: 'Day', proposedValue: 'Day' },
    { field: 'frequency_quantity', oldValue: '1', newValue: '1', proposedValue: 1 },
  ], english: 'Use days for repetition · Set the repeat count to 1', portuguese: 'Repetir em dias · Definir quantidade de repetições: 1' },
] as const

export function makePartialScheduleSummaryOperation(scenario: typeof partialScheduleSummaryCases[number]): PendingAgentOperation {
  const entityId = '00000000-0000-4000-8000-000000000001'
  const entityName = 'Read'
  const fields = [
    { entityId, entityName, field: 'habit_id', oldValue: null, newValue: entityId, proposedValue: entityId, valueType: 'text', isEditable: false },
    ...scenario.fields.map((field) => ({ ...field, entityId, entityName, valueType: typeof field.proposedValue === 'number' ? 'number' : 'text', isEditable: true })),
  ]
  return makePendingAgentOperation({ capabilityId: 'habits.write', actionKey: 'updateHabit', riskClass: 'Low', confirmationRequirement: 'None',
    changes: fields, items: [{ itemId: entityId, entityId, entityName, fields, stateFingerprint: 'target-state' }], changeTargetCount: 1 })
}
