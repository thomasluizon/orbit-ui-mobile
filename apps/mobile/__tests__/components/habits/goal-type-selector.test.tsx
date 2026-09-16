import React, { useState } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoalType } from '@orbit/shared/types/goal'
import { GoalTypeSelector } from '@/components/habits/create-goal-from-habit/goal-type-selector'
import { createStyles } from '@/components/habits/create-goal-from-habit/styles'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setFocusImpl } from '../../../test-mocks/react-native'

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

  it('keeps one tab stop and moves selection and focus with radio keys', () => {
    const onChange = vi.fn()
    const focusedLabels: string[] = []
    __setFocusImpl((props) => focusedLabels.push(String(props.accessibilityLabel)))
    let tree: any
    void act(() => {
      tree = create(<Selector onChange={onChange} />)
    })
    const radios = (): any[] => tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )
    const preventDefault = vi.fn()

    expect(radios().map((option) => option.props.tabIndex)).toEqual([0, -1])
    void act(() => radios()[0]!.props.onKeyDown({ nativeEvent: { key: 'ArrowRight' }, preventDefault }))
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Streak')
    expect(focusedLabels.at(-1)).toBe('goals.form.typeStreak')
    void act(() => radios()[1]!.props.onKeyDown({ nativeEvent: { key: 'ArrowLeft' }, preventDefault }))
    expect(onChange).toHaveBeenLastCalledWith('Standard')
    expect(focusedLabels.at(-1)).toBe('goals.form.typeStandard')
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
