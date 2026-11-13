import { Text } from 'react-native'
import { Easing } from 'react-native-reanimated'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentFade } from '@/components/motion/content-fade'
import { withTimingCalls } from '@/test-mocks/react-native-reanimated'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => motion.reduced }))

const TestRenderer = require('react-test-renderer')

afterEach(() => {
  motion.reduced = false
  withTimingCalls.length = 0
  vi.restoreAllMocks()
})

describe('ContentFade', () => {
  it('fades the content in over the press duration on the standard curve, as the web content fade does', () => {
    const bezier = vi.spyOn(Easing, 'bezier')
    TestRenderer.act(() => { TestRenderer.create(<ContentFade><Text>Hoje</Text></ContentFade>) })
    expect(withTimingCalls.at(-1)).toMatchObject({ value: 1, config: { duration: motionDurations.press } })
    expect(bezier).toHaveBeenCalledWith(...motionEasings.standard)
  })

  it('shows the content at once under reduced motion', () => {
    motion.reduced = true
    TestRenderer.act(() => { TestRenderer.create(<ContentFade><Text>Hoje</Text></ContentFade>) })
    expect(withTimingCalls.at(-1)).toMatchObject({ value: 1, config: { duration: 0 } })
  })
})
