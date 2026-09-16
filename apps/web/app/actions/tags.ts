'use server'

import { API } from '@orbit/shared/api'
import { suggestTagsResponseSchema, type SuggestTagsResponse } from '@orbit/shared/types/habit'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

type Tag = { id: string; name: string; color: string }

export async function getTags(): Promise<ServerActionResult<Tag[]>> {
  return wrapServerAction(() => serverAuthFetch(API.tags.list, { method: 'GET' }))
}

export async function createTag(
  name: string,
  color: string,
): Promise<ServerActionResult<{ id: string }>> {
  return wrapServerAction(() => serverAuthFetch(API.tags.create, {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  }))
}

export async function updateTag(
  tagId: string,
  name: string,
  color: string,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.tags.update(tagId), {
    method: 'PUT',
    body: JSON.stringify({ name, color }),
  }))
}

export async function deleteTag(tagId: string): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.tags.delete(tagId), {
    method: 'DELETE',
  }))
}

export async function restoreTag(tagId: string): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.tags.restore(tagId), {
    method: 'POST',
  }))
}

export async function assignTags(
  habitId: string,
  tagIds: string[],
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.tags.assign(habitId), {
    method: 'PUT',
    body: JSON.stringify({ tagIds }),
  }))
}

export async function suggestTags(
  title: string,
  description: string | null,
  language: string,
): Promise<ServerActionResult<SuggestTagsResponse>> {
  return wrapServerAction(async () => {
    const raw: unknown = await serverAuthFetch(API.tags.suggest, {
      method: 'POST',
      body: JSON.stringify({ title, description, language }),
    })
    return suggestTagsResponseSchema.parse(raw)
  })
}
