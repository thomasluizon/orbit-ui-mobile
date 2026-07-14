import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BufferedSheetInput } from '@/components/habits/habit-form-fields/buffered-sheet-input'

vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) =>
    React.createElement('TextInput', props),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
interface TestTree {
  root: TestNode
  update(element: React.ReactNode): void
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

function input(tree: TestTree): TestNode {
  return tree.root.findAll((node) => node.type === 'TextInput')[0]!
}

function render(element: React.ReactNode): TestTree {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

describe('BufferedSheetInput', () => {
  it('seeds the draft from the initial value', () => {
    const tree = render(<BufferedSheetInput value="hello" onCommit={vi.fn()} />)
    expect(input(tree).props.value).toBe('hello')
  })

  it('updates the draft locally and reports draft changes', () => {
    const onDraftChange = vi.fn()
    const tree = render(
      <BufferedSheetInput value="" onCommit={vi.fn()} onDraftChange={onDraftChange} />,
    )
    TestRenderer.act(() => {
      ;(input(tree).props as { onChangeText: (value: string) => void }).onChangeText('typed')
    })
    expect(input(tree).props.value).toBe('typed')
    expect(onDraftChange).toHaveBeenCalledWith('typed')
  })

  it('applies the draft transform before storing', () => {
    const tree = render(
      <BufferedSheetInput
        value=""
        onCommit={vi.fn()}
        transformDraft={(value) => value.toUpperCase()}
      />,
    )
    TestRenderer.act(() => {
      ;(input(tree).props as { onChangeText: (value: string) => void }).onChangeText('abc')
    })
    expect(input(tree).props.value).toBe('ABC')
  })

  it('commits the draft on blur only when it differs from the value', () => {
    const onCommit = vi.fn()
    const onBlur = vi.fn()
    const tree = render(<BufferedSheetInput value="a" onCommit={onCommit} onBlur={onBlur} />)
    TestRenderer.act(() => {
      ;(input(tree).props as { onChangeText: (value: string) => void }).onChangeText('ab')
    })
    TestRenderer.act(() => {
      ;(input(tree).props as { onBlur: () => void }).onBlur()
    })
    expect(onCommit).toHaveBeenCalledWith('ab')
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('does not commit when the draft equals the value', () => {
    const onCommit = vi.fn()
    const tree = render(<BufferedSheetInput value="a" onCommit={onCommit} />)
    TestRenderer.act(() => {
      ;(input(tree).props as { onEndEditing: () => void }).onEndEditing()
    })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits and forwards submit editing', () => {
    const onCommit = vi.fn()
    const onSubmitEditing = vi.fn()
    const tree = render(
      <BufferedSheetInput value="a" onCommit={onCommit} onSubmitEditing={onSubmitEditing} />,
    )
    TestRenderer.act(() => {
      ;(input(tree).props as { onChangeText: (value: string) => void }).onChangeText('changed')
    })
    TestRenderer.act(() => {
      ;(input(tree).props as { onSubmitEditing: () => void }).onSubmitEditing()
    })
    expect(onCommit).toHaveBeenCalledWith('changed')
    expect(onSubmitEditing).toHaveBeenCalledTimes(1)
  })

  it('syncs an external value change while unfocused', () => {
    const tree = render(<BufferedSheetInput value="a" onCommit={vi.fn()} />)
    TestRenderer.act(() => {
      tree.update(<BufferedSheetInput value="external" onCommit={vi.fn()} />)
    })
    expect(input(tree).props.value).toBe('external')
  })

  it('preserves the in-progress draft when focused during an external value change', () => {
    const tree = render(<BufferedSheetInput value="a" onCommit={vi.fn()} />)
    TestRenderer.act(() => {
      ;(input(tree).props as { onFocus: () => void }).onFocus()
    })
    TestRenderer.act(() => {
      ;(input(tree).props as { onChangeText: (value: string) => void }).onChangeText('mine')
    })
    TestRenderer.act(() => {
      tree.update(<BufferedSheetInput value="external" onCommit={vi.fn()} />)
    })
    expect(input(tree).props.value).toBe('mine')
  })

  it('registers a flush handle and unregisters it on unmount', () => {
    const unregister = vi.fn()
    const registerFlush = vi.fn(() => unregister)
    const tree = render(
      <BufferedSheetInput value="a" onCommit={vi.fn()} registerFlush={registerFlush} />,
    )
    expect(registerFlush).toHaveBeenCalledWith(expect.any(Function))
    TestRenderer.act(() => {
      tree.update(<React.Fragment />)
    })
    expect(unregister).toHaveBeenCalled()
  })
})
