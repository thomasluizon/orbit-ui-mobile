import React, { useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { ScrollView, StyleSheet, TextInput, type StyleProp, type ViewStyle } from 'react-native'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { Select } from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'
import { __emitKeyboardEvent, __focusHost, __resetTestHostConfig, __setTouchMode } from '../../../test-mocks/react-native'

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{ children?: React.ReactNode; footer?: React.ReactNode }> {
    present = () => Promise.resolve()
    dismiss = () => Promise.resolve()
    render() { return <>{this.props.children}{this.props.footer}</> }
  },
}))

const options = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Charlie', disabled: true }]
function Example({ onChange, disabled = false }: Readonly<{ onChange: (value: string) => void; disabled?: boolean }>) {
  const [value, setValue] = useState('a')
  const [count, setCount] = useState('')
  return <Sheet open title="Reminders"><TextInput accessibilityLabel="Count" value={count} onChangeText={setCount} />
    <Select label="Units" value={value} disabled={disabled} options={options} onChange={(next) => { setValue(next); onChange(next) }} />
  </Sheet>
}
function hosts(tree: ReactTestRenderer) { return tree.root.findAll((node) => typeof node.type === 'string') }

describe('native Select in the form sheet', () => {
  beforeEach(__resetTestHostConfig)
  it('opens on the first press while editing and commits after native dismissal', async () => {
    const onChange = vi.fn()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<Example onChange={onChange} />) })
    try {
      const field = hosts(tree).find((node) => node.props.accessibilityLabel === 'Count')!
      await act(() => {
        __focusHost(field.props.__nativeTag as number)
        ;(field.props.onChangeText as (value: string) => void)('2')
        __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      })
      expect(tree.root.findAll((node) => node.type === ScrollView).some((node) => node.props.keyboardShouldPersistTaps === 'handled')).toBe(true)
      const trigger = () => hosts(tree).find((node) => node.props.role === 'combobox')!
      expect(trigger().props.accessibilityValue).toEqual({ text: 'Alpha' })
      await act(() => (trigger().props.onPress as () => void)())
      expect(tree.root.findAll((node) => node.type === TrueSheet)).toHaveLength(2)
      const choices = hosts(tree).filter((node) => node.props.role === 'option')
      expect(choices.map((node) => node.props.focusable)).toEqual([true, true, false])
      expect(choices[0]!.props.accessibilityState).toMatchObject({ selected: true })
      expect(choices[2]!.props.accessibilityState).toMatchObject({ disabled: true })
      await act(() => (choices[1]!.props.onPress as () => void)())
      expect(onChange).not.toHaveBeenCalled()
      expect(tree.root.findAll((node) => node.type === TrueSheet)).toHaveLength(2)
      await act(() => (tree.root.findAll((node) => node.type === TrueSheet)[1]!.props.onDidDismiss as () => void)())
      expect(onChange).toHaveBeenCalledExactlyOnceWith('b')
      expect(trigger().props.accessibilityValue).toEqual({ text: 'Beta' })
      expect(tree.root.findAll((node) => node.type === TrueSheet)).toHaveLength(1)
    } finally { await act(() => tree.update(<></>)) }
  })

  it('leaves the value unchanged when the sheet is dismissed without choosing', async () => {
    const onChange = vi.fn()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<Example onChange={onChange} />) })
    try {
      await act(() => (hosts(tree).find((node) => node.props.role === 'combobox')!.props.onPress as () => void)())
      await act(() => (tree.root.findAll((node) => node.type === TrueSheet)[1]!.props.onDidDismiss as () => void)())
      expect(onChange).not.toHaveBeenCalled()
      expect(hosts(tree).find((node) => node.props.role === 'combobox')!.props.accessibilityValue).toEqual({ text: 'Alpha' })
    } finally { await act(() => tree.update(<></>)) }
  })

  it('blocks a disabled trigger', async () => {
    const onChange = vi.fn()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<Example onChange={onChange} disabled />) })
    try {
      const trigger = hosts(tree).find((node) => node.props.role === 'combobox')!
      expect(trigger.props.disabled).toBe(true)
      await act(() => (trigger.props.onPress as () => void)())
      expect(tree.root.findAll((node) => node.type === TrueSheet)).toHaveLength(1)
      expect(onChange).not.toHaveBeenCalled()
    } finally { await act(() => tree.update(<></>)) }
  })
})

it('paints native select hover and focus on both trigger and option', async () => {
  const tokens = createTokensV2('orange', 'dark')
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<Example onChange={vi.fn()} />) })
  const paint = (node: ReturnType<typeof hosts>[number]) => StyleSheet.flatten((node.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>)({ pressed: false }))
  try {
    const trigger = hosts(tree).find((node) => node.props.role === 'combobox')!
    await act(() => (trigger.props.onHoverIn as (() => void) | undefined)?.())
    expect(paint(trigger).backgroundColor).toBe(tokens.bgHover)
    await act(() => (trigger.props.onHoverOut as (() => void) | undefined)?.())
    expect(paint(trigger).backgroundColor).toBe(tokens.bgField)
    await act(() => (trigger.props.onPress as () => void)())
    const option = hosts(tree).find((node) => node.props.role === 'option' && node.props.accessibilityLabel === 'Beta')!
    await act(() => (option.props.onHoverIn as (() => void) | undefined)?.())
    expect(paint(option).backgroundColor).toBe(tokens.bgHover)
    await act(() => { __setTouchMode(false); __focusHost(option.props.__nativeTag as number) })
    expect(hosts(tree).some((node) => (node.type as unknown) === 'View' && StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>).outlineWidth === 2)).toBe(true)
  } finally { await act(() => tree.update(<></>)) }
})
