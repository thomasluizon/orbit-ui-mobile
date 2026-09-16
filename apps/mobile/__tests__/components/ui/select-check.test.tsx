import React, { useState } from 'react'
import { Pressable } from 'react-native'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { __resetTestHostConfig, __setFocusImpl } from '../../../test-mocks/react-native'

function RadioRows({ onChange }: Readonly<{ onChange: (value: string) => void }>) {
  const [value, setValue] = useState('first')
  const select = (nextValue: string) => {
    setValue(nextValue)
    onChange(nextValue)
  }

  return (
    <RadioGroup accessibilityLabel="Cadence">
      <RadioRow label="First" selected={value === 'first'} onPress={() => select('first')} />
      <RadioRow label="Disabled" selected={false} disabled onPress={() => select('disabled')} />
      <RadioRow label="Third" selected={value === 'third'} onPress={() => select('third')} />
      <RadioRow label="Last" selected={value === 'last'} onPress={() => select('last')} />
    </RadioGroup>
  )
}

function keyDown(node: any, key: string) {
  const preventDefault = vi.fn()
  void act(() => node.props.onKeyDown({ nativeEvent: { key }, preventDefault }))
  expect(preventDefault).toHaveBeenCalledOnce()
}

describe('select-check RadioRow group', () => {
  beforeEach(() => {
    __resetTestHostConfig()
  })

  it('keeps one tab stop, skips disabled rows, wraps, and follows selection with focus', () => {
    const onChange = vi.fn()
    const focusedLabels: string[] = []
    __setFocusImpl((props) => focusedLabels.push(String(props.accessibilityLabel)))
    let tree: any
    void act(() => {
      tree = create(<RadioRows onChange={onChange} />)
    })
    const radios = () => tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    expect(radios().map((option: any) => option.props.tabIndex)).toEqual([0, -1, -1, -1])
    keyDown(radios()[0], 'ArrowDown')
    expect(onChange).toHaveBeenLastCalledWith('third')
    expect(focusedLabels.at(-1)).toBe('Third')
    keyDown(radios()[2], 'End')
    expect(onChange).toHaveBeenLastCalledWith('last')
    expect(focusedLabels.at(-1)).toBe('Last')
    keyDown(radios()[3], 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith('first')
    expect(focusedLabels.at(-1)).toBe('First')
    keyDown(radios()[0], 'ArrowUp')
    expect(onChange).toHaveBeenLastCalledWith('last')
    expect(focusedLabels.at(-1)).toBe('Last')
  })

  it('keeps touch selection unchanged and blocks disabled rows', () => {
    const onChange = vi.fn()
    let tree: any
    void act(() => {
      tree = create(<RadioRows onChange={onChange} />)
    })
    const controls = tree.root.findAllByType(Pressable)
    void act(() => controls[2].props.onPress())
    expect(onChange).toHaveBeenCalledExactlyOnceWith('third')
    expect(controls[1].props.onPress).toBeUndefined()
  })
})
