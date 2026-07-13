import { describe, it, expect } from 'vitest'
import type { ViewStyle } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { createDrawerStyles } from '@/components/habits/habit-detail-drawer/styles'
import { createStyles as createGoalDrawerStyles } from '@/components/goals/goal-detail-drawer/styles'

const tokens = createTokensV2('purple', 'dark')

describe('detail-drawer Ask-Astra divider (#447 Bug 4)', () => {
  it('habit drawer Ask-Astra carries no top-border divider', () => {
    const askAstra: ViewStyle = createDrawerStyles(tokens).askAstra
    expect(askAstra.borderTopColor).toBeUndefined()
    expect(askAstra.borderTopWidth).toBeUndefined()
    expect(askAstra.marginTop).toBe(8)
  })

  it('goal drawer Ask-Astra carries no top-border divider', () => {
    const askAstra: ViewStyle = createGoalDrawerStyles(tokens, 0).askAstra
    expect(askAstra.borderTopColor).toBeUndefined()
    expect(askAstra.borderTopWidth).toBeUndefined()
    expect(askAstra.marginTop).toBe(8)
  })
})
