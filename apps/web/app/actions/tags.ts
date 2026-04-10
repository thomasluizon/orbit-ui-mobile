'use server'

import { serverAuthFetch } from '@/lib/server-fetch'

export async function getTags(): Promise<Array<{ id: string; name: string; color: string }>> {
  return serverAuthFetch('/api/tags', { method: 'GET' })
}

export async function createTag(
  name: string,
  color: string,
): Promise<{ id: string }> {
  return serverAuthFetch('/api/tags', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  })
}

export async function updateTag(
  tagId: string,
  name: string,
  color: string,
): Promise<void> {
  await serverAuthFetch(`/api/tags/${tagId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, color }),
  })
}

export async function deleteTag(tagId: string): Promise<void> {
  await serverAuthFetch(`/api/tags/${tagId}`, {
    method: 'DELETE',
  })
}

export async function assignTags(
  habitId: string,
  tagIds: string[],
): Promise<void> {
  await serverAuthFetch(`/api/tags/${habitId}/assign`, {
    method: 'PUT',
    body: JSON.stringify({ tagIds }),
  })
}
