import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import {
  buildGoalTitle,
  isGoalDeadlinePast,
  parseGoalTargetValue,
} from '@orbit/shared/utils/goal-form'
import { EditGoalDeadlineField } from '@/components/goals/edit-goal-modal/edit-goal-deadline-field'
import { createStyles } from '@/components/goals/edit-goal-modal/styles'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/components/ui/date-field', () => ({
  DateField: () => React.createElement('DateField'),
}))

describe('EditGoalModal helpers', () => {
  it('keeps the written description when editing a goal', () => {
    expect(buildGoalTitle('Run daily', '12', 'km')).toBe('Run daily')
  })

  it('normalizes edited numeric values', () => {
    expect(parseGoalTargetValue('12')).toBe(12)
    expect(parseGoalTargetValue(' 12 ')).toBe(12)
  })

  it('treats future deadlines as valid', () => {
    expect(isGoalDeadlinePast('2025-06-16', '2025-06-15')).toBe(false)
  })

  it.each(['dark', 'light'] as const)('keeps the remove-deadline graphic visible on the sheet in %s', (mode) => {
    const tokens = createTokensV2('purple', mode)
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <EditGoalDeadlineField
          tokens={tokens}
          styles={createStyles(tokens, 0)}
          deadline="2026-10-01"
          onChangeDeadline={vi.fn()}
        />,
      )
    })
    const removeIcon = tree!.root.findByType('X')

    expect(contrastOnSurface(removeIcon.props.color as string, [tokens.bgElev]))
      .toBeGreaterThanOrEqual(3)
  })
})
