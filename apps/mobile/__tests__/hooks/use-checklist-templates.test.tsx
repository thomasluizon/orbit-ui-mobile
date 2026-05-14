import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { checklistTemplateKeys } from '@orbit/shared/query'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const captured = {
    queryArgs: null as Record<string, unknown> | null,
    mutationArgs: null as Record<string, unknown> | null,
  }
  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
    cancelQueries: vi.fn(async () => {}),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  }
  return {
    captured,
    queryClient,
    useQuery: vi.fn((args: Record<string, unknown>) => {
      captured.queryArgs = args
      return { data: undefined, isLoading: false, isError: false }
    }),
    useMutation: vi.fn((args: Record<string, unknown>) => {
      captured.mutationArgs = args
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
    }),
    useQueryClient: vi.fn(() => queryClient),
    apiClient: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
} from '@/hooks/use-checklist-templates'

function renderHook(hook: () => unknown) {
  function Harness() {
    hook()
    return null
  }
  return TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
    return Promise.resolve()
  })
}

describe('mobile useChecklistTemplates', () => {
  beforeEach(() => {
    mocks.captured.queryArgs = null
    mocks.captured.mutationArgs = null
    mocks.useQuery.mockClear()
    mocks.useMutation.mockClear()
    mocks.apiClient.mockReset()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.cancelQueries.mockClear()
    mocks.queryClient.getQueryData.mockReset()
    mocks.queryClient.setQueryData.mockClear()
  })

  describe('useChecklistTemplates', () => {
    it('configures useQuery with the templates list key', async () => {
      await renderHook(() => useChecklistTemplates())
      expect(mocks.captured.queryArgs?.queryKey).toEqual(checklistTemplateKeys.lists())
    })

    it('queryFn calls apiClient with the templates endpoint', async () => {
      await renderHook(() => useChecklistTemplates())
      const queryFn = mocks.captured.queryArgs?.queryFn as () => Promise<unknown>

      mocks.apiClient.mockResolvedValue([{ id: 't1', name: 'A', items: [] }])
      await queryFn()

      expect(mocks.apiClient).toHaveBeenCalledWith(API.checklistTemplates.list)
    })
  })

  describe('useCreateChecklistTemplate', () => {
    it('mutationFn POSTs to the create endpoint with the request body', async () => {
      await renderHook(() => useCreateChecklistTemplate())
      const mutationFn = mocks.captured.mutationArgs?.mutationFn as (
        data: { name: string; items: string[] },
      ) => Promise<unknown>

      mocks.apiClient.mockResolvedValue({ id: 'new-t' })
      await mutationFn({ name: 'Workout', items: ['Warmup'] })

      expect(mocks.apiClient).toHaveBeenCalledWith(API.checklistTemplates.create, {
        method: 'POST',
        body: JSON.stringify({ name: 'Workout', items: ['Warmup'] }),
      })
    })

    it('invalidates the templates list on settle', async () => {
      await renderHook(() => useCreateChecklistTemplate())
      const onSettled = mocks.captured.mutationArgs?.onSettled as () => void
      onSettled()
      expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: checklistTemplateKeys.lists(),
      })
    })

    it('onMutate optimistically appends a placeholder with an optimistic id', async () => {
      const existing = [{ id: 't1', name: 'Existing', items: ['A'] }]
      mocks.queryClient.getQueryData.mockReturnValue(existing)

      await renderHook(() => useCreateChecklistTemplate())
      const onMutate = mocks.captured.mutationArgs?.onMutate as (
        data: { name: string; items: string[] },
      ) => Promise<{ previous: unknown }>

      const ctx = await onMutate({ name: 'New', items: ['B'] })
      expect(ctx.previous).toEqual(existing)

      const updater = mocks.queryClient.setQueryData.mock.calls[0]![1] as (
        old: typeof existing | undefined,
      ) => typeof existing | undefined

      const next = updater(existing)!
      expect(next).toHaveLength(2)
      expect(next[0]).toEqual(existing[0])
      expect(next[1]?.name).toBe('New')
      expect(next[1]?.items).toEqual(['B'])
      expect(next[1]?.id.startsWith('optimistic-')).toBe(true)

      // When the cache is empty, still seeds with the placeholder
      const seeded = updater(undefined)!
      expect(seeded).toHaveLength(1)
      expect(seeded[0]?.name).toBe('New')
    })

    it('onError restores the snapshot regardless of whether a previous list existed', async () => {
      await renderHook(() => useCreateChecklistTemplate())
      const onError = mocks.captured.mutationArgs?.onError as (
        err: unknown,
        data: unknown,
        ctx: { previous: unknown } | undefined,
      ) => void

      const snapshot = [{ id: 't1', name: 'A', items: [] }]
      onError(new Error('boom'), { name: 'X', items: [] }, { previous: snapshot })
      expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
        checklistTemplateKeys.lists(),
        snapshot,
      )

      // When previous is undefined (empty-cache first-load case), the rollback
      // still writes undefined back so the optimistic placeholder is cleared.
      mocks.queryClient.setQueryData.mockClear()
      onError(new Error('boom'), { name: 'X', items: [] }, { previous: undefined })
      expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
        checklistTemplateKeys.lists(),
        undefined,
      )
    })
  })

  describe('useDeleteChecklistTemplate', () => {
    it('mutationFn DELETEs the per-id endpoint', async () => {
      await renderHook(() => useDeleteChecklistTemplate())
      const mutationFn = mocks.captured.mutationArgs?.mutationFn as (
        id: string,
      ) => Promise<void>

      mocks.apiClient.mockResolvedValue(undefined)
      await mutationFn('tmpl-1')

      expect(mocks.apiClient).toHaveBeenCalledWith(
        API.checklistTemplates.delete('tmpl-1'),
        { method: 'DELETE' },
      )
    })

    it('onMutate snapshots the previous list and optimistically filters it', async () => {
      const original = [
        { id: 't1', name: 'A', items: [] },
        { id: 't2', name: 'B', items: [] },
      ]
      mocks.queryClient.getQueryData.mockReturnValue(original)

      await renderHook(() => useDeleteChecklistTemplate())
      const onMutate = mocks.captured.mutationArgs?.onMutate as (
        id: string,
      ) => Promise<{ previous: unknown }>

      const ctx = await onMutate('t1')

      expect(mocks.queryClient.cancelQueries).toHaveBeenCalledWith({
        queryKey: checklistTemplateKeys.lists(),
      })
      expect(ctx.previous).toEqual(original)

      // The setQueryData updater should remove the deleted entry
      const updateCall = mocks.queryClient.setQueryData.mock.calls[0]!
      const updater = updateCall[1] as (
        old: typeof original | undefined,
      ) => typeof original | undefined
      expect(updater(original)).toEqual([{ id: 't2', name: 'B', items: [] }])
      expect(updater(undefined)).toBeUndefined()
    })

    it('onError restores the snapshot', async () => {
      await renderHook(() => useDeleteChecklistTemplate())
      const onError = mocks.captured.mutationArgs?.onError as (
        err: unknown,
        id: string,
        ctx: { previous: unknown } | undefined,
      ) => void

      const snapshot = [{ id: 't1', name: 'A', items: [] }]
      onError(new Error('boom'), 't1', { previous: snapshot })
      expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
        checklistTemplateKeys.lists(),
        snapshot,
      )

      // Empty-cache path: setQueryData(key, undefined) clears the cache entry.
      mocks.queryClient.setQueryData.mockClear()
      onError(new Error('boom'), 't1', { previous: undefined })
      expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
        checklistTemplateKeys.lists(),
        undefined,
      )
    })

    it('invalidates the list on settle', async () => {
      await renderHook(() => useDeleteChecklistTemplate())
      const onSettled = mocks.captured.mutationArgs?.onSettled as () => void
      onSettled()
      expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: checklistTemplateKeys.lists(),
      })
    })
  })
})
