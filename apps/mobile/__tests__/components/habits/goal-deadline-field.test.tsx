import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { GoalDeadlineField } from '@/components/habits/create-goal-from-habit/goal-deadline-field'
import { createStyles } from '@/components/habits/create-goal-from-habit/styles'
import { X } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/components/ui/date-field', () => ({ DateField: () => null }))

describe('goal deadline removal graphic', () => {
  it('uses the approved graphic role on the sheet surface', () => {
    const tokens = createTokensV2('purple', 'dark')
    let tree!: { root: { findByType: (type: typeof X) => { props: { color: string } } } }
    void act(() => {
      tree = create(
        <GoalDeadlineField
          tokens={tokens}
          styles={createStyles(tokens, 0)}
          deadline="2025-06-15"
          onChangeDeadline={vi.fn()}
        />,
      ) as unknown as typeof tree
    })

    expect(tree.root.findByType(X).props.color).toBe(tokens.fg3)
  })
})
