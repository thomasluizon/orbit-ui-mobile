import { ReduceMotion } from 'react-native-reanimated'
import { motionSprings } from '@orbit/shared/theme'

export function createListCellMotion(reduced: boolean) {
  return {
    animationConfig: { ...motionSprings.soft, overshootClamping: true, reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.System },
  }
}
