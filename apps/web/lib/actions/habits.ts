'use client'

import * as serverActions from '@/app/actions/habits'
import { bindAccountServerAction } from '@/lib/client-action'

export const createHabit = bindAccountServerAction(serverActions.createHabit)
export const suggestHabitSetup = bindAccountServerAction(serverActions.suggestHabitSetup)
export const updateHabit = bindAccountServerAction(serverActions.updateHabit)
export const deleteHabit = bindAccountServerAction(serverActions.deleteHabit)
export const restoreHabit = bindAccountServerAction(serverActions.restoreHabit)
export const logHabit = bindAccountServerAction(serverActions.logHabit)
export const skipHabit = bindAccountServerAction(serverActions.skipHabit)
export const bulkCreateHabits = bindAccountServerAction(serverActions.bulkCreateHabits)
export const bulkDeleteHabits = bindAccountServerAction(serverActions.bulkDeleteHabits)
export const bulkLogHabits = bindAccountServerAction(serverActions.bulkLogHabits)
export const bulkSkipHabits = bindAccountServerAction(serverActions.bulkSkipHabits)
export const reorderHabits = bindAccountServerAction(serverActions.reorderHabits)
export const createSubHabit = bindAccountServerAction(serverActions.createSubHabit)
export const moveHabitParent = bindAccountServerAction(serverActions.moveHabitParent)
export const duplicateHabit = bindAccountServerAction(serverActions.duplicateHabit)
export const updateChecklist = bindAccountServerAction(serverActions.updateChecklist)
export const linkGoalsToHabit = bindAccountServerAction(serverActions.linkGoalsToHabit)
