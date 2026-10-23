import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { checklistTemplateKeys, goalKeys, habitKeys, tagKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'

const source = createMockHabit({ id: '11111111-1111-4111-8111-111111111111', title: 'Read', frequencyUnit: 'Day', tags: [], linkedGoals: [], slipAlertEnabled: false, checklistItems: [{ text: 'Same', isChecked: true }, { text: 'Same', isChecked: false }] })
const detail = { ...source, parentId: null, children: [] }

export function readEditorParentFixture(endpoint: string) {
  if (endpoint === API.habits.get(source.id)) return Promise.resolve(detail)
  return Promise.resolve([])
}

export function EditorParentOwner({ label }: Readonly<{ label: string }>) {
  const [open, setOpen] = useState(true)
  const [client] = useState(() => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } })
    queryClient.setQueryData(habitKeys.detail(source.id), detail)
    queryClient.setQueryData(habitKeys.list({}), [
      createMockHabitScheduleItem({ ...source, children: [] }),
      ...Array.from({ length: 10 }, (_, index) => createMockHabitScheduleItem({ id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`, title: `${label} ${index}`, children: [] })),
    ])
    queryClient.setQueryData(habitKeys.list({ isGeneral: true }), [])
    queryClient.setQueryData(tagKeys.lists(), [])
    queryClient.setQueryData(goalKeys.lists(), [])
    queryClient.setQueryData(checklistTemplateKeys.lists(), [])
    return queryClient
  })
  return <QueryClientProvider client={client}><EditHabitModal open={open} onOpenChange={setOpen} habit={source} /></QueryClientProvider>
}
