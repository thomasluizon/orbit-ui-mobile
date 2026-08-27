import React from 'react'
import { Text } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Sheet } from '@/components/ui/sheet'

const { present, dismiss } = vi.hoisted(() => ({
  present: vi.fn(() => Promise.resolve()),
  dismiss: vi.fn(() => Promise.resolve()),
}))

vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode }> {
    present = present
    dismiss = dismiss
    render() {
      return this.props.children ?? null
    }
  },
}))

const TestRenderer = require('react-test-renderer')

describe('Sheet (mobile)', () => {
  beforeEach(() => {
    present.mockClear()
    dismiss.mockClear()
  })

  it('presents on mount and gives the body exactly one scroll container', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })

    expect(present).toHaveBeenCalledTimes(1)
    expect(tree.root.findAllByType('ScrollView')).toHaveLength(1)
    const nativeSheet = tree.root.findByType(TrueSheet)
    expect(nativeSheet.props.scrollable).toBeUndefined()
  })

  it('keeps actions in the native fixed footer', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open actions={<Text>Save</Text>}><Text>Body</Text></Sheet>,
      )
      await Promise.resolve()
    })
    const nativeSheet = tree.root.findByType(TrueSheet)
    expect(nativeSheet.props.footer).toBeDefined()
  })
})
