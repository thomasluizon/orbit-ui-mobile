import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { describe, expect, it } from 'vitest'
import { DialogActionPair } from '@/components/ui/dialog-action-pair'

const TestRenderer = require('react-test-renderer')

describe('DialogActionPair (mobile)', () => {
  it.each([false, true])('keeps intrinsic actions trailing with inline=%s', (inline) => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<DialogActionPair inline={inline}><Text>Cancel</Text><Text>Confirm</Text></DialogActionPair>)
    })
    const pair = tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.testID === 'dialog-action-pair')[0]

    expect(StyleSheet.flatten(pair.props.style)).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
    })
    expect(StyleSheet.flatten(pair.props.style).marginHorizontal).toBeUndefined()
    expect(StyleSheet.flatten(pair.props.style).maxWidth).toBeUndefined()
    expect(StyleSheet.flatten(pair.props.style).width).toBeUndefined()
  })
})
