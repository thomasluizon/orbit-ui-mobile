import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: vi.fn(async () => false),
    addEventListener: vi.fn(() => ({
      remove: vi.fn(),
    })),
  },
  Platform: {
    OS: 'ios',
  },
}))

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  return {
    ...actual,
    AccessibilityInfo: mocks.AccessibilityInfo,
    Platform: mocks.Platform,
  }
})

describe('mobile motion helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.Platform.OS = 'ios'
    mocks.AccessibilityInfo.isReduceMotionEnabled.mockReset()
    mocks.AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(false)
    mocks.AccessibilityInfo.addEventListener.mockClear()
  })

  it('caches reduced motion preference lookups', async () => {
    const motion = await import('@/lib/motion')

    await motion.getPrefersReducedMotion()
    await motion.getPrefersReducedMotion()

    expect(mocks.AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1)
  })

  it('returns shorter route timings when reduced motion is enabled', async () => {
    const { resolveMotionPreset } = await import('@orbit/shared/theme')

    const reduced = resolveMotionPreset('route-push', true)
    const regular = resolveMotionPreset('route-push', false)

    expect(reduced.enterDuration).toBeLessThan(regular.enterDuration)
    expect(reduced.shift).toBe(0)
  })

  it('exposes shared orbital motion tokens to mobile consumers', async () => {
    const { mobileMotion } = await import('@/lib/motion')

    expect(mobileMotion.orbital.press.scale).toBeLessThan(1)
    expect(mobileMotion.orbital.list.staggerMs).toBeGreaterThan(0)
  })
})
