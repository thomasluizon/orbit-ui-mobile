import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Platform, Text, View } from 'react-native'
import { Portal, PortalHost } from '@rn-primitives/portal'
import { Slot } from '@rn-primitives/slot'
import { useControllableState } from '@rn-primitives/hooks'
import type { SlottableViewProps } from '@rn-primitives/types'
import { create, act, type ReactTestRenderer } from 'react-test-renderer'

let tree: ReactTestRenderer | undefined

afterEach(async () => {
  await act(() => tree?.update(<></>))
  tree = undefined
})

function PortalContent({ testID }: Readonly<SlottableViewProps>) {
  const [label] = useControllableState({ defaultProp: 'Portal content' })
  return <Slot<typeof View> testID={testID}><View><Text>{label}</Text></View></Slot>
}

function PortalExample({ visible = true, label = 'Portal content' }) {
  return <>
    <View testID="source">
      {visible ? <Portal name="portal-smoke"><Text>{label}</Text></Portal> : null}
    </View>
    <PortalHost />
  </>
}

describe('native headless portal', () => {
  it('mounts an empty host without adding a native view', async () => {
    expect(Platform.OS).toBe('android')
    await act(() => { tree = create(<PortalHost />) })
    expect(tree!.root.findAll((node) => typeof node.type === 'string')).toHaveLength(0)
  })

  it('renders the installed slot and hook through the default host', async () => {
    await act(() => {
      tree = create(<>
        <View testID="source">
          <Portal name="portal-smoke"><PortalContent testID="portal-content" /></Portal>
        </View>
        <PortalHost />
      </>)
    })
    expect(tree!.root.findAll((node) => node.type === View && node.props.testID === 'source')[0]!.findAll((node) => node.type === Text)).toHaveLength(0)
    expect(tree!.root.findAll((node) => node.type === PortalHost)[0]!.findAll((node) => node.type === Text)[0]?.props.children).toBe('Portal content')
    expect(tree!.root.findAll((node) => node.type === PortalHost)[0]!.findAll((node) => node.type === View)[0]?.props.testID).toBe('portal-content')
  })

  it('updates portal content and removes it when the source unmounts', async () => {
    await act(() => { tree = create(<PortalExample />) })
    expect(tree!.root.findAll((node) => node.type === PortalHost)[0]!.findAll((node) => node.type === Text)[0]?.props.children).toBe('Portal content')
    await act(() => { tree!.update(<PortalExample label="Updated content" />) })
    expect(tree!.root.findAll((node) => node.type === PortalHost)[0]!.findAll((node) => node.type === Text)[0]?.props.children).toBe('Updated content')
    await act(() => { tree!.update(<PortalExample visible={false} />) })
    expect(tree!.root.findAll((node) => node.type === PortalHost)[0]!.findAll((node) => node.type === Text)).toHaveLength(0)
  })

  it('does not render a named portal into the default host', async () => {
    await act(() => {
      tree = create(<>
        <Portal name="isolated-portal" hostName="separate-host"><Text>Separate content</Text></Portal>
        <PortalHost />
      </>)
    })
    expect(tree!.root.findAll((node) => typeof node.type === 'string')).toHaveLength(0)
  })
})
