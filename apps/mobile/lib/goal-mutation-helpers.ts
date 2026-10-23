import { API } from '@orbit/shared/api'
import type { UpdateGoalRequest, UpdateGoalProgressRequest, UpdateGoalStatusRequest } from '@orbit/shared/types/goal'
import { apiClient } from './api-client'
import { buildQueuedMutation, createQueuedAck, queueOrExecute } from './offline-mutations'

export {
  findLinkedHabits,
  invalidateGoalQueries,
  restoreGoalLists,
} from '@orbit/shared/query'
export {
  buildTempGoal,
  nextGoalPosition,
  sortGoalsByPosition,
  updateGoalDetailItem,
  updateGoalProgressDetail,
  updateGoalProgressItem,
  updateGoalStatusDetail,
  updateGoalStatusItem,
} from '@orbit/shared/utils'

export async function writeQueuedGoalChange(type: 'updateGoal' | 'updateGoalProgress' | 'updateGoalStatus', goalId: string, request: UpdateGoalRequest | UpdateGoalProgressRequest | UpdateGoalStatusRequest) {
  const endpoints = { updateGoal: API.goals.update, updateGoalProgress: API.goals.progress, updateGoalStatus: API.goals.status }
  const endpoint = endpoints[type](goalId)
  const mutation = buildQueuedMutation({ type, scope: 'goals', endpoint, method: 'PUT', payload: request, entityType: 'goal', targetEntityId: goalId })
  return queueOrExecute({
    mutation,
    execute: () => apiClient<void>(endpoint, { method: 'PUT', body: JSON.stringify(request) }),
    queuedResult: createQueuedAck(mutation.id),
  })
}
