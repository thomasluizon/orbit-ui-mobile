import { useAccountScopedState } from './use-session-reset'
import { allBackendFormErrorsMapped, deriveBackendFormErrors, firstBackendFormError, type BackendFormFailure } from '@orbit/shared/hooks'

export function useBackendFieldErrors<Field extends string>(values: Record<Field, unknown>, names: Record<Field, string>) {
  const [failure, setFailure] = useAccountScopedState<BackendFormFailure<Field> | null>(null)
  const [focusRequest, setFocusRequest] = useAccountScopedState(0)
  function reportBackendErrors(error: unknown): Field | undefined {
    const field = firstBackendFormError(error, names)
    if (field) { setFailure({ error, values: { ...values } }); setFocusRequest((request) => request + 1) }
    return allBackendFormErrorsMapped(error, names) ? field : undefined
  }
  return { focusRequest, fieldErrors: deriveBackendFormErrors(failure, values, names), reportBackendErrors, clearBackendErrors: () => setFailure(null) }
}

export function useBackendErrorDisclosure(error: string | undefined, request: number, reveal: () => void) {
  const [previousError, setPreviousError] = useAccountScopedState<string | undefined>(undefined)
  const [previousRequest, setPreviousRequest] = useAccountScopedState(0)
  if (previousError !== error || previousRequest !== request) {
    setPreviousRequest(request)
    setPreviousError(error)
    if (error) reveal()
  }
}
