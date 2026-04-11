'use client'

import { toast } from 'sonner'
import { extractBackendError } from '@orbit/shared/utils'

/**
 * Centralized API fetch with error categorization matching Nuxt's api.ts plugin.
 *
 * Handles:
 * - 401: auto-logout (no toast)
 * - 403: redirect to /upgrade (no toast)
 * - 400/404/409/429/5xx: categorized error toast
 */

// ---------------------------------------------------------------------------
// i18n adapter -- set once at app startup via <ApiFetchI18nProvider />
// ---------------------------------------------------------------------------

type TranslateFn = (key: string) => string

let _translate: TranslateFn | null = null

/**
 * Register the app's translation function so apiFetch can produce
 * localised toast titles. Called once by ApiFetchI18nProvider.
 */
export function setApiFetchTranslate(t: TranslateFn) {
  _translate = t
}

function getToastTitle(status: number): string {
  if (!_translate) {
    // Fallback when i18n is not yet initialised
    if (status === 400) return 'Validation error'
    if (status === 404) return 'Not found'
    if (status === 409) return 'Conflict'
    if (status === 429) return 'Too many requests'
    if (status >= 500) return 'Server error'
    return 'Something went wrong'
  }

  if (status === 400) return _translate('toast.errors.validation')
  if (status === 404) return _translate('toast.errors.notFound')
  if (status === 409) return _translate('toast.errors.conflict')
  if (status === 429) return _translate('toast.errors.tooManyRequests')
  if (status >= 500) return _translate('toast.errors.server')
  return _translate('toast.errors.unknown')
}

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function getStatusError(
  status: number,
  body: unknown,
): Promise<ApiError | null> {
  if (status === 401) {
    // Dynamic import to avoid circular deps
    const { useAuthStore } = await import('@/stores/auth-store')
    useAuthStore.getState().logout()
    return new ApiError(status, 'Unauthorized', body)
  }

  if (status === 403) {
    if (globalThis.location !== undefined) {
      globalThis.location.href = '/upgrade'
    }
    return new ApiError(status, 'Forbidden', body)
  }

  return null
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const status = res.status

    const statusError = await getStatusError(status, body)
    if (statusError) {
      throw statusError
    }

    // Extract backend error message
    const backendMsg = extractBackendError({ data: body })

    // Categorized error toast
    const title = getToastTitle(status)

    toast.error(title, {
      description: backendMsg || undefined,
      duration: 5000,
    })

    throw new ApiError(status, backendMsg || title, body)
  }

  return res.json() as Promise<T>
}

/**
 * Convenience wrapper for GET requests matching the old fetchJson pattern.
 */
export function fetchJson<T>(url: string): Promise<T> {
  return apiFetch<T>(url)
}
