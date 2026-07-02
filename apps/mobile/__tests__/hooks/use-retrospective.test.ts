import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RetrospectiveResponse } from '@orbit/shared/utils/retrospective'
import { useRetrospective } from '@/hooks/use-retrospective'

const TestRenderer = require('react-test-renderer')
const React = require('react')

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/i18n', () => ({ i18n: { language: 'en' } }))
vi.mock('@orbit/shared/utils', () => ({
  extractBackendErrorCode: () => undefined,
  getFriendlyErrorMessage: (
    _err: unknown,
    translate: (key: string) => string,
    fallbackKey: string,
  ) => translate(fallbackKey),
}))

type Hook = ReturnType<typeof useRetrospective>

async function renderRetrospective(): Promise<{ current: Hook }> {
  const holder: { current: Hook | null } = { current: null }

  function Component() {
    holder.current = useRetrospective()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(React.createElement(Component))
    await Promise.resolve()
  })

  return {
    get current() {
      if (!holder.current) throw new Error('hook not rendered')
      return holder.current
    },
  }
}

async function act(fn: () => Promise<void>): Promise<void> {
  await TestRenderer.act(async () => {
    await fn()
    await Promise.resolve()
  })
}

function buildResponse(
  overrides: Partial<RetrospectiveResponse> = {},
): RetrospectiveResponse {
  return {
    period: 'week',
    fromCache: false,
    metrics: {
      completionRate: 90,
      totalCompletions: 18,
      totalScheduled: 20,
      activeDays: 6,
      periodDays: 7,
      currentStreak: 4,
      bestStreak: 9,
      badHabitSlips: 1,
      weeklyConsistency: [80, 100, 60, 100, 40, 0, 100],
      topHabits: [],
      needsAttention: [],
    },
    narrative: {
      highlights: 'You stayed consistent.',
      missed: 'A couple of slips.',
      trends: 'Mornings are strong.',
      suggestion: 'Keep the streak alive.',
    },
    ...overrides,
  }
}

describe('mobile useRetrospective', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset()
  })

  it('generates a retrospective on success', async () => {
    const response = buildResponse()
    mocks.apiClient.mockResolvedValue(response)

    const hook = await renderRetrospective()
    await act(async () => {
      await hook.current.generate()
    })

    expect(hook.current.data).toEqual(response)
    expect(hook.current.fromCache).toBe(false)
    expect(hook.current.isLoading).toBe(false)
  })

  it('ignores a stale generation that resolves after a newer one', async () => {
    const stale = buildResponse()
    const fresh = buildResponse({
      fromCache: true,
      metrics: { ...buildResponse().metrics, completionRate: 42 },
    })

    let resolveStale: (value: RetrospectiveResponse) => void = () => {}
    const stalePromise = new Promise<RetrospectiveResponse>((resolve) => {
      resolveStale = resolve
    })
    mocks.apiClient.mockReturnValueOnce(stalePromise).mockResolvedValueOnce(fresh)

    const hook = await renderRetrospective()

    let firstCall: Promise<void> = Promise.resolve()
    await act(async () => {
      firstCall = hook.current.generate()
      await hook.current.generate()
    })

    expect(hook.current.data).toEqual(fresh)

    await act(async () => {
      resolveStale(stale)
      await firstCall
    })

    expect(hook.current.data).toEqual(fresh)
    expect(hook.current.fromCache).toBe(true)
  })
})
