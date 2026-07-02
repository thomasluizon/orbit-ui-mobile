import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { FieldInput } from '@/components/ui/field-input'

const TestRenderer = require('react-test-renderer')

function renderField(element: ReactElement) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function textContents(tree: any): unknown[] {
  return tree.root.findAllByType('Text').map((node: any) => node.props.children)
}

describe('FieldInput (mobile)', () => {
  it('renders the error caption when error is set', () => {
    const tree = renderField(<FieldInput error="Required" />)
    expect(textContents(tree)).toContain('Required')
  })

  it('renders no caption without an error', () => {
    const tree = renderField(<FieldInput />)
    expect(textContents(tree)).toHaveLength(0)
  })

  it('renders the label above the well', () => {
    const tree = renderField(<FieldInput label="Name" />)
    expect(textContents(tree)).toContain('Name')
  })
})
