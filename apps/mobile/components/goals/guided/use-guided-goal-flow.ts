import { useMemo, useState } from 'react'
import { createUseGuidedGoalFlow } from '@orbit/shared/hooks'

export const useGuidedGoalFlow = createUseGuidedGoalFlow({ useState, useMemo })
