import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import { StyleSheet } from 'react-native'
import { SettingsRow } from '@/components/ui/settings-row'
import { SettingsGroupRow } from '@/components/ui/settings-group'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

afterEach(__resetTestHostConfig)

describe.each([['SettingsRow', SettingsRow], ['SettingsGroupRow', SettingsGroupRow]] as const)('%s text modes', (_name, Row) => {
  it.each([1, 2])('keeps product labels whole at font scale %s', async (fontScale) => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
    let tree: ReactTestRenderer
    await act(() => { tree = create(<Row label="Sincronizar calendário" accessory="none" />) })
    const label = tree!.root.findAll((node) => String(node.type) === 'Text')[0]!
    expect(label.props.numberOfLines).toBeUndefined()
    const row = tree!.root.findAll((node) => String(node.type) === 'Pressable')[0]!
    const style = StyleSheet.flatten((row.props.style as (state: { pressed: boolean }) => object)({ pressed: false }))
    expect(style).toMatchObject({ minHeight: 48 })
    if (fontScale > 1.3) expect(style).toMatchObject({ alignItems: 'flex-start' })
    await act(() => tree!.update(<></>))
  })

  it('limits typed text to two lines and reveals the full value in one tap', async () => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
    const title = 'Caminhar pelo bairro depois do trabalho e conversar com todos os amigos'
    let tree: ReactTestRenderer
    await act(() => { tree = create(<Row label={title} textMode="personal" accessory="none" />) })
    const label = tree!.root.findAll((node) => String(node.type) === 'Text')[0]!
    expect(label.props.numberOfLines).toBe(2)
    expect(label.props.ellipsizeMode).toBe('tail')
    const row = tree!.root.findAll((node) => String(node.type) === 'Pressable')[0]!
    expect(row.props.accessibilityRole).toBe('button')
    expect(row.props.accessibilityState).toMatchObject({ expanded: false })
    await act(() => { (row.props.onPress as () => void)() })
    expect(label.props.numberOfLines).toBeUndefined()
    expect(label.props.children).toBe(title)
    expect(row.props.accessibilityState).toMatchObject({ expanded: true })
    await act(() => { (row.props.onPress as () => void)() })
    expect(label.props.numberOfLines).toBe(2)
    await act(() => tree!.update(<></>))
  })
})
