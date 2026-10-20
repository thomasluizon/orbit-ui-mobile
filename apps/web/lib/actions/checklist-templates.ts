'use client'

import * as serverActions from '@/app/actions/checklist-templates'
import { bindServerAction } from '@/lib/client-action'

export const listChecklistTemplatesAction = bindServerAction(
  serverActions.listChecklistTemplatesAction,
)
export const createChecklistTemplateAction = bindServerAction(
  serverActions.createChecklistTemplateAction,
)
export const deleteChecklistTemplateAction = bindServerAction(
  serverActions.deleteChecklistTemplateAction,
)
