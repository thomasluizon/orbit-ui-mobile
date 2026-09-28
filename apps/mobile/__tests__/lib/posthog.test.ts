import { beforeEach, describe, expect, it, vi } from 'vitest'
const storage = vi.hoisted(() => ({
  getItem: vi.fn<(key: string) => Promise<string | null>>(),
  setItem: vi.fn<(key: string, value: string) => Promise<void>>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }))

describe('mobile PostHog adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    storage.getItem.mockReset().mockResolvedValue(null)
    storage.setItem.mockReset().mockResolvedValue(undefined)
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

  it('defaults to capture, persists opt out across restart, and resumes without restart', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    expect(await analytics.getAnalyticsOptOut()).toBe(false)
    expect(storage.getItem).toHaveBeenCalledWith('analytics-opt-out')
    await analytics.applyPostHogGate(true)
    await analytics.setAnalyticsOptOut(true)
    expect(await analytics.getAnalyticsOptOut()).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith('analytics-opt-out', 'true')
    expect(analytics.posthog!.optOut).toHaveBeenCalled()
    analytics.identifyPostHogUser('user-1')
    analytics.captureHabitLogged()
    expect(analytics.posthog!.identify).not.toHaveBeenCalled()
    expect(analytics.posthog!.capture).not.toHaveBeenCalled()

    vi.resetModules()
    storage.getItem.mockResolvedValue('true')
    const restarted = await import('@/lib/posthog')
    await restarted.applyPostHogGate(true)
    restarted.identifyPostHogUser('user-1')
    restarted.captureHabitLogged()
    expect(await restarted.getAnalyticsOptOut()).toBe(true)
    expect(restarted.posthog!.optIn).not.toHaveBeenCalled()
    expect(restarted.posthog!.identify).not.toHaveBeenCalled()
    expect(restarted.posthog!.capture).not.toHaveBeenCalled()
    await restarted.setAnalyticsOptOut(false)
    expect(await restarted.getAnalyticsOptOut()).toBe(false)
    expect(restarted.posthog!.optIn).toHaveBeenCalled()
    expect(storage.setItem).toHaveBeenCalledWith('analytics-opt-out', 'false')
  })

  it('restores the prior capture state when the local write fails', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(true)
    storage.setItem.mockRejectedValueOnce(new Error('storage failed'))
    await expect(analytics.setAnalyticsOptOut(true)).rejects.toThrow('storage failed')
    expect(await analytics.getAnalyticsOptOut()).toBe(false)
    expect(analytics.posthog!.optOut).toHaveBeenCalled()
    expect(analytics.posthog!.optIn).toHaveBeenCalled()
    await analytics.setAnalyticsOptOut(true)
    storage.setItem.mockRejectedValueOnce(new Error('later write failed'))
    await expect(analytics.setAnalyticsOptOut(false)).rejects.toThrow('later write failed')
    expect(await analytics.getAnalyticsOptOut()).toBe(true)
  })

  it('restores the persisted opt out after overlapping failed writes', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    storage.getItem.mockResolvedValue('true')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(true)

    const rejectWrites: ((error: Error) => void)[] = []
    storage.setItem.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejectWrites.push(reject)
    }))

    const first = expect(analytics.setAnalyticsOptOut(false)).rejects.toThrow('first write failed')
    const second = expect(analytics.setAnalyticsOptOut(true)).rejects.toThrow('second write failed')
    await vi.waitFor(() => expect(rejectWrites).toHaveLength(1))
    rejectWrites[0]!(new Error('first write failed'))
    await vi.waitFor(() => expect(rejectWrites).toHaveLength(2))
    rejectWrites[1]!(new Error('second write failed'))
    await Promise.all([first, second])

    expect(await analytics.getAnalyticsOptOut()).toBe(true)
    analytics.identifyPostHogUser('user-1')
    analytics.captureHabitLogged()
    expect(analytics.posthog!.identify).not.toHaveBeenCalled()
    expect(analytics.posthog!.capture).not.toHaveBeenCalled()
  })

  it('resumes capture after an opted-out sign-out when the server gate stays on', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(true)
    await analytics.setAnalyticsOptOut(true)
    analytics.resetPostHogUser()
    await analytics.setAnalyticsOptOut(false)
    analytics.identifyPostHogUser('user-2')
    analytics.captureHabitLogged()
    expect(analytics.posthog!.identify).toHaveBeenCalledWith('user-2')
    expect(analytics.posthog!.capture).toHaveBeenCalledWith('habit_logged')
  })
})
