'use server'

import { getAuthHeaders } from '@/lib/auth-api'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

async function authFetch(path: string, init: RequestInit) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => null)
    throw new Error(error?.error ?? error?.message ?? `Failed with status ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

/**
 * Request account deletion. Sends a confirmation code to the user's email.
 */
export async function requestDeletion(): Promise<void> {
  await authFetch('/api/auth/request-deletion', {
    method: 'POST',
  })
}

/**
 * Confirm account deletion with the code received via email.
 */
export async function confirmDeletion(code: string): Promise<void> {
  await authFetch('/api/auth/confirm-deletion', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}
