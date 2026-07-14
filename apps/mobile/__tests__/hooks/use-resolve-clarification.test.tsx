import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API, MAX_CLARIFICATION_VALUE_LENGTH } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const captured = {
    mutationArgs: null as Record<string, unknown> | null,
  }
  const queryClient = {
    invalidateQueries: vi.fn(),
  }
  return {
    captured,
    queryClient,
    useMutation: vi.fn((args: Record<string, unknown>) => {
      captured.mutationArgs = args
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
    }),
    useQueryClient: vi.fn(() => queryClient),
    apiClient: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useMutation: mocks.useMutation,
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

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

type MutationFn = (input: { operationId: string; value: string }) => Promise<AgentExecuteOperationResponse>
type OnSuccess = (response: AgentExecuteOperationResponse) => void

function buildResponse(status: string): AgentExecuteOperationResponse {
  return {
    operation: {
      operationId: 'op-1',
      sourceName: 'update_habit',
      riskClass: 'Low',
      confirmationRequirement: 'None',
      status: status as AgentExecuteOperationResponse['operation']['status'],
    },
  }
}

describe('mobile useResolveClarification', () => {
  beforeEach(() => {
    mocks.captured.mutationArgs = null
    mocks.useMutation.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.apiClient.mockReset()
    mocks.queryClient.invalidateQueries.mockClear()
  })

  it('POSTs the trimmed value to the clarification-resolve endpoint for a valid input', async () => {
    await renderHook(() => useResolveClarification())
    const mutationFn = mocks.captured.mutationArgs?.mutationFn as MutationFn

    mocks.apiClient.mockResolvedValue(buildResponse('Succeeded'))
    await mutationFn({ operationId: 'op-42', value: 'the gym' })

    expect(mocks.apiClient).toHaveBeenCalledWith(API.ai.clarificationResolve('op-42'), {
      method: 'POST',
      body: JSON.stringify({ value: 'the gym' }),
    })
  })

  it('throws a 400 without calling the API when the value is empty or whitespace', async () => {
    await renderHook(() => useResolveClarification())
    const mutationFn = mocks.captured.mutationArgs?.mutationFn as MutationFn

    let thrown: unknown
    try {
      await mutationFn({ operationId: 'op-1', value: '   ' })
    } catch (error: unknown) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as { status?: number }).status).toBe(400)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('throws a 400 without calling the API when the value exceeds the max length', async () => {
    await renderHook(() => useResolveClarification())
    const mutationFn = mocks.captured.mutationArgs?.mutationFn as MutationFn

    const oversized = 'x'.repeat(MAX_CLARIFICATION_VALUE_LENGTH + 1)
    let thrown: unknown
    try {
      await mutationFn({ operationId: 'op-1', value: oversized })
    } catch (error: unknown) {
      thrown = error
    }

    expect((thrown as { status?: number }).status).toBe(400)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('accepts a value exactly at the max length', async () => {
    await renderHook(() => useResolveClarification())
    const mutationFn = mocks.captured.mutationArgs?.mutationFn as MutationFn

    mocks.apiClient.mockResolvedValue(buildResponse('Succeeded'))
    const atLimit = 'x'.repeat(MAX_CLARIFICATION_VALUE_LENGTH)
    await mutationFn({ operationId: 'op-1', value: atLimit })

    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  })

  it('invalidates the habit list, count, and summary caches only when the operation Succeeded', async () => {
    await renderHook(() => useResolveClarification())
    const onSuccess = mocks.captured.mutationArgs?.onSuccess as OnSuccess

    onSuccess(buildResponse('Succeeded'))

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledTimes(3)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.count() })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.summaryPrefix(),
    })
  })

  it('does not invalidate any cache when the operation Failed', async () => {
    await renderHook(() => useResolveClarification())
    const onSuccess = mocks.captured.mutationArgs?.onSuccess as OnSuccess

    onSuccess(buildResponse('Failed'))

    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('does not invalidate when the operation is PendingConfirmation', async () => {
    await renderHook(() => useResolveClarification())
    const onSuccess = mocks.captured.mutationArgs?.onSuccess as OnSuccess

    onSuccess(buildResponse('PendingConfirmation'))

    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })
})
