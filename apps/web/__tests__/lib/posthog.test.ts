import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: sdk }))

describe('web PostHog adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
  })

  it('does not initialize or capture without a key', async () => {
    const analytics = await import('@/lib/posthog')
    analytics.initializePostHog(true)
    analytics.identifyPostHogUser('4fb5053e-819d-4b49-9ce2-945e988469bf')
    analytics.captureHabitLogged()
    expect(sdk.init).not.toHaveBeenCalled()
    expect(sdk.capture).not.toHaveBeenCalled()
    expect(sdk.identify).not.toHaveBeenCalled()
  })

  it('identifies, captures one content-free event, and resets a signed-out user', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    analytics.initializePostHog(true)
    analytics.identifyPostHogUser('4fb5053e-819d-4b49-9ce2-945e988469bf')
    analytics.captureHabitLogged()
    analytics.resetPostHogUser()
    expect(sdk.init).toHaveBeenCalledOnce()
    expect(sdk.init.mock.calls[0]?.[1]).toMatchObject({
      api_host: '/ingest',
      capture_performance: { web_vitals: true },
      cross_subdomain_cookie: true,
    })
    expect(sdk.identify).toHaveBeenCalledWith('4fb5053e-819d-4b49-9ce2-945e988469bf')
    expect(sdk.capture).toHaveBeenCalledExactlyOnceWith('habit_logged')
    expect(sdk.reset).toHaveBeenCalledOnce()
  })

  it('opts out and suppresses captures when the server flag is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    analytics.initializePostHog(false)
    analytics.applyPostHogGate(false)
    analytics.captureHabitLogged()
    expect(sdk.init.mock.calls[0]?.[1]).toMatchObject({ opt_out_capturing_by_default: true })
    expect(sdk.opt_out_capturing).toHaveBeenCalledOnce()
    expect(sdk.capture).not.toHaveBeenCalled()
    analytics.applyPostHogGate(true)
    expect(sdk.opt_in_capturing).toHaveBeenCalledOnce()
  })
})
