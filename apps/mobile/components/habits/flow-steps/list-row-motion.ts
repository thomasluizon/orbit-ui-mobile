import { useMemo, useState } from 'react'
import { Easing, Keyframe, LinearTransition } from 'react-native-reanimated'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

/**
 * A row the person adds enters with `list-enter`; a row the person removes leaves with `list-exit` and the gap closes.
 * The rows already there when the list shows (`ready`) stay still, as web's presence with no initial animation does:
 * `enteringFor` gives an entrance only to a key added after that. Under reduced motion both are a short fade with no
 * travel and the gap closes at once.
 */
export function useListRowMotion(keys: readonly string[], ready = true) {
  const reduced = usePrefersReducedMotion()
  const [shownKeys, setShownKeys] = useState<ReadonlySet<string> | null>(() => (ready ? new Set(keys) : null))
  if (shownKeys === null && ready) setShownKeys(new Set(keys))
  const motion = useMemo(() => {
    const enter = resolveMotionPreset('list-enter', reduced)
    const exit = resolveMotionPreset('list-exit', reduced)
    return {
      entering: new Keyframe({
        0: { opacity: 0, transform: [{ translateY: enter.shift }] },
        100: { opacity: 1, transform: [{ translateY: 0 }], easing: Easing.bezier(...enter.enterEasing) },
      }).duration(enter.enterDuration),
      exiting: new Keyframe({
        0: { opacity: 1, transform: [{ translateY: 0 }] },
        100: { opacity: 0, transform: [{ translateY: exit.shift }], easing: Easing.bezier(...exit.exitEasing) },
      }).duration(exit.exitDuration),
      layout: reduced ? undefined : LinearTransition.duration(exit.exitDuration),
    }
  }, [reduced])
  return {
    enteringFor: (key: string) => (shownKeys === null || shownKeys.has(key) ? undefined : motion.entering),
    exiting: motion.exiting,
    layout: motion.layout,
  }
}
