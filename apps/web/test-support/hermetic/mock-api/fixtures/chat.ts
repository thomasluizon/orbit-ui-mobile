import { makeAgentOperationResult, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { agentExecuteOperationResponseSchema } from '@orbit/shared/types/ai'

export const clarificationResolveFixture = agentExecuteOperationResponseSchema.parse({
  operation: makeAgentOperationResult('PendingConfirmation', 1),
  pendingOperation: {
    ...makeHeldHabitMessage().pendingOperations![0]!,
    actionKey: 'createHabit',
    expiresAtUtc: '2099-01-01T00:00:00Z',
  },
})
