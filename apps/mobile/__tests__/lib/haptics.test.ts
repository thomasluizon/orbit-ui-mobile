import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  Platform: { OS: 'ios' },
  AccessibilityInfo: {
    isReduceMotionEnabled: vi.fn(async () => false),
  },
  Vibration: {
    vibrate: vi.fn(),
  },
}))

vi.mock('react-native', () => ({
  Platform: mocks.Platform,
  AccessibilityInfo: mocks.AccessibilityInfo,
  Vibration: mocks.Vibration,
}))

async function loadHapticsModule() {
  vi.resetModules()
  return import('@/lib/haptics')
}

describe('haptics', () => {
  beforeEach(() => {
    mocks.Platform.OS = 'ios'
    mocks.AccessibilityInfo.isReduceMotionEnabled.mockReset()
    mocks.AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(false)
    mocks.Vibration.vibrate.mockReset()
  })

  it('skips haptics entirely on web', async () => {
    mocks.Platform.OS = 'web'
    const { triggerHaptic } = await loadHapticsModule()

    await triggerHaptic('selection')

    expect(mocks.AccessibilityInfo.isReduceMotionEnabled).not.toHaveBeenCalled()
    expect(mocks.Vibration.vibrate).not.toHaveBeenCalled()
  })

  it('loads the accessibility preference once and uses the expected vibration durations', async () => {
    const { triggerHaptic } = await loadHapticsModule()

    await triggerHaptic('selection')
    await triggerHaptic('success')
    await triggerHaptic('warning')

    expect(mocks.AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1)
    expect(mocks.Vibration.vibrate.mock.calls).toEqual([[10], [18], [28]])
  })

  it('skips haptics when reduced motion is enabled', async () => {
    mocks.AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true)
    const { triggerHaptic } = await loadHapticsModule()

    await triggerHaptic('selection')

    expect(mocks.Vibration.vibrate).not.toHaveBeenCalled()
  })

  it('swallows accessibility and vibration errors', async () => {
    mocks.AccessibilityInfo.isReduceMotionEnabled.mockRejectedValueOnce(new Error('no access'))
    mocks.Vibration.vibrate.mockImplementationOnce(() => {
      throw new Error('unsupported')
    })
    const { triggerHaptic } = await loadHapticsModule()

    await expect(triggerHaptic('selection')).resolves.toBeUndefined()
    expect(mocks.Vibration.vibrate).toHaveBeenCalledWith(10)
  })
})
