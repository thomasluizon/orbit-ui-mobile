import { radius, createTokensV2 } from '@/lib/theme'
import React from 'react'
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { controlStyle, expectPressFill } from '../../../support/press-feedback'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

vi.mock('@/components/ui/pill-button', async (importOriginal) => ({ ...await importOriginal<object>(), waitingFaceStyle: () => ({ backgroundColor: '#123456' }), waitingTextColor: () => '#654321' }))
vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({ BottomSheetAppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props) }))

describe('tag editor press fills', () => {
  it('fills the primary commit and neutral cancel controls', () => {
    const tokens = createTokensV2()
    let tree!: import('react-test-renderer').ReactTestRenderer
    void renderer.act(() => { tree = renderer.create(<TagEditorRow value="Health" inputAriaLabel="Tag" actionLabel="Save" cancelAriaLabel="Cancel" disabled={false} onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} styles={createStyles(tokens)} tokens={tokens} />) })
    expectPressFill(tree, 'Save', tokens.primaryPressed, radius.full)
    expectPressFill(tree, 'Cancel', tokens.bgHover, radius.full)
    void renderer.act(() => tree.update(<></>))
  })

  it('announces server validation beside the editable tag input', () => {
    const tokens = createTokensV2()
    let tree!: import('react-test-renderer').ReactTestRenderer
    void renderer.act(() => { tree = renderer.create(<TagEditorRow error="Tag must have at most 50 characters" value="Health" inputAriaLabel="Tag" actionLabel="Save" cancelAriaLabel="Cancel" disabled={false} onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} styles={createStyles(tokens)} tokens={tokens} />) })
    const input = tree.root.findAll((node) => node.props.accessibilityLabel === 'Tag')[0]!
    expect(input.props.accessibilityHint).toBe('Tag must have at most 50 characters')
    expect(input.props.value).toBe('Health')
    const caption = tree.root.findAll((node) => String(node.type) === 'Text').find((node) => node.props.children === 'Tag must have at most 50 characters')
    expect(caption?.props.children).toBe('Tag must have at most 50 characters')
    expect(caption?.props.accessibilityRole).toBeUndefined()
    expect(caption?.props.accessibilityLiveRegion).toBeUndefined()
    void renderer.act(() => tree.update(<></>))
  })

  it('keeps its label and shows the skeleton face while the tag request runs, and sends nothing on a second press', () => {
    const tokens = createTokensV2()
    const onCommit = vi.fn()
    let tree!: import('react-test-renderer').ReactTestRenderer
    void renderer.act(() => { tree = renderer.create(<TagEditorRow value="Health" inputAriaLabel="Tag" actionLabel="Add" cancelAriaLabel="Cancel" disabled={false} pending onChange={vi.fn()} onCommit={onCommit} onCancel={vi.fn()} styles={createStyles(tokens)} tokens={tokens} />) })
    const action = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'Add')[0]!
    expect(action.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    expect(action.findAll((node) => String(node.type) === 'Text').some((node) => node.props.children === 'Add')).toBe(true)
    expect(action.findAll((node) => String(node.type) === 'View' && node.props.testID === 'skeleton-face')).toHaveLength(1)
    if (!action.props.disabled) (action.props.onPress as () => void)()
    const input = tree.root.findAll((node) => node.props.accessibilityLabel === 'Tag')[0]!
    expect(input.props.editable).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
    void renderer.act(() => tree.update(<></>))
  })

  it('takes its waiting face and label colour from the shared pill waiting face, so a change to that face reaches this action', () => {
    const tokens = createTokensV2()
    let tree!: import('react-test-renderer').ReactTestRenderer
    void renderer.act(() => { tree = renderer.create(<TagEditorRow value="Health" inputAriaLabel="Tag" actionLabel="Add" cancelAriaLabel="Cancel" disabled={false} pending onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} styles={createStyles(tokens)} tokens={tokens} />) })
    const action = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'Add')[0]!
    expect(controlStyle(action as never).backgroundColor).toBe('#123456')
    const label = action.findAll((node) => String(node.type) === 'Text' && node.props.children === 'Add')[0]!
    expect(StyleSheet.flatten(label.props.style as StyleProp<TextStyle>).color).toBe('#654321')
    void renderer.act(() => tree.update(<></>))
  })
})
