import { radius } from '@/lib/theme'
import React from 'react'
import { describe, it, vi } from 'vitest'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { createTokensV2 } from '@/lib/theme'
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
