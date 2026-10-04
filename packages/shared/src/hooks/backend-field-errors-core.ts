import { extractBackendFieldErrors, getBackendFieldError } from '../utils/error-utils'

export interface BackendFormFailure<Field extends string> {
  error: unknown
  values: Record<Field, unknown>
}

export function deriveBackendFormErrors<Field extends string>(failure: BackendFormFailure<Field> | null, values: Record<Field, unknown>, names: Record<Field, string>): Partial<Record<Field, string>> {
  const fieldErrors: Partial<Record<Field, string>> = {}
  for (const field of Object.keys(names) as Field[]) {
    if (!failure || failure.values[field] !== values[field]) continue
    const message = getBackendFieldError(failure.error, names[field])
    if (message) fieldErrors[field] = message
  }
  return fieldErrors
}

export function firstBackendFormError<Field extends string>(error: unknown, names: Record<Field, string>): Field | undefined {
  return (Object.keys(names) as Field[]).find((name) => getBackendFieldError(error, names[name]))
}

export function allBackendFormErrorsMapped<Field extends string>(error: unknown, names: Record<Field, string>): boolean {
  const fields = Object.keys(extractBackendFieldErrors(error) ?? {})
  const mappedNames = Object.values<string>(names).map((name) => name.toLowerCase())
  return fields.length > 0 && fields.every((field) => mappedNames.includes(field.toLowerCase()))
}

export function resolveBackendFormFieldMessage(backendMessage: string | undefined, localKey: string | undefined, translate: (key: string) => string): string | undefined {
  return backendMessage ?? (localKey ? translate(localKey) : undefined)
}

export function backendFormFieldFocusRequest(field: string, focusedField: string | undefined, request: number): number | undefined {
  return focusedField === field ? request : undefined
}
