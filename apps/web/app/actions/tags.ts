'use server'

import { API } from '@orbit/shared/api'
import { suggestTagsResponseSchema, type SuggestTagsResponse } from '@orbit/shared/types/habit'
import { serverAuthFetch, serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

type Tag = { id: string; name: string; color: string }

export async function getTags(): Promise<ServerActionResult<Tag[]>> {
  return wrapServerAction(() => serverAuthFetch(API.tags.list, { method: 'GET' }))
}

export async function createTag(
  name: string,
  color: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<{ id: string }>> {
  return wrapServerAction(() => serverAuthMutate(API.tags.create, {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  }, intendedAccountId))
}

export async function updateTag(
  tagId: string,
  name: string,
  color: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.tags.update(tagId), {
    method: 'PUT',
    body: JSON.stringify({ name, color }),
  }, intendedAccountId))
}

export async function deleteTag(
  tagId: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.tags.delete(tagId), {
    method: 'DELETE',
  }, intendedAccountId))
}

export async function restoreTag(
  tagId: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.tags.restore(tagId), {
    method: 'POST',
  }, intendedAccountId))
}

export async function assignTags(
  habitId: string,
  tagIds: string[],
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.tags.assign(habitId), {
    method: 'PUT',
    body: JSON.stringify({ tagIds }),
  }, intendedAccountId))
}

export async function suggestTags(
  title: string,
  description: string | null,
  language: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<SuggestTagsResponse>> {
  return wrapServerAction(async () => {
    const raw: unknown = await serverAuthMutate(API.tags.suggest, {
      method: 'POST',
      body: JSON.stringify({ title, description, language }),
    }, intendedAccountId)
    return suggestTagsResponseSchema.parse(raw)
  })
}
