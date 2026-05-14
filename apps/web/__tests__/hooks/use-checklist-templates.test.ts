import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { checklistTemplateKeys } from '@orbit/shared/query'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'

vi.mock('@/app/actions/checklist-templates', () => ({
  listChecklistTemplatesAction: vi.fn(),
  createChecklistTemplateAction: vi.fn(),
  deleteChecklistTemplateAction: vi.fn(),
}))

const {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
} = await import('@/hooks/use-checklist-templates')
const {
  listChecklistTemplatesAction,
  createChecklistTemplateAction,
  deleteChecklistTemplateAction,
} = await import('@/app/actions/checklist-templates')

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

describe('useChecklistTemplates', () => {
  beforeEach(() => {
    vi.mocked(listChecklistTemplatesAction).mockReset()
    vi.mocked(createChecklistTemplateAction).mockReset()
    vi.mocked(deleteChecklistTemplateAction).mockReset()
  })

  it('fetches templates via the list action', async () => {
    const templates: ChecklistTemplate[] = [
      { id: 't1', name: 'Morning', items: ['Wake up'] },
    ]
    vi.mocked(listChecklistTemplatesAction).mockResolvedValue(templates)

    const client = makeQueryClient()
    const { result } = renderHook(() => useChecklistTemplates(), {
      wrapper: wrapperFor(client),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual(templates)
    expect(listChecklistTemplatesAction).toHaveBeenCalledTimes(1)
  })
})

describe('useCreateChecklistTemplate', () => {
  beforeEach(() => {
    vi.mocked(createChecklistTemplateAction).mockReset()
  })

  it('calls the create action and invalidates the list cache on settle', async () => {
    vi.mocked(createChecklistTemplateAction).mockResolvedValue({ id: 'new-t' })

    const client = makeQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateChecklistTemplate(), {
      wrapper: wrapperFor(client),
    })

    await act(async () => {
      await result.current.mutateAsync({ name: 'Workout', items: ['Warmup'] })
    })

    expect(createChecklistTemplateAction).toHaveBeenCalledWith({
      name: 'Workout',
      items: ['Warmup'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: checklistTemplateKeys.lists(),
    })
  })

  it('still invalidates the list cache when the action fails', async () => {
    vi.mocked(createChecklistTemplateAction).mockRejectedValue(new Error('boom'))

    const client = makeQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateChecklistTemplate(), {
      wrapper: wrapperFor(client),
    })

    await act(async () => {
      try {
        await result.current.mutateAsync({ name: 'Workout', items: ['Warmup'] })
      } catch {
        // expected
      }
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: checklistTemplateKeys.lists(),
    })
  })
})

describe('useDeleteChecklistTemplate', () => {
  beforeEach(() => {
    vi.mocked(deleteChecklistTemplateAction).mockReset()
  })

  it('optimistically removes the template from the cache', async () => {
    let resolveDelete: (() => void) | null = null
    vi.mocked(deleteChecklistTemplateAction).mockImplementation(
      () => new Promise<void>((resolve) => { resolveDelete = resolve }),
    )

    const client = makeQueryClient()
    client.setQueryData<ChecklistTemplate[]>(checklistTemplateKeys.lists(), [
      { id: 't1', name: 'A', items: [] },
      { id: 't2', name: 'B', items: [] },
    ])

    const { result } = renderHook(() => useDeleteChecklistTemplate(), {
      wrapper: wrapperFor(client),
    })

    await act(async () => {
      result.current.mutate('t1')
      // Flush microtasks so onMutate (which awaits cancelQueries) completes
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(
      client.getQueryData<ChecklistTemplate[]>(checklistTemplateKeys.lists()),
    ).toEqual([{ id: 't2', name: 'B', items: [] }])

    // Release the mutation so the test cleanup completes
    resolveDelete?.()
  })

  it('rolls back the cache on error', async () => {
    vi.mocked(deleteChecklistTemplateAction).mockRejectedValue(new Error('boom'))

    const client = makeQueryClient()
    const original = [
      { id: 't1', name: 'A', items: [] },
      { id: 't2', name: 'B', items: [] },
    ]
    client.setQueryData<ChecklistTemplate[]>(
      checklistTemplateKeys.lists(),
      original,
    )

    const { result } = renderHook(() => useDeleteChecklistTemplate(), {
      wrapper: wrapperFor(client),
    })

    await act(async () => {
      try {
        await result.current.mutateAsync('t1')
      } catch {
        // expected
      }
    })

    // After settle the list invalidates and refetches, so we only assert the
    // rollback put the original snapshot back before invalidation kicked in.
    // Use getQueryData before any refetch resolves.
    const data = client.getQueryData<ChecklistTemplate[]>(
      checklistTemplateKeys.lists(),
    )
    expect(data).toEqual(original)
  })
})
