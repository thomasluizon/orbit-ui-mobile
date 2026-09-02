import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Shell412 } from '@/components/shell/shell-412'
import { useShellComposerSlot } from '@/components/shell/shell-composer-slot'

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
  it('accepts a destination-owned selection tray in the composer slot', async () => {
    function Screen() {
      useShellComposerSlot(true, React.createElement('SelectionTray'))
      return React.createElement('Screen')
    }
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Shell412 tabBar={React.createElement('TabBar')}>
          <Screen />
        </Shell412>,
      )
      await Promise.resolve()
    })

    expect(findByTestId(tree, 'shell-pinned-slot')).toHaveLength(1)
    expect(tree.root.findAll((node) => String(node.type) === 'SelectionTray')).toHaveLength(1)
  })

  it('prefers a destination-owned selection tray over the persistent composer', async () => {
    function Screen() {
      useShellComposerSlot(true, React.createElement('SelectionTray'))
      return React.createElement('Screen')
    }
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Shell412
          composer={React.createElement('AstraComposer')}
          tabBar={React.createElement('TabBar')}
        >
          <Screen />
        </Shell412>,
      )
      await Promise.resolve()
    })

    expect(tree.root.findAll((node) => String(node.type) === 'SelectionTray')).toHaveLength(1)
    expect(tree.root.findAll((node) => String(node.type) === 'AstraComposer')).toHaveLength(0)
  })

  it('refreshes the Today composer tray when an image is selected and removed', async () => {
    let setImageSelected!: (selected: boolean) => void

    function TodayScreen() {
      const [imageSelected, setSelected] = useState(false)
      setImageSelected = setSelected
      useShellComposerSlot(
        true,
        imageSelected
          ? React.createElement('AttachmentTray', { name: 'walk.jpg' })
          : React.createElement('EmptyComposer'),
      )
      return React.createElement('TodayScreen')
    }

    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Shell412 tabBar={React.createElement('TabBar')}>
          <TodayScreen />
        </Shell412>,
      )
      await Promise.resolve()
    })

    expect(tree.root.findAll((node) => String(node.type) === 'AttachmentTray')).toHaveLength(0)
    await TestRenderer.act(async () => {
      setImageSelected(true)
      await Promise.resolve()
    })
    expect(tree.root.findAll((node) => String(node.type) === 'AttachmentTray')).toHaveLength(1)
    await TestRenderer.act(async () => {
      setImageSelected(false)
      await Promise.resolve()
    })
    expect(tree.root.findAll((node) => String(node.type) === 'AttachmentTray')).toHaveLength(0)
  })

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
          header={React.createElement('View', { testID: 'header-content' })}
          tabBar={React.createElement('View', { testID: 'tab-bar-content' })}
          conversation={React.createElement('Conversation')}
          conversationLabel="Astra conversation"
          sheets={React.createElement('View', { testID: 'sheets-content' })}
        >
          {React.createElement('Screen')}
        </Shell412>,
      )
    })

    expect(findByTestId(tree, 'shell-conversation')[0]?.props).toMatchObject({
      accessibilityLabel: 'Astra conversation',
      accessibilityViewIsModal: true,
    })
    const background = findByTestId(tree, 'shell-background')[0]
    expect(background?.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    )
    expect(background?.findAll((node) => node.props.testID === 'header-content')).toHaveLength(1)
    expect(background?.findAll((node) => node.props.testID === 'tab-bar-content')).toHaveLength(1)
    expect(background?.findAll((node) => node.props.testID === 'sheets-content')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-scroller')[0]?.props.importantForAccessibility).toBeUndefined()
  })
})
