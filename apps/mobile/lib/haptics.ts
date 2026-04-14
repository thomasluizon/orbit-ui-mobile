import { AccessibilityInfo, Platform, Vibration } from 'react-native'

type HapticFeedbackType = 'selection' | 'success' | 'warning'

let prefersReducedMotion = false
let hasLoadedAccessibilityPreference = false

async function shouldSkipHaptics(): Promise<boolean> {
  if (Platform.OS === 'web') return true

  if (!hasLoadedAccessibilityPreference) {
    try {
      prefersReducedMotion = await AccessibilityInfo.isReduceMotionEnabled()
    } catch {
      prefersReducedMotion = false
    } finally {
      hasLoadedAccessibilityPreference = true
    }
  }

  return prefersReducedMotion
}

function getDuration(type: HapticFeedbackType): number {
  switch (type) {
    case 'success':
      return 18
    case 'warning':
      return 28
    default:
      return 10
  }
}

export async function triggerHaptic(type: HapticFeedbackType): Promise<void> {
  if (await shouldSkipHaptics()) return

  try {
    Vibration.vibrate(getDuration(type))
  } catch {
    // Best-effort only. Ignore unsupported environments.
  }
}
