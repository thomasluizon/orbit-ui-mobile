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

export async function createTag(
  name: string,
  color: string,
): Promise<{ id: string }> {
  return authFetch('/api/tags', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  })
}

export async function updateTag(
  tagId: string,
  name: string,
  color: string,
): Promise<void> {
  await authFetch(`/api/tags/${tagId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, color }),
  })
}

export async function deleteTag(tagId: string): Promise<void> {
  await authFetch(`/api/tags/${tagId}`, {
    method: 'DELETE',
  })
}

export async function assignTags(
  habitId: string,
  tagIds: string[],
): Promise<void> {
  await authFetch(`/api/tags/${habitId}/assign`, {
    method: 'PUT',
    body: JSON.stringify({ tagIds }),
  })
}
