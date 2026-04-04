interface ErrorWithData {
  data?: {
    error?: string
    code?: string
    data?: {
      error?: string
      errors?: Record<string, string[]>
    }
    errors?: Record<string, string[]>
  }
}

function isErrorWithData(err: unknown): err is ErrorWithData {
  return (
    err !== null &&
    typeof err === 'object' &&
    'data' in err
  )
}

export function getErrorMessage(err: unknown, fallback: string): string {
  if (isErrorWithData(err)) {
    if (err.data?.error) return err.data.error
  }
  return fallback
}

export function extractBackendError(err: unknown): string | undefined {
  if (!isErrorWithData(err)) return undefined

  // Check for simple error string (nested or direct)
  const backendError = err.data?.data?.error ?? err.data?.error
  if (backendError && typeof backendError === 'string') return backendError

  // Check for FluentValidation errors object { Field: [messages] }
  const validationErrors = err.data?.data?.errors ?? err.data?.errors
  if (validationErrors && typeof validationErrors === 'object') {
    const firstField = Object.values(validationErrors)[0]
    if (Array.isArray(firstField) && firstField.length > 0) return firstField[0]
  }

  return undefined
}
