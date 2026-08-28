import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Shell412 } from '@/components/shell/shell-412'

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({ bg: '#111111', hairline: '#222222' }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type ReactTestRenderer = import('react-test-renderer').ReactTestRenderer

function findByTestId(tree: ReactTestRenderer, testID: string) {
  return tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  )
}

describe('Shell412 mobile', () => {
  it('owns the notice, composer, tab bar, FAB, and Android safe-area bottom', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412
          notice={React.createElement('Notice')}
          composer={React.createElement('Composer')}
          tabBar={React.createElement('TabBar')}
          fab={React.createElement('Fab')}
        >
          {React.createElement('Screen')}
        </Shell412>,
      )
    })

    expect(findByTestId(tree, 'shell-notice')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-pinned-slot')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-tab-bar')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-fab')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-bottom')[0]?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 24 })]),
    )
  })

  it('uses an action slot without primary navigation in flow mode', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412 nav={false} action={React.createElement('Action')}>
          {React.createElement('Screen')}
        </Shell412>,
      )
    })

    expect(findByTestId(tree, 'shell-pinned-slot')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-tab-bar')).toHaveLength(0)
  })

  it('presents conversation modally and hides the screen accessibility tree', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412
          tabBar={React.createElement('TabBar')}
          conversation={React.createElement('Conversation')}
          conversationLabel="Astra conversation"
        >
          {React.createElement('Screen')}
        </Shell412>,
      )
    })

    expect(findByTestId(tree, 'shell-conversation')[0]?.props).toMatchObject({
      accessibilityLabel: 'Astra conversation',
      accessibilityViewIsModal: true,
    })
    expect(findByTestId(tree, 'shell-scroller')[0]?.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    )
  })
})
