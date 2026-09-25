'use client'

import * as serverActions from '@/app/actions/checklist-templates'
import { bindAccountServerAction, bindServerAction } from '@/lib/client-action'

export const listChecklistTemplatesAction = bindServerAction(
  serverActions.listChecklistTemplatesAction,
)
export const createChecklistTemplateAction = bindAccountServerAction(
  serverActions.createChecklistTemplateAction,
)
export const deleteChecklistTemplateAction = bindAccountServerAction(
  serverActions.deleteChecklistTemplateAction,
)
