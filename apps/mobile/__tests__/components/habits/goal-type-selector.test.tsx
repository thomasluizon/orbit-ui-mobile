import React, { useState } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoalType } from '@orbit/shared/types/goal'
import { GoalTypeSelector } from '@/components/habits/create-goal-from-habit/goal-type-selector'
import { createStyles } from '@/components/habits/create-goal-from-habit/styles'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig } from '../../../test-mocks/react-native'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const tokens = createTokensV2('purple', 'dark')
const styles = createStyles(tokens, 0)

function Selector({ onChange }: Readonly<{ onChange: (value: GoalType) => void }>) {
  const [value, setValue] = useState<GoalType>('Standard')
  return (
    <GoalTypeSelector
      tokens={tokens}
      styles={styles}
      goalType={value}
      onTypeChange={(nextValue) => {
        setValue(nextValue)
        onChange(nextValue)
      }}
    />
  )
}

describe('GoalTypeSelector', () => {
  beforeEach(() => {
    __resetTestHostConfig()
  })

  it('selects the option reached by native focus', () => {
    const onChange = vi.fn()
    let tree: any
    void act(() => {
      tree = create(<Selector onChange={onChange} />)
    })
    const radios = (): any[] => tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )
    expect(radios().map((option) => option.props.focusable)).toEqual([true, true])
    void act(() => radios()[1]!.props.onFocus())
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Streak')
    void act(() => radios()[0]!.props.onFocus())
    expect(onChange).toHaveBeenLastCalledWith('Standard')
  })

  it('keeps touch selection unchanged', () => {
    const onChange = vi.fn()
    let tree: any
    void act(() => {
      tree = create(<Selector onChange={onChange} />)
    })
    const streak = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )[1]!
    void act(() => streak.props.onPress())
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Streak')
  })
})
