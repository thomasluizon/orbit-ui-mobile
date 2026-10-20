'use client'

import * as serverActions from '@/app/actions/tags'
import { bindServerAction } from '@/lib/client-action'

export const getTags = bindServerAction(serverActions.getTags)
export const createTag = bindServerAction(serverActions.createTag)
export const updateTag = bindServerAction(serverActions.updateTag)
export const deleteTag = bindServerAction(serverActions.deleteTag)
export const restoreTag = bindServerAction(serverActions.restoreTag)
export const assignTags = bindServerAction(serverActions.assignTags)
export const suggestTags = bindServerAction(serverActions.suggestTags)
