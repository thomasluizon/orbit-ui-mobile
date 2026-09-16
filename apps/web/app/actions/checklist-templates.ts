'use server'

import type {
  ChecklistTemplate,
  CreateChecklistTemplateRequest,
  CreateChecklistTemplateResponse,
} from '@orbit/shared/types/checklist-template'
import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

const TEMPLATE_ID_PATTERN = /^[\w-]{1,128}$/

export async function listChecklistTemplatesAction(): Promise<ServerActionResult<ChecklistTemplate[]>> {
  return wrapServerAction(() => serverAuthFetch(API.checklistTemplates.list))
}

export async function createChecklistTemplateAction(
  data: CreateChecklistTemplateRequest,
): Promise<ServerActionResult<CreateChecklistTemplateResponse>> {
  return wrapServerAction(() => serverAuthFetch(API.checklistTemplates.create, {
    method: 'POST',
    body: JSON.stringify(data),
  }))
}

export async function deleteChecklistTemplateAction(
  id: string,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(async () => {
    if (!TEMPLATE_ID_PATTERN.test(id)) {
      throw new Error('Invalid template id')
    }
    await serverAuthFetch(API.checklistTemplates.delete(id), {
      method: 'DELETE',
    })
  })
}
