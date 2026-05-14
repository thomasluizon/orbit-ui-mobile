'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { checklistTemplateKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type {
  ChecklistTemplate,
  CreateChecklistTemplateRequest,
  CreateChecklistTemplateResponse,
} from '@orbit/shared/types/checklist-template'
import {
  createChecklistTemplateAction,
  deleteChecklistTemplateAction,
  listChecklistTemplatesAction,
} from '@/app/actions/checklist-templates'

export function useChecklistTemplates() {
  return useQuery({
    queryKey: checklistTemplateKeys.lists(),
    queryFn: listChecklistTemplatesAction,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useCreateChecklistTemplate() {
  const queryClient = useQueryClient()

  return useMutation<CreateChecklistTemplateResponse, Error, CreateChecklistTemplateRequest>({
    mutationFn: (data) => createChecklistTemplateAction(data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.lists() })
    },
  })
}

export function useDeleteChecklistTemplate() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string, { previous: ChecklistTemplate[] | undefined }>({
    mutationFn: (id) => deleteChecklistTemplateAction(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: checklistTemplateKeys.lists() })

      const previous = queryClient.getQueryData<ChecklistTemplate[]>(
        checklistTemplateKeys.lists(),
      )

      queryClient.setQueryData<ChecklistTemplate[]>(checklistTemplateKeys.lists(), (old) =>
        old ? old.filter((tpl) => tpl.id !== id) : old,
      )

      return { previous }
    },

    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(checklistTemplateKeys.lists(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.lists() })
    },
  })
}
