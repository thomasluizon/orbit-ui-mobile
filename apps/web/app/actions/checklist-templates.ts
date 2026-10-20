'use server'

import type {
  ChecklistTemplate,
  CreateChecklistTemplateRequest,
  CreateChecklistTemplateResponse,
} from '@orbit/shared/types/checklist-template'
import { API } from '@orbit/shared/api'
import { serverAuthFetch, serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

const TEMPLATE_ID_PATTERN = /^[\w-]{1,128}$/

export async function listChecklistTemplatesAction(): Promise<ServerActionResult<ChecklistTemplate[]>> {
  return wrapServerAction(() => serverAuthFetch(API.checklistTemplates.list))
}

export async function createChecklistTemplateAction(
  data: CreateChecklistTemplateRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<CreateChecklistTemplateResponse>> {
  return wrapServerAction(() => serverAuthMutate(API.checklistTemplates.create, {
    method: 'POST',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function deleteChecklistTemplateAction(
  id: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(async () => {
    if (!TEMPLATE_ID_PATTERN.test(id)) {
      throw new Error('Invalid template id')
    }
    await serverAuthMutate(API.checklistTemplates.delete(id), {
      method: 'DELETE',
    }, intendedAccountId)
  })
}
