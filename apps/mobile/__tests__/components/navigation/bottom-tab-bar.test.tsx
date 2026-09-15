import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { __setWindowDimensions } from '@/test-mocks/react-native'

const TestRenderer = require('react-test-renderer')

vi.mock('lucide-react-native', () => ({
  CalendarDays: 'CalendarDays',
  Home: 'Home',
  Plus: 'Plus',
  User: 'User',
}))

describe('BottomTabBar large-screen layout', () => {
  it('keeps destinations compact and clears the gesture inset in landscape', () => {
    __setWindowDimensions({ width: 1280, height: 800, scale: 1, fontScale: 1 })
    let tree: ReturnType<typeof TestRenderer.create>

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <BottomTabBar
          active="today"
          onTab={vi.fn()}
          bottomInset={24}
        />,
      )
    })

    const responsiveRows = tree!.root.findAll(
      (node: { props: { testID?: string } }) => node.props.testID === 'bottom-tab-destinations',
    )
    const bar = tree!.root.findAll(
      (node: { props: { testID?: string } }) => node.props.testID === 'bottom-tab-bar',
    )[0]

    expect(responsiveRows[0]?.props.style).toEqual(
      expect.objectContaining({ alignSelf: 'center', maxWidth: 740, width: '100%' }),
    )
    expect(bar?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 24 })]),
    )
  })
})
