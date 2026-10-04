'use client'

import { useAccountScopedState } from './use-session-reset'
import { allBackendFormErrorsMapped, deriveBackendFormErrors, firstBackendFormError, type BackendFormFailure } from '@orbit/shared/hooks'

export function useBackendFieldErrors<Field extends string>(values: Record<Field, unknown>, names: Record<Field, string>) {
  const [failure, setFailure] = useAccountScopedState<BackendFormFailure<Field> | null>(null)
  function reportBackendErrors(error: unknown): Field | undefined {
    const field = firstBackendFormError(error, names)
    if (field) setFailure({ error, values: { ...values } })
    return allBackendFormErrorsMapped(error, names) ? field : undefined
  }
  return { fieldErrors: deriveBackendFormErrors(failure, values, names), reportBackendErrors, clearBackendErrors: () => setFailure(null) }
}

export function useBackendErrorDisclosure(error: string | undefined, reveal: () => void) {
  const [previousError, setPreviousError] = useAccountScopedState<string | undefined>(undefined)
  if (previousError !== error) {
    setPreviousError(error)
    if (error) reveal()
  }
}
