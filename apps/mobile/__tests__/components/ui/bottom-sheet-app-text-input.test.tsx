import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { StyleSheet, type TextStyle } from 'react-native'
import { createTokensV2 } from '@/lib/theme'

import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'

interface RenderedInput {
  props: {
    onChangeText: (value: string) => void
    onFocus: (event: unknown) => void
    onBlur: (event: unknown) => void
    style: unknown
    value: string
  }
}

interface RenderedTree {
  root: {
    findByType: (type: string) => RenderedInput
  }
  update: (element: ReactElement) => void
}

const TestRenderer: {
  act: (callback: () => void) => void
  create: (element: ReactElement) => RenderedTree
} = require('react-test-renderer')

function renderInput(value: string, onChangeText = vi.fn()) {
  let tree: RenderedTree | undefined

  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <BottomSheetAppTextInput value={value} onChangeText={onChangeText} />,
    )
  })

  return {
    get tree() {
      if (!tree) throw new Error('Input did not render')
      return tree
    },
    update(nextValue: string) {
      TestRenderer.act(() => {
        tree?.update(
          <BottomSheetAppTextInput
            value={nextValue}
            onChangeText={onChangeText}
          />,
        )
      })
    },
  }
}

describe('BottomSheetAppTextInput', () => {
  it('replaces a caller border while focused and preserves caller spacing', () => {
    let tree!: RenderedTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <BottomSheetAppTextInput value="" style={{ borderWidth: 0, borderColor: 'transparent', paddingHorizontal: 8 }} />,
      )
    })
    const input = () => tree.root.findByType('TextInput')
    const rest = StyleSheet.flatten(input().props.style as TextStyle)
    expect(rest.borderWidth).toBe(0)
    expect(rest.paddingHorizontal).toBe(8)

    TestRenderer.act(() => input().props.onFocus({}))
    expect(StyleSheet.flatten(input().props.style as TextStyle)).toMatchObject({
      borderWidth: 2,
      borderColor: createTokensV2('orange', 'light').primary,
      paddingHorizontal: 8,
    })

    TestRenderer.act(() => input().props.onBlur({}))
    expect(StyleSheet.flatten(input().props.style as TextStyle).borderWidth).toBe(0)
  })

  it('lets a parent field own the focus border', () => {
    let tree!: RenderedTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <BottomSheetAppTextInput value="" focusBorder={false} style={{ borderWidth: 0 }} />,
      )
    })
    const input = () => tree.root.findByType('TextInput')
    TestRenderer.act(() => input().props.onFocus({}))
    expect(StyleSheet.flatten(input().props.style as TextStyle).borderWidth).toBe(0)
  })

  it('closes caller-specific border gaps while focused', () => {
    let tree!: RenderedTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <BottomSheetAppTextInput value="" style={{ borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: 'transparent' }} />,
      )
    })
    const input = () => tree.root.findByType('TextInput')
    TestRenderer.act(() => input().props.onFocus({}))
    expect(StyleSheet.flatten(input().props.style as TextStyle)).toMatchObject({
      borderRightWidth: 2,
      borderBottomWidth: 2,
      borderBottomColor: createTokensV2('orange', 'light').primary,
    })
  })

  it('accepts a parent clear while focused', () => {
    const input = renderInput('Checklist item')

    TestRenderer.act(() => {
      input.tree.root.findByType('TextInput').props.onFocus({})
    })
    input.update('')

    expect(input.tree.root.findByType('TextInput').props.value).toBe('')
  })

  it('keeps a keystroke when the parent echoes the emitted value', () => {
    function EchoingInput() {
      const [value, setValue] = useState('')
      return (
        <BottomSheetAppTextInput value={value} onChangeText={setValue} />
      )
    }

    let tree: RenderedTree | undefined
    TestRenderer.act(() => {
      tree = TestRenderer.create(<EchoingInput />)
    })
    if (!tree) throw new Error('Input did not render')

    const nativeInput = tree.root.findByType('TextInput')
    TestRenderer.act(() => {
      nativeInput.props.onFocus({})
      nativeInput.props.onChangeText('rapid typing')
    })

    expect(tree.root.findByType('TextInput').props.value).toBe('rapid typing')
  })
})
