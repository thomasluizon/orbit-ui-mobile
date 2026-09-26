import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'

interface RenderedInput {
  props: {
    onChangeText: (value: string) => void
    onFocus: (event: unknown) => void
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
