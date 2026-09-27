import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { PostHogProvider } from '@/components/posthog-provider'

const mocks = vi.hoisted(() => ({
  useConfig: vi.fn(),
  initializePostHog: vi.fn(),
  applyPostHogGate: vi.fn(),
}))

vi.mock('@/hooks/use-config', () => ({ useConfig: mocks.useConfig }))
vi.mock('@/lib/posthog', () => ({
  initializePostHog: mocks.initializePostHog,
  applyPostHogGate: mocks.applyPostHogGate,
}))

describe('web PostHog provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
  })

  it('waits for a fresh enabled config response even when cached config says on', () => {
    const refetch = vi.fn()
    const enabledConfig = {
      ...DEFAULT_CONFIG,
      features: { ...DEFAULT_CONFIG.features, analytics: { enabled: true, planRequirement: null } },
    }
    mocks.useConfig.mockReturnValue({
      config: enabledConfig,
      isFetchedAfterMount: false,
      isFetching: true,
      refetch,
    })

    const view = render(<PostHogProvider><div>Orbit</div></PostHogProvider>)
    expect(mocks.initializePostHog).toHaveBeenCalledWith(false)
    expect(mocks.applyPostHogGate).toHaveBeenCalledWith(false)
    expect(refetch).toHaveBeenCalledOnce()

    mocks.useConfig.mockReturnValue({
      config: enabledConfig,
      isFetchedAfterMount: true,
      isFetching: false,
      refetch,
    })
    view.rerender(<PostHogProvider><div>Orbit</div></PostHogProvider>)
    expect(mocks.applyPostHogGate).toHaveBeenLastCalledWith(true)
  })
})
