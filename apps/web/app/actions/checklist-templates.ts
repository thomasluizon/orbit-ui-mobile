'use server'

import type {
  ChecklistTemplate,
  CreateChecklistTemplateRequest,
  CreateChecklistTemplateResponse,
} from '@orbit/shared/types/checklist-template'
import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

const TEMPLATE_ID_PATTERN = /^[\w-]{1,128}$/

export async function listChecklistTemplatesAction(): Promise<ChecklistTemplate[]> {
  return serverAuthFetch(API.checklistTemplates.list)
}

export async function createChecklistTemplateAction(
  data: CreateChecklistTemplateRequest,
): Promise<CreateChecklistTemplateResponse> {
  return serverAuthFetch(API.checklistTemplates.create, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteChecklistTemplateAction(id: string): Promise<void> {
  if (!TEMPLATE_ID_PATTERN.test(id)) {
    throw new Error('Invalid template id')
  }
  await serverAuthFetch(API.checklistTemplates.delete(id), {
    method: 'DELETE',
  })
}
