import { describe, expect, it } from 'vitest'
import { ReduceMotion } from 'react-native-reanimated'
import { createListCellMotion } from '@/lib/list-motion'
import { motionSprings } from '@orbit/shared/theme'

describe('list motion', () => {
  it('keeps drag settlement bounded and honours reduced motion', () => {
    expect(createListCellMotion(false).animationConfig).toEqual({ ...motionSprings.soft, overshootClamping: true, reduceMotion: ReduceMotion.System })
    expect(createListCellMotion(true).animationConfig).toEqual({ ...motionSprings.soft, overshootClamping: true, reduceMotion: ReduceMotion.Always })
  })

  it.each([false, true])('keeps virtualized cells out of mount animations (reduced: %s)', (reduced) => {
    const motion = createListCellMotion(reduced)
    expect(motion).not.toHaveProperty('itemEnteringAnimation')
    expect(motion).not.toHaveProperty('itemExitingAnimation')
    expect(motion).not.toHaveProperty('itemLayoutAnimation')
    expect(motion).not.toHaveProperty('enableLayoutAnimationExperimental')
  })
})
