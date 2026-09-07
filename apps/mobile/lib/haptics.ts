import { Platform, Vibration } from 'react-native'
import { getPrefersReducedMotion } from '@/lib/motion'

type HapticFeedbackType = 'selection' | 'success' | 'warning'

async function shouldSkipHaptics(): Promise<boolean> {
  if (Platform.OS === 'web') return true
  return getPrefersReducedMotion()
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
