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

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const status = res.status

    // 401 - auto-logout (no toast)
    if (status === 401) {
      // Dynamic import to avoid circular deps
      const { useAuthStore } = await import('@/stores/auth-store')
      useAuthStore.getState().logout()
      throw new ApiError(status, 'Unauthorized', body)
    }

    // 403 - redirect to /upgrade (no toast)
    if (status === 403) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.location !== 'undefined') {
        globalThis.location.href = '/upgrade'
      }
      throw new ApiError(status, 'Forbidden', body)
    }

    // Extract backend error message
    const backendMsg = extractBackendError({ data: body })

    // Categorized error toast
    let title = 'Something went wrong'
    if (status === 400) title = 'Validation error'
    else if (status === 404) title = 'Not found'
    else if (status === 409) title = 'Conflict'
    else if (status === 429) title = 'Too many requests'
    else if (status >= 500) title = 'Server error'

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
