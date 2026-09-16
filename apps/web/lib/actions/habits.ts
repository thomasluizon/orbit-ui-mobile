'use client'

import * as serverActions from '@/app/actions/habits'
import { bindServerAction } from '@/lib/client-action'

export const createHabit = bindServerAction(serverActions.createHabit)
export const suggestHabitSetup = bindServerAction(serverActions.suggestHabitSetup)
export const updateHabit = bindServerAction(serverActions.updateHabit)
export const deleteHabit = bindServerAction(serverActions.deleteHabit)
export const restoreHabit = bindServerAction(serverActions.restoreHabit)
export const logHabit = bindServerAction(serverActions.logHabit)
export const skipHabit = bindServerAction(serverActions.skipHabit)
export const bulkCreateHabits = bindServerAction(serverActions.bulkCreateHabits)
export const bulkDeleteHabits = bindServerAction(serverActions.bulkDeleteHabits)
export const bulkLogHabits = bindServerAction(serverActions.bulkLogHabits)
export const bulkSkipHabits = bindServerAction(serverActions.bulkSkipHabits)
export const reorderHabits = bindServerAction(serverActions.reorderHabits)
export const createSubHabit = bindServerAction(serverActions.createSubHabit)
export const moveHabitParent = bindServerAction(serverActions.moveHabitParent)
export const duplicateHabit = bindServerAction(serverActions.duplicateHabit)
export const updateChecklist = bindServerAction(serverActions.updateChecklist)
export const linkGoalsToHabit = bindServerAction(serverActions.linkGoalsToHabit)
