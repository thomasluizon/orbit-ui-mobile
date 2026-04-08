import React from 'react'
import { describe, expect, it, vi } from 'vitest'

const TestRenderer = require('react-test-renderer')

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === 'white' ? '#ffffff' : '#111111'),
  },
)

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
  }),
}))

vi.mock('lucide-react-native', () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props)

  return {
    WifiOff: createIcon('WifiOff'),
  }
})

import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'

describe('OfflineUnavailableState', () => {
  it('exposes the offline alert label and button accessibility state', () => {
    const onAction = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OfflineUnavailableState
          title="No connection"
          description="You can retry when the app is back online."
          actionLabel="Try again"
          onAction={onAction}
          disabled
        />,
      )
    })

    const summary = tree.root.find(
      (node: any) => node.props.accessibilityRole === 'alert',
    )

    expect(summary.props.accessibilityLabel).toBe(
      'No connection. You can retry when the app is back online.',
    )
    expect(summary.props.accessibilityLiveRegion).toBe('polite')

    const button = tree.root.findByType('TouchableOpacity')
    expect(button.props.accessibilityRole).toBe('button')
    expect(button.props.accessibilityLabel).toBe('Try again')
    expect(button.props.accessibilityState).toEqual({ disabled: true })
    expect(button.props.disabled).toBe(true)
  })

  it('renders the compact variant without an action button when no action is provided', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OfflineUnavailableState
          compact
          title="Offline"
          description="Previously synced habits are still visible."
        />,
      )
    })

    expect(
      tree.root.findAll(
        (node: any) => node.type === 'TouchableOpacity' && node.props.onPress,
      ),
    ).toHaveLength(0)
    expect(
      tree.root.findAllByType('Text').map((node: any) => node.props.children),
    ).toEqual(
      expect.arrayContaining(['Offline', 'Previously synced habits are still visible.']),
    )
  })
})
