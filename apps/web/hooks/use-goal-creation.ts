'use client'

import { useEffect, useRef } from 'react'
import { createUseGoalCreation } from '@orbit/shared/hooks'
import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useCreateGoal } from '@/hooks/use-goals'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'

export const useGoalCreation = createUseGoalCreation<HTMLInputElement>({
  useState: useAccountScopedState, useRef, useEffect, useDismissGuard, useCreateGoal, useBackendFieldErrors, getAccountGeneration,
})
