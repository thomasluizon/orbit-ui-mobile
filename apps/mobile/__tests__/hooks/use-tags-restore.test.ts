import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { habitKeys, tagKeys } from '@orbit/shared/query'

import { useDeleteTag, useRestoreTag } from '@/hooks/use-tags'

const mocks = vi.hoisted(() => ({
  queryClient: {
    invalidateQueries: vi.fn(async () => {}),
    cancelQueries: vi.fn(async () => {}),
    getQueriesData: vi.fn(() => []),
    setQueriesData: vi.fn(),
  },
  apiClient: vi.fn(async () => undefined),
  buildQueuedMutation: vi.fn((options: Record<string, unknown>) => ({ id: 'mutation-1', ...options })),
  createQueuedAck: vi.fn((id: string) => ({ queued: true as const, queuedMutationId: id })),
  isQueuedResult: vi.fn((value: unknown) => (
    typeof value === 'object' &&
    value !== null &&
    'queued' in value &&
    (value as { queued?: boolean }).queued === true
  )),
  queueOrExecute: vi.fn(async ({ execute, mutation }: {
    execute: (mutation: unknown) => Promise<unknown>
    mutation: unknown
  }) => execute(mutation)),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showUndoToast: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => mocks.queryClient,
  useQuery: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: mocks.buildQueuedMutation,
  createQueuedAck: mocks.createQueuedAck,
  createTempEntityId: vi.fn(() => 'offline-tag-1'),
  isQueuedResult: mocks.isQueuedResult,
  queueOrExecute: mocks.queueOrExecute,
  withQueuedMarker: vi.fn((value: Record<string, unknown>, id: string) => ({
    ...value,
    queued: true as const,
    queuedMutationId: id,
  })),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
    showQueued: vi.fn(),
    showInfo: vi.fn(),
    showToast: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-undo-toast', () => ({
  useUndoToast: () => mocks.showUndoToast,
}))

type MutationConfig<TResult, TVariables, TContext> = {
  mutationFn: (variables: TVariables) => Promise<TResult>
  onSuccess?: (data: TResult, variables: TVariables, context: TContext | undefined) => void
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void
  onSettled?: (
    data: TResult | undefined,
    error: Error | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void | Promise<void>
}

describe('mobile tag undo + restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiClient.mockResolvedValue(undefined)
    mocks.queueOrExecute.mockImplementation(async ({ execute, mutation }) => execute(mutation))
  })

  it('shows the undo snackbar when a delete succeeds', () => {
    const mutation = useDeleteTag() as unknown as MutationConfig<unknown, string, unknown>

    mutation.onSuccess?.(undefined, 'tag-1', undefined)

    expect(mocks.showUndoToast).toHaveBeenCalledWith('undo.tagDeleted', expect.any(Function))
  })

  it('restores a tag through the queued path, hits the restore endpoint, and invalidates', async () => {
    const mutation = useRestoreTag() as unknown as MutationConfig<unknown, string, unknown>

    const result = await mutation.mutationFn('tag-1')
    mutation.onSuccess?.(result, 'tag-1', undefined)
    await mutation.onSettled?.(result, null, 'tag-1', undefined)

    expect(mocks.buildQueuedMutation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'restoreTag', endpoint: API.tags.restore('tag-1'), method: 'POST' }),
    )
    expect(mocks.apiClient).toHaveBeenCalledWith(API.tags.restore('tag-1'), { method: 'POST' })
    expect(mocks.showSuccess).toHaveBeenCalledWith('undo.restored')
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: tagKeys.all })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
  })

  it('skips invalidation when the restore is queued offline', async () => {
    const mutation = useRestoreTag() as unknown as MutationConfig<unknown, string, unknown>

    mocks.queueOrExecute.mockResolvedValueOnce({ queued: true, queuedMutationId: 'mutation-1' })

    const result = await mutation.mutationFn('tag-1')
    await mutation.onSettled?.(result, null, 'tag-1', undefined)

    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('surfaces an error toast when restore fails', () => {
    const mutation = useRestoreTag() as unknown as MutationConfig<unknown, string, unknown>

    mutation.onError?.(new Error('boom'), 'tag-1', undefined)

    expect(mocks.showError).toHaveBeenCalledWith('undo.restoreFailed')
  })
})
