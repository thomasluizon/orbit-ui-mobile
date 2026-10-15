import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { expect, it } from 'vitest'
import { useContentFrameStyle } from '@/hooks/use-content-frame-style'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '../../test-mocks/react-native'

function DestinationFrame() {
  const style = useContentFrameStyle()
  return <View style={{ flex: 1 }}><View testID="frame" style={style}><View testID="section" style={{ height: 100 }} /></View></View>
}

it.each([412, 1200, 1600])('centres every shared destination frame at %ipx', async (width) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  let tree!: GeometryTree
  await act(() => { tree = create(<DestinationFrame />) as GeometryTree })
  try {
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width, height: 915 })
    const frame = boxes.get('frame')!
    const section = boxes.get('section')!
    expect(frame.width).toBe(Math.min(width, 740))
    expect(frame.left + frame.width / 2).toBe(width / 2)
    expect(section.width).toBe(frame.width - 32)
  } finally {
    await act(() => tree.unmount())
    __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
  }
})
