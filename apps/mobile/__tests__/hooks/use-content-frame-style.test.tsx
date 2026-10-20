import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { expect, it } from 'vitest'
import { useContentFrameStyle } from '@/hooks/use-content-frame-style'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '../../test-mocks/react-native'

function DestinationFrame({ cap }: Readonly<{ cap: 560 | 620 | 652 }>) {
  const style = useContentFrameStyle(cap)
  return <View style={{ flex: 1 }}><View testID="frame" style={style}><View testID="section" style={{ height: 100 }} /></View></View>
}

it.each([412, 840, 1200, 1600].flatMap((width) => ([560, 620, 652] as const).map((cap) => ({ width, cap }))))('keeps the $cap frame at its column start at $width', async ({ width, cap }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  let tree!: GeometryTree
  await act(() => { tree = create(<DestinationFrame cap={cap} />) as GeometryTree })
  try {
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width, height: 915 })
    const frame = boxes.get('frame')!
    const section = boxes.get('section')!
    expect(frame.width).toBe(width < 1024 ? width : cap + 32)
    expect(frame.left).toBe(0)
    expect(section.width).toBe(frame.width - 32)
  } finally {
    await act(() => tree.unmount())
    __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
  }
})
