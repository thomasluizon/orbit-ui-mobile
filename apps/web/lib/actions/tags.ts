'use client'

import * as serverActions from '@/app/actions/tags'
import { bindAccountServerAction, bindServerAction } from '@/lib/client-action'

export const getTags = bindServerAction(serverActions.getTags)
export const createTag = bindAccountServerAction(serverActions.createTag)
export const updateTag = bindAccountServerAction(serverActions.updateTag)
export const deleteTag = bindAccountServerAction(serverActions.deleteTag)
export const restoreTag = bindAccountServerAction(serverActions.restoreTag)
export const assignTags = bindAccountServerAction(serverActions.assignTags)
export const suggestTags = bindAccountServerAction(serverActions.suggestTags)
