import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/react-native'
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

  it('gates screen captures through the analytics preference', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(false)
    analytics.captureScreen('habits')
    expect(analytics.posthog!.screen).not.toHaveBeenCalled()
    await analytics.applyPostHogGate(true)
    analytics.captureScreen('habits')
    expect(analytics.posthog!.screen).toHaveBeenCalledExactlyOnceWith('habits')
    await analytics.setAnalyticsOptOut(true)
    analytics.captureScreen('habits')
    expect(analytics.posthog!.screen).toHaveBeenCalledOnce()
  })

  it('reports a rejected screen capture to Sentry once', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(true)
    const error = new Error('Screen capture failed')
    vi.mocked(analytics.posthog!.screen).mockRejectedValueOnce(error)
    analytics.captureScreen('habits')
    await vi.waitFor(() => expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error, {
      tags: { operation: 'posthog_screen' },
    }))
  })

  it.each([
    { outcome: 'success', play_status: 2, available_version_code: 181, play_error_code: null },
    { outcome: 'error', play_status: null, available_version_code: null, play_error_code: -100 },
    { outcome: 'service_unavailable', play_status: null, available_version_code: null, play_error_code: null },
    { outcome: 'service_unavailable', play_status: null, available_version_code: null, play_error_code: -3 },
    { outcome: 'service_unavailable', play_status: null, available_version_code: null, play_error_code: -9 },
  ] as const)('gates Android update diagnostics through the analytics preference for $outcome, code $play_error_code', async (result) => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    const check = {
      ...result, installed_version_code: 178,
    }
    const sheet = { sheet: 'available' as const, available_version_code: 181, installed_version_code: 178 }
    await analytics.applyPostHogGate(false)
    analytics.captureAndroidUpdateCheck(check)
    analytics.captureAndroidUpdateSheetShown(sheet)
    expect(analytics.posthog!.capture).not.toHaveBeenCalled()
    await analytics.applyPostHogGate(true)
    analytics.captureAndroidUpdateCheck(check)
    analytics.captureAndroidUpdateSheetShown(sheet)
    expect(analytics.posthog!.capture).toHaveBeenNthCalledWith(1, 'android_update_checked', check)
    expect(analytics.posthog!.capture).toHaveBeenNthCalledWith(2, 'android_update_sheet_shown', sheet)
    await analytics.setAnalyticsOptOut(true)
    analytics.captureAndroidUpdateCheck(check)
    analytics.captureAndroidUpdateSheetShown(sheet)
    expect(analytics.posthog!.capture).toHaveBeenCalledTimes(2)
  })

  it('delivers the first update check and sheet after a delayed preference read', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    let resolvePreference!: (value: string | null) => void
    storage.getItem.mockImplementation(() => new Promise((resolve) => { resolvePreference = resolve }))
    const analytics = await import('@/lib/posthog')
    const gate = analytics.applyPostHogGate(true)
    const check = { outcome: 'success' as const, play_status: 2, available_version_code: 181,
      installed_version_code: 178, play_error_code: null }
    const sheet = { sheet: 'available' as const, available_version_code: 181, installed_version_code: 178 }
    analytics.captureAndroidUpdateCheck(check)
    analytics.captureAndroidUpdateSheetShown(sheet)
    await vi.waitFor(() => expect(storage.getItem).toHaveBeenCalledOnce())
    expect(analytics.posthog!.capture).not.toHaveBeenCalled()
    resolvePreference(null)
    await gate
    expect(analytics.posthog!.capture).toHaveBeenNthCalledWith(1, 'android_update_checked', check)
    expect(analytics.posthog!.capture).toHaveBeenNthCalledWith(2, 'android_update_sheet_shown', sheet)
    await analytics.applyPostHogGate(true)
    expect(analytics.posthog!.capture).toHaveBeenCalledTimes(2)
  })

  it.each([true, false])('holds update events while config is pending, then resolves eligibility to %s', async (enabled) => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(undefined)
    analytics.captureAndroidUpdateCheck({ outcome: 'success', play_status: 2, available_version_code: 181,
      installed_version_code: 178, play_error_code: null })
    analytics.captureAndroidUpdateSheetShown({ sheet: 'available', available_version_code: 181, installed_version_code: 178 })
    expect(analytics.posthog!.capture).not.toHaveBeenCalled()
    await analytics.applyPostHogGate(enabled)
    expect(analytics.posthog!.capture).toHaveBeenCalledTimes(enabled ? 2 : 0)
    await analytics.applyPostHogGate(true)
    expect(analytics.posthog!.capture).toHaveBeenCalledTimes(enabled ? 2 : 0)
  })

  it('never replays update events captured under a known opt-out after opting in while config is pending', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    storage.getItem.mockResolvedValue('true')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(undefined)
    expect(await analytics.getAnalyticsOptOut()).toBe(true)
    analytics.captureAndroidUpdateCheck({ outcome: 'success', play_status: 2, available_version_code: 181,
      installed_version_code: 178, play_error_code: null })
    analytics.captureAndroidUpdateSheetShown({ sheet: 'available', available_version_code: 181, installed_version_code: 178 })
    await analytics.setAnalyticsOptOut(false)
    await analytics.applyPostHogGate(true)
    expect(analytics.posthog!.capture).not.toHaveBeenCalled()
  })

  it('discards events held before an opt out is chosen while config is pending', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(undefined)
    analytics.captureAndroidUpdateCheck({ outcome: 'success', play_status: 2, available_version_code: 181,
      installed_version_code: 178, play_error_code: null })
    await analytics.setAnalyticsOptOut(true)
    await analytics.setAnalyticsOptOut(false)
    await analytics.applyPostHogGate(true)
    expect(analytics.posthog!.capture).not.toHaveBeenCalled()
  })

  it.each(['true', 'failure'])('drops pending update events when the preference is %s', async (preference) => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    let resolvePreference!: (value: string | null) => void
    let rejectPreference!: (error: Error) => void
    storage.getItem.mockImplementation(() => new Promise((resolve, reject) => {
      resolvePreference = resolve
      rejectPreference = reject
    }))
    const analytics = await import('@/lib/posthog')
    const gate = analytics.applyPostHogGate(true)
    analytics.captureAndroidUpdateCheck({ outcome: 'success', play_status: 2, available_version_code: 181,
      installed_version_code: 178, play_error_code: null })
    analytics.captureAndroidUpdateSheetShown({ sheet: 'available', available_version_code: 181, installed_version_code: 178 })
    await vi.waitFor(() => expect(storage.getItem).toHaveBeenCalledOnce())
    if (preference === 'failure') rejectPreference(new Error('storage unavailable'))
    else resolvePreference(preference)
    await gate
    expect(analytics.posthog!.capture).not.toHaveBeenCalled()
    await analytics.setAnalyticsOptOut(false)
    expect(analytics.posthog!.capture).not.toHaveBeenCalled()
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

  it('defaults to opted out when reading the stored preference fails', async () => {
    vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'project-key')
    storage.getItem.mockRejectedValueOnce(new Error('storage unavailable'))
    const analytics = await import('@/lib/posthog')

    await expect(analytics.getAnalyticsOptOut()).resolves.toBe(true)
    await analytics.applyPostHogGate(true)
    expect(analytics.posthog!.optOut).toHaveBeenCalledOnce()
    expect(analytics.posthog!.optIn).not.toHaveBeenCalled()
    await analytics.setAnalyticsOptOut(false)
    expect(await analytics.getAnalyticsOptOut()).toBe(false)
    expect(analytics.posthog!.optIn).toHaveBeenCalledOnce()
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
