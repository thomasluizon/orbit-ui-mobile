import React, { useState } from 'react'
import { Pressable } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import {
  __resetTestHostConfig,
  __setFocusImpl,
} from '../../../test-mocks/react-native'

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

function FocusEntryRows({
  initialValue = 'second',
  onChange,
}: Readonly<{
  initialValue?: string | null
  onChange: (value: string) => void
}>) {
  const [value, setValue] = useState<string | null>(initialValue)
  const select = (nextValue: string) => {
    setValue(nextValue)
    onChange(nextValue)
  }

  return (
    <RadioGroup accessibilityLabel="Entry">
      <RadioRow index={0} label="First" selected={value === 'first'} onPress={() => select('first')} />
      <RadioRow index={1} label="Second" selected={value === 'second'} onPress={() => select('second')} />
      <RadioRow index={2} label="Third" selected={value === 'third'} onPress={() => select('third')} />
    </RadioGroup>
  )
}

function renderEntryRows(onChange: (value: string) => void, initialValue?: string | null) {
  let tree: any
  void act(() => {
    tree = create(<FocusEntryRows initialValue={initialValue} onChange={onChange} />)
  })
  return tree.root.findAll(
    (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
  )
}

describe('select-check RadioRow group', () => {
  beforeEach(() => {
    __resetTestHostConfig()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('redirects initial entry to the checked row without changing selection', () => {
    const onChange = vi.fn()
    const focusedLabels: unknown[] = []
    __setFocusImpl((props) => focusedLabels.push(props.accessibilityLabel))
    const [first] = renderEntryRows(onChange)

    void act(() => first.props.onFocus())

    expect(onChange).not.toHaveBeenCalled()
    expect(focusedLabels).toEqual(['Second'])
  })

  it('selects a new row when focus moves inside the group', () => {
    const onChange = vi.fn()
    const [first, second] = renderEntryRows(onChange)

    void act(() => second.props.onFocus())
    void act(() => first.props.onFocus())

    expect(onChange).toHaveBeenCalledExactlyOnceWith('first')
  })

  it('treats focus as entry again after focus leaves the group', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const [first, second] = renderEntryRows(onChange)

    void act(() => second.props.onFocus())
    void act(() => second.props.onBlur())
    void act(() => {
      vi.runAllTimers()
    })
    void act(() => first.props.onFocus())

    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves initial focus in place when no row is checked', () => {
    const onChange = vi.fn()
    const focus = vi.fn()
    __setFocusImpl(focus)
    const [first] = renderEntryRows(onChange, null)

    void act(() => first.props.onFocus())

    expect(onChange).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
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
    expect(options.every((option: any) => option.props.nextFocusForward === undefined)).toBe(true)
    expect(options.every((option: any) => option.props.onKeyDown === undefined)).toBe(true)

    void act(() => first.props.onFocus())
    void act(() => third.props.onFocus())
    expect(onChange).toHaveBeenCalledExactlyOnceWith('third')
  })

  it('renders no empty focusable target alongside the visible radio options', () => {
    let tree: any
    void act(() => {
      tree = create(<RadioRows onChange={vi.fn()} />)
    })

    const emptyFocusableHosts = tree.root.findAll(
      (node: any) => typeof node.type === 'string'
        && node.props.focusable === true
        && node.children.length === 0,
    )

    expect(emptyFocusableHosts).toEqual([])
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
