import React, { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { PostHogProvider } from '@/components/posthog-provider'

const mocks = vi.hoisted(() => ({
  useConfig: vi.fn(),
  applyPostHogGate: vi.fn(),
  capturePwaInstalled: vi.fn(),
}))

vi.mock('@/hooks/use-config', () => ({ useConfig: mocks.useConfig }))
vi.mock('@/lib/posthog', () => ({
  applyPostHogGate: mocks.applyPostHogGate,
  capturePwaInstalled: mocks.capturePwaInstalled,
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
  it('captures once per install through strict effects and rerenders, then removes the listener', () => {
    mocks.useConfig.mockReturnValue({ config: DEFAULT_CONFIG, refetch: vi.fn() })
    const view = render(<StrictMode><PostHogProvider><div>Orbit</div></PostHogProvider></StrictMode>)
    window.dispatchEvent(new Event('appinstalled'))
    expect(mocks.capturePwaInstalled).toHaveBeenCalledTimes(1)
    view.rerender(<StrictMode><PostHogProvider><div>Hoje</div></PostHogProvider></StrictMode>)
    expect(mocks.capturePwaInstalled).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('appinstalled'))
    expect(mocks.capturePwaInstalled).toHaveBeenCalledTimes(2)
    view.unmount()
    window.dispatchEvent(new Event('appinstalled'))
    expect(mocks.capturePwaInstalled).toHaveBeenCalledTimes(2)
  })

})
