'use client'

import * as serverActions from '@/app/actions/goals'
import { bindServerAction } from '@/lib/client-action'

export const createGoal = bindServerAction(serverActions.createGoal)
export const updateGoal = bindServerAction(serverActions.updateGoal)
export const deleteGoal = bindServerAction(serverActions.deleteGoal)
export const restoreGoal = bindServerAction(serverActions.restoreGoal)
export const updateGoalProgress = bindServerAction(serverActions.updateGoalProgress)
export const updateGoalStatus = bindServerAction(serverActions.updateGoalStatus)
export const reorderGoals = bindServerAction(serverActions.reorderGoals)
export const linkHabitsToGoal = bindServerAction(serverActions.linkHabitsToGoal)
