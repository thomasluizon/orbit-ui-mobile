import { useMemo } from 'react'
import { Easing, Keyframe, LinearTransition } from 'react-native-reanimated'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

/** A row the person adds enters with `list-enter`; a row the person removes leaves with `list-exit` and the gap closes. Under reduced motion both are a short fade with no travel and the gap closes at once. */
export function useListRowMotion() {
  const reduced = usePrefersReducedMotion()
  return useMemo(() => {
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
}
