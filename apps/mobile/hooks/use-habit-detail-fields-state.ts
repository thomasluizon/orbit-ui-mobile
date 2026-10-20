import { useState } from 'react'
import { createUseHabitDetailFieldsState } from '@orbit/shared/hooks'

export const useHabitDetailFieldsState = createUseHabitDetailFieldsState(useState)
