import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('mobile PostHog adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', '')
  })

  it('does not construct a client or capture without a key', async () => {
    const analytics = await import('@/lib/posthog')
    expect(analytics.posthog).toBeNull()
    await analytics.applyPostHogGate(true)
    analytics.identifyPostHogUser('4fb5053e-819d-4b49-9ce2-945e988469bf')
    analytics.captureHabitLogged()
  })

  it('identifies, captures one content-free event, and resets a signed-out user', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    const client = analytics.posthog!
    await analytics.applyPostHogGate(true)
    analytics.identifyPostHogUser('4fb5053e-819d-4b49-9ce2-945e988469bf')
    analytics.captureHabitLogged()
    analytics.resetPostHogUser()
    expect(client.identify).toHaveBeenCalledWith('4fb5053e-819d-4b49-9ce2-945e988469bf')
    expect(client.capture).toHaveBeenCalledExactlyOnceWith('habit_logged')
    expect(client.reset).toHaveBeenCalledOnce()
  })

  it('opts out and suppresses captures when the server flag is off', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    const client = analytics.posthog!
    await analytics.applyPostHogGate(false)
    analytics.captureHabitLogged()
    expect(client.optOut).toHaveBeenCalledOnce()
    expect(client.capture).not.toHaveBeenCalled()
    await analytics.applyPostHogGate(true)
    expect(client.optIn).toHaveBeenCalledOnce()
  })
})
