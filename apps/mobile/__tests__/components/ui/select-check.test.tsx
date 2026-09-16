import React, { useState } from 'react'
import { Pressable } from 'react-native'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { __resetTestHostConfig } from '../../../test-mocks/react-native'

function RadioRows({ onChange }: Readonly<{ onChange: (value: string) => void }>) {
  const [value, setValue] = useState('first')
  const select = (nextValue: string) => {
    setValue(nextValue)
    onChange(nextValue)
  }

  return (
    <RadioGroup accessibilityLabel="Cadence">
      <RadioRow index={0} label="First" selected={value === 'first'} onPress={() => select('first')} />
      <RadioRow index={1} label="Disabled" selected={false} disabled onPress={() => select('disabled')} />
      <RadioRow index={2} label="Third" selected={value === 'third'} onPress={() => select('third')} />
      <RadioRow index={3} label="Last" selected={value === 'last'} onPress={() => select('last')} />
    </RadioGroup>
  )
}

describe('select-check RadioRow group', () => {
  beforeEach(() => {
    __resetTestHostConfig()
  })

  it('routes native focus around enabled rows, wraps, and selects the focused row', () => {
    const onChange = vi.fn()
    let tree: any
    void act(() => {
      tree = create(<RadioRows onChange={onChange} />)
    })
    const radios = () => tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    const options = radios()
    const handles = options.map((option: any) => option.props.__nativeTag)
    const [first, , third, last] = options
    const forwardTarget = tree.root.find(
      (node: any) => typeof node.type === 'string'
        && node.props.testID === 'radio-group-forward-target',
    )

    expect(options.map((option: any) => option.props.focusable)).toEqual([true, false, true, true])
    expect(handles.every((handle: unknown) => typeof handle === 'number')).toBe(true)
    expect(first.props.nextFocusUp).toBe(handles[3])
    expect(first.props.nextFocusDown).toBe(handles[2])
    expect(first.props.nextFocusLeft).toBe(handles[3])
    expect(first.props.nextFocusRight).toBe(handles[2])
    expect(third.props.nextFocusUp).toBe(handles[0])
    expect(third.props.nextFocusDown).toBe(handles[3])
    expect(last.props.nextFocusUp).toBe(handles[2])
    expect(last.props.nextFocusDown).toBe(handles[0])
    expect(options.filter((option: any) => !option.props.accessibilityState.disabled)
      .map((option: any) => option.props.nextFocusForward))
      .toEqual([
        forwardTarget.props.__nativeTag,
        forwardTarget.props.__nativeTag,
        forwardTarget.props.__nativeTag,
      ])
    expect(options.every((option: any) => option.props.onKeyDown === undefined)).toBe(true)

    void act(() => third.props.onFocus())
    expect(onChange).toHaveBeenCalledExactlyOnceWith('third')
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
