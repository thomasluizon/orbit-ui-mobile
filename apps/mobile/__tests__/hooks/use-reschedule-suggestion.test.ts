import { beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import type { RescheduleSuggestion } from '@orbit/shared/types/habit'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'
import { createApiClientError, extractBackendErrorCode } from '@orbit/shared/utils'

interface CapturedQuery {
  queryKey: readonly unknown[]
  queryFn: () => Promise<RescheduleSuggestion>
  enabled?: boolean
  staleTime?: number
  retry?: (failureCount: number, error: unknown) => boolean
}

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

function lastQuery(): CapturedQuery {
  const call = mocks.useQuery.mock.calls.at(-1)
  if (!call) throw new Error('no query captured')
  return call[0] as CapturedQuery
}

const suggestion: RescheduleSuggestion = {
  frequencyUnit: 'Day',
  frequencyQuantity: 1,
  dueDate: '2026-07-20',
  dueTime: null,
  days: ['Monday'],
  rationale: 'You tend to complete this on Mondays.',
}

describe('mobile useRescheduleSuggestion', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset()
    mocks.useQuery.mockReset().mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('keys the query on the habit id and enables it when open and habit present', () => {
    useRescheduleSuggestion({ habitId: 'h-1', locale: 'en', enabled: true })

    const query = lastQuery()
    expect(query.queryKey).toEqual(habitKeys.rescheduleSuggestion('h-1'))
    expect(query.enabled).toBe(true)
    expect(query.staleTime).toBe(5 * 60 * 1000)
  })

  it('builds the request URL with the locale and unwraps the suggestion field', async () => {
    mocks.apiClient.mockResolvedValue({ suggestion })

    useRescheduleSuggestion({ habitId: 'h-9', locale: 'pt-BR', enabled: true })
    const result = await lastQuery().queryFn()

    expect(mocks.apiClient).toHaveBeenCalledWith('/api/habits/h-9/reschedule-suggestion?language=pt-BR')
    expect(result).toEqual(suggestion)
  })

  it('stays disabled when the caller passes enabled=false even with a habit id', () => {
    useRescheduleSuggestion({ habitId: 'h-1', locale: 'en', enabled: false })
    expect(lastQuery().enabled).toBe(false)
  })

  it('stays disabled when the habit id is empty even while enabled', () => {
    useRescheduleSuggestion({ habitId: '', locale: 'en', enabled: true })
    expect(lastQuery().enabled).toBe(false)
  })

  it('maps query state to the public shape, defaulting a missing suggestion to null', () => {
    const refetch = vi.fn()
    mocks.useQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch,
    })

    const hook = useRescheduleSuggestion({ habitId: 'h-1', locale: 'en', enabled: true })

    expect(hook.suggestion).toBeNull()
    expect(hook.isLoading).toBe(true)
    expect(hook.refetch).toBe(refetch)
  })

  it('passes through the loaded suggestion and error', () => {
    const error = new Error('gated')
    mocks.useQuery.mockReturnValue({
      data: suggestion,
      isLoading: false,
      error,
      refetch: vi.fn(),
    })

    const hook = useRescheduleSuggestion({ habitId: 'h-1', locale: 'en', enabled: true })

    expect(hook.suggestion).toEqual(suggestion)
    expect(hook.error).toBe(error)
  })

  it('preserves the API code and refuses retries for a deterministic 400', async () => {
    const error = createApiClientError(400, { error: 'This is not overdue.', errorCode: 'HABIT_NOT_OVERDUE' }, 'Failed')
    mocks.apiClient.mockRejectedValue(error)
    mocks.useQuery.mockReturnValue({ data: undefined, isLoading: false, error, refetch: vi.fn() })
    const result = useRescheduleSuggestion({ habitId: 'h-1', locale: 'en', enabled: true })
    await expect(lastQuery().queryFn()).rejects.toBe(error)
    expect(mocks.apiClient).toHaveBeenCalledOnce()
    expect(extractBackendErrorCode(result.error)).toBe('HABIT_NOT_OVERDUE')
    expect(lastQuery().retry?.(0, error)).toBe(false)
  })

  it('retries server errors up to three times', () => {
    useRescheduleSuggestion({ habitId: 'h-1', locale: 'en', enabled: true })
    const error = createApiClientError(500, { error: 'Unavailable' }, 'Failed')
    expect(lastQuery().retry?.(0, error)).toBe(true)
    expect(lastQuery().retry?.(3, error)).toBe(false)
  })
})
