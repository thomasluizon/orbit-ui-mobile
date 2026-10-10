import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import { StyleSheet } from 'react-native'
import { ListRow } from '@/components/ui/list-row'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

afterEach(__resetTestHostConfig)

describe.each([['ListRow', ListRow]] as const)('%s text modes', (_name, Row) => {
  it.each([1, 2])('keeps product labels whole at font scale %s', async (fontScale) => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
    let tree: ReactTestRenderer
    await act(() => { tree = create(<Row title="Sincronizar calendário" textMode="label" onClick={() => {}} chevron={false} />) })
    const label = tree!.root.findAll((node) => String(node.type) === 'Text')[0]!
    expect(label.props.numberOfLines).toBeUndefined()
    const row = tree!.root.findAll((node) => String(node.type) === 'Pressable')[0]!
    const style = StyleSheet.flatten((row.props.style as (state: { pressed: boolean }) => object)({ pressed: false }))
    expect(style).toMatchObject({ minHeight: 52 })
    if (fontScale > 1.3) expect(style).toMatchObject({ alignItems: 'center' })
    await act(() => tree!.update(<></>))
  })

  it('keeps an unbroken typed token on one line and reveals the full value in one tap', async () => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
    const title = `${'longaddress'.repeat(12)}@example.com`
    let tree: ReactTestRenderer
    await act(() => { tree = create(<Row title={title} textMode="personal" chevron={false} />) })
    const label = tree!.root.findAll((node) => String(node.type) === 'Text')[0]!
    expect(label.props.numberOfLines).toBe(1)
    expect(label.props.ellipsizeMode).toBe('tail')
    const row = tree!.root.findAll((node) => String(node.type) === 'Pressable')[0]!
    expect(row.props.accessibilityRole).toBe('button')
    expect(row.props.accessibilityState).toMatchObject({ expanded: false })
    await act(() => { (row.props.onPress as () => void)() })
    const expandedText = tree!.root.findAll((node) => String(node.type) === 'Text' && node.props.children === title)[0]!
    expect(expandedText.props.numberOfLines).toBe(1)
    expect(expandedText.props.children).toBe(title)
    expect(row.props.accessibilityState).toMatchObject({ expanded: true })
    await act(() => { (row.props.onPress as () => void)() })
    expect(tree!.root.findAll((node) => String(node.type) === 'Text' && node.props.children === title)[0]!.props.numberOfLines).toBe(1)
    await act(() => tree!.update(<></>))
  })
})
