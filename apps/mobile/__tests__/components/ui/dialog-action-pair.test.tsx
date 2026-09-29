import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { describe, expect, it } from 'vitest'
import { MATCHED_PILL_MAX_WIDTH } from '@orbit/shared/theme'
import { DialogActionPair } from '@/components/ui/dialog-action-pair'

const TestRenderer = require('react-test-renderer')

describe('DialogActionPair (mobile)', () => {
  it('centres the capped pair in the right-aligned sheet footer, as web mx-auto does', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<DialogActionPair><Text>Confirm</Text></DialogActionPair>)
    })
    const pair = tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.testID === 'dialog-action-pair')[0]

    expect(StyleSheet.flatten(pair.props.style)).toMatchObject({
      marginHorizontal: 'auto',
      maxWidth: MATCHED_PILL_MAX_WIDTH,
      width: '100%',
    })
  })
})
