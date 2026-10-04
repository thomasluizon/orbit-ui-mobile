import { radius, createTokensV2 } from '@/lib/theme'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { expectPressFill } from '../../../support/press-feedback'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

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
})

 it('announces server validation beside the editable tag input', () => {
    const tokens = createTokensV2()
    let tree!: import('react-test-renderer').ReactTestRenderer
    void renderer.act(() => { tree = renderer.create(<TagEditorRow error="Tag must have at most 50 characters" value="Health" inputAriaLabel="Tag" actionLabel="Save" cancelAriaLabel="Cancel" disabled={false} onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} styles={createStyles(tokens)} tokens={tokens} />) })
    const input = tree.root.findAll((node) => node.props.accessibilityLabel === 'Tag')[0]!
    expect(input.props.accessibilityHint).toBe('Tag must have at most 50 characters')
    expect(input.props.value).toBe('Health')
    const caption = tree.root.findAll((node) => node.props.accessibilityRole === 'alert' && node.props.accessibilityLiveRegion === 'polite')[0]
    expect(caption?.props.children).toBe('Tag must have at most 50 characters')
    void renderer.act(() => tree.update(<></>))
  })
