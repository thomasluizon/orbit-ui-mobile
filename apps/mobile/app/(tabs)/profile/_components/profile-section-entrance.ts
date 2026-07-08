import { FadeInDown, ReduceMotion } from 'react-native-reanimated'

/** Staggered fade-in for profile sections, keyed by vertical index. */
export function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
    .reduceMotion(ReduceMotion.System)
}
