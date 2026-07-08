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
    staleTime: QUERY_STALE_TIMES.checklistTemplates,
  })
}

function createOptimisticTemplateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `optimistic-${crypto.randomUUID()}`
  }
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useCreateChecklistTemplate() {
  const queryClient = useQueryClient()

  return useMutation<
    CreateChecklistTemplateResponse,
    Error,
    CreateChecklistTemplateRequest,
    { previous: ChecklistTemplate[] | undefined }
  >({
    mutationFn: (data) => createChecklistTemplateAction(data),

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: checklistTemplateKeys.lists() })

      const previous = queryClient.getQueryData<ChecklistTemplate[]>(
        checklistTemplateKeys.lists(),
      )

      const placeholder: ChecklistTemplate = {
        id: createOptimisticTemplateId(),
        name: data.name,
        items: data.items,
      }

      queryClient.setQueryData<ChecklistTemplate[]>(
        checklistTemplateKeys.lists(),
        (old) => (old ? [...old, placeholder] : [placeholder]),
      )

      return { previous }
    },

    onError: (_err, _data, context) => {
      queryClient.setQueryData(checklistTemplateKeys.lists(), context?.previous)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.lists() })
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
      queryClient.setQueryData(checklistTemplateKeys.lists(), context?.previous)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.lists() })
    },
  })
}
