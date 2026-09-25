'use client'

import * as serverActions from '@/app/actions/goals'
import { bindAccountServerAction } from '@/lib/client-action'

export const createGoal = bindAccountServerAction(serverActions.createGoal)
export const updateGoal = bindAccountServerAction(serverActions.updateGoal)
export const deleteGoal = bindAccountServerAction(serverActions.deleteGoal)
export const restoreGoal = bindAccountServerAction(serverActions.restoreGoal)
export const updateGoalProgress = bindAccountServerAction(serverActions.updateGoalProgress)
export const updateGoalStatus = bindAccountServerAction(serverActions.updateGoalStatus)
export const reorderGoals = bindAccountServerAction(serverActions.reorderGoals)
export const linkHabitsToGoal = bindAccountServerAction(serverActions.linkHabitsToGoal)
