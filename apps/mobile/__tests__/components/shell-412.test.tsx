import React, { useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __emitKeyboardEvent } from '../../test-mocks/react-native'
import { Shell412 } from '@/components/shell/shell-412'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useShellComposerSlot } from '@/components/shell/shell-composer-slot'
import { useShellNoticeSlot } from '@/hooks/use-shell-notice-slot'
import ProgressScreen from '@/app/(tabs)/progress'

vi.mock('@/components/progress/progress-content', () => ({ ProgressContent: () => React.createElement('ProgressContent') }))

const safeArea = vi.hoisted(() => ({ bottom: 24 }))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: safeArea.bottom, left: 0 }),
  SafeAreaView: (props: Record<string, unknown>) => React.createElement('SafeAreaView', props),
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

function ScrollSurface() {
  const clearance = useShellScrollerClearance()
  return <ScrollView testID="scroll-surface" contentContainerStyle={{ paddingBottom: clearance }} />
}

describe('Shell412 mobile', () => {
  beforeEach(() => {
    safeArea.bottom = 24
  })

  it('floats the FAB without reserving a band or drawing a hairline', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Shell412 composer={React.createElement('Composer')} fab={React.createElement('Fab')} tabBar={React.createElement('TabBar')}><ScrollSurface /></Shell412>)
    })
    const band = StyleSheet.flatten(findByTestId(tree, 'shell-fab-band')[0]?.props.style)
    expect(band).not.toHaveProperty('height')
    expect(band).toMatchObject({ position: 'absolute', bottom: 0, top: 0, right: 0, left: 0 })
    expect(band).not.toHaveProperty('borderTopWidth')
    expect(findByTestId(tree, 'shell-fab-band')[0]?.props.pointerEvents).toBe('box-none')
    expect(findByTestId(tree, 'shell-scroller')[0]?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-fab')).toHaveLength(1)
    expect(StyleSheet.flatten(findByTestId(tree, 'shell-bottom')[0]?.props.style)).not.toHaveProperty('borderTopWidth')
    expect(StyleSheet.flatten(findByTestId(tree, 'shell-fab')[0]?.props.style)).toMatchObject({ bottom: 16, right: 16 })
    expect(StyleSheet.flatten(findByTestId(tree, 'scroll-surface')[0]?.props.contentContainerStyle)).toMatchObject({ paddingBottom: 96 })
    await TestRenderer.act(() => tree.update(<></>))
  })

  it.each([true, false])('keeps content clear of pinned chrome with navigation=%s', async (navigationEnabled) => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(navigationEnabled ? (
        <Shell412 tabBar={React.createElement('TabBar')} fab={React.createElement('Fab')}>
          <ScrollSurface />
        </Shell412>
      ) : (
        <Shell412 nav={false} action={React.createElement('Action')}>
          <ScrollSurface />
        </Shell412>
      ))
    })

    const scroller = findByTestId(tree, 'shell-scroller')[0]
    expect(StyleSheet.flatten(scroller?.props.style)).not.toHaveProperty('paddingBottom')
    expect(StyleSheet.flatten(findByTestId(tree, 'scroll-surface')[0]?.props.contentContainerStyle)).toMatchObject({ paddingBottom: 96 })
    expect(findByTestId(tree, 'shell-bottom')).toHaveLength(1)
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('does not reserve pinned-chrome clearance when the chrome is absent', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Shell412 nav={false}><ScrollSurface /></Shell412>)
    })
    expect(findByTestId(tree, 'shell-bottom')).toHaveLength(0)
    expect(StyleSheet.flatten(findByTestId(tree, 'shell-scroller')[0]?.props.style)).not.toHaveProperty('paddingBottom')
    expect(StyleSheet.flatten(findByTestId(tree, 'scroll-surface')[0]?.props.contentContainerStyle)).toMatchObject({ paddingBottom: 0 })
    await TestRenderer.act(() => tree.update(<></>))
  })

  it.each([0, 24])('handles a %s pixel navigation inset as the keyboard opens and closes', async (bottom) => {
    safeArea.bottom = bottom
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412 composer={React.createElement('Composer')} tabBar={React.createElement('TabBar')}>
          {React.createElement('DestinationList')}
        </Shell412>,
      )
    })
    const padding = () => (
      StyleSheet.flatten(findByTestId(tree, 'shell-bottom')[0]?.props.style) as { paddingBottom?: number }
    ).paddingBottom
    expect(padding()).toBe(bottom)
    await TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400, height: 400 } })
    })
    expect(padding()).toBe(0)
    await TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidHide')
    })
    expect(padding()).toBe(bottom)
    await TestRenderer.act(() => tree.update(<></>))
  })

  it.each(['today', 'calendar', 'progress', 'profile'])('keeps the %s composer and scroller under one keyboard owner', async (destination) => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412 composer={React.createElement('Composer', { destination })} tabBar={React.createElement('TabBar')}>
          {React.createElement('DestinationList', { destination })}
        </Shell412>,
      )
    })

    const owner = tree.root.findAll((node) => String(node.type) === 'KeyboardAvoidingView')
    expect(owner).toHaveLength(1)
    expect(owner[0]?.props.behavior).toBe('height')
    expect(owner[0]?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-scroller')).toHaveLength(1)
    expect(owner[0]?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-pinned-slot')).toHaveLength(1)

    await TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400, height: 400 } })
    })
    expect(findByTestId(tree, 'shell-bottom')[0]?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 0 })]),
    )
    await TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidHide')
    })
    expect(findByTestId(tree, 'shell-bottom')[0]?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 24 })]),
    )
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('keeps the conversation overlay inside the shell keyboard owner', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412
          composer={React.createElement('Composer')}
          conversation={React.createElement('Conversation')}
          conversationLabel="Astra conversation"
          tabBar={React.createElement('TabBar')}
        >
          {React.createElement('DestinationList')}
        </Shell412>,
      )
    })
    const owner = tree.root.findAll((node) => String(node.type) === 'KeyboardAvoidingView')
    expect(owner).toHaveLength(1)
    expect(owner[0]?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-conversation')).toHaveLength(1)
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('renders Progress below the shell inset without a second top safe area', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<Shell412 tabBar={null}><ProgressScreen /></Shell412>) })
    expect(tree.root.findAll((node) => typeof node.type === 'string' && String(node.type) === 'SafeAreaView')).toHaveLength(0)
    await TestRenderer.act(() => tree.update(<></>))
  })
  it.each([true, false])('owns the top inset above header and content with navigation=%s', async (nav) => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Shell412 {...(nav ? { tabBar: null } : { nav: false as const, safeAreaTop: true })} header={React.createElement('AppBar')}>{React.createElement('Screen')}</Shell412>)
    })
    const background = findByTestId(tree, 'shell-background')[0]
    expect(StyleSheet.flatten(background?.props.style)).toMatchObject({ paddingTop: 24 })
    expect(StyleSheet.flatten(findByTestId(tree, 'shell-scroller')[0]?.props.style)).not.toHaveProperty('paddingTop')
    await TestRenderer.act(() => tree.update(<></>))
  })
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

  it('mounts destination feedback above the persistent composer', async () => {
    function ProfileExportNotice() {
      useShellNoticeSlot(
        true,
        () => React.createElement('ExportDone'),
        'export-done',
      )
      return React.createElement('ProfileScreen')
    }
    let tree!: ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Shell412
          composer={React.createElement('AstraComposer')}
          tabBar={React.createElement('TabBar')}
        >
          <ProfileExportNotice />
        </Shell412>,
      )
      await Promise.resolve()
    })

    const notice = findByTestId(tree, 'shell-notice')[0]
    expect(notice?.findAll((node) => String(node.type) === 'ExportDone')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-pinned-slot')[0]
      ?.findAll((node) => String(node.type) === 'AstraComposer')).toHaveLength(1)
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

    const shell = findByTestId(tree, 'shell-412')[0]
    const background = findByTestId(tree, 'shell-background')[0]
    const scroller = findByTestId(tree, 'shell-scroller')[0]
    expect(StyleSheet.flatten(shell?.props.style)).toMatchObject({ flex: 1, overflow: 'hidden' })
    expect(StyleSheet.flatten(background?.props.style)).toMatchObject({ flex: 1 })
    expect(StyleSheet.flatten(scroller?.props.style)).toMatchObject({ flex: 1 })

    const bottom = findByTestId(tree, 'shell-bottom')[0]
    const composerBand = findByTestId(tree, 'shell-composer-band')[0]
    const fabBand = findByTestId(tree, 'shell-fab-band')[0]
    const tabBar = findByTestId(tree, 'shell-tab-bar')[0]
    const fab = findByTestId(tree, 'shell-fab')[0]
    const notice = findByTestId(tree, 'shell-notice')[0]
    expect(composerBand?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-pinned-slot')).toHaveLength(1)
    expect(composerBand?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-fab')).toHaveLength(0)
    expect(fabBand?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-fab')).toHaveLength(1)
    expect(StyleSheet.flatten(fabBand?.props.style)).toMatchObject({ position: 'absolute', bottom: 0, top: 0 })
    expect(bottom?.findAll((node) => typeof node.type === 'string' && ['shell-fab-band', 'shell-notice', 'shell-composer-band'].includes(node.props.testID as string)).map((node) => node.props.testID)).toEqual([
      'shell-notice', 'shell-composer-band',
    ])
    expect(bottom?.findAll((node) => typeof node.type === 'string' && node.props.testID === notice?.props.testID)).toHaveLength(1)
    expect(bottom?.findAll((node) => typeof node.type === 'string' && node.props.testID === tabBar?.props.testID)).toHaveLength(1)
    expect(StyleSheet.flatten(fab?.props.style)).toMatchObject({
      bottom: 16,
      position: 'absolute',
      right: 16,
    })
  })

  it('anchors the FAB above the composer when the notice is empty', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412 notice={<></>} composer={React.createElement('Composer')} tabBar={React.createElement('TabBar')} fab={React.createElement('Fab')}>
          {React.createElement('Screen')}
        </Shell412>,
      )
    })
    const bottom = findByTestId(tree, 'shell-bottom')[0]
    const composerBand = findByTestId(tree, 'shell-composer-band')[0]
    const fabBand = findByTestId(tree, 'shell-fab-band')[0]
    expect(fabBand?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-fab')).toHaveLength(1)
    expect(composerBand?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-fab')).toHaveLength(0)
    expect(bottom?.findAll((node) => typeof node.type === 'string' && ['shell-fab-band', 'shell-notice', 'shell-composer-band'].includes(node.props.testID as string)).map((node) => node.props.testID)).toEqual([
      'shell-notice', 'shell-composer-band',
    ])
  })

  it('keeps Profile identity content in the bounded destination band', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412
          composer={React.createElement('Composer')}
          tabBar={React.createElement('TabBar')}
        >
          {React.createElement('View', { testID: 'profile-identity-container' })}
        </Shell412>,
      )
    })

    const scroller = findByTestId(tree, 'shell-scroller')[0]
    const profileIdentity = findByTestId(tree, 'profile-identity-container')[0]
    const bottom = findByTestId(tree, 'shell-bottom')[0]
    expect(scroller?.findAll((node) => typeof node.type === 'string' && node.props.testID === profileIdentity?.props.testID)).toHaveLength(1)
    expect(bottom?.findAll((node) => typeof node.type === 'string' && node.props.testID === profileIdentity?.props.testID)).toHaveLength(0)
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
    const owner = tree.root.findAll((node) => String(node.type) === 'KeyboardAvoidingView')
    expect(owner).toHaveLength(1)
    expect(owner[0]?.props.behavior).toBeUndefined()
  })

  it('preserves stack state when navigation visibility changes', async () => {
    let setDraft!: (value: string) => void
    let mounts = 0

    function RootStackScreens() {
      const [draft, updateDraft] = useState(() => {
        mounts += 1
        return ''
      })
      setDraft = updateDraft
      return React.createElement('StackDraft', { draft })
    }

    const renderShell = (navigationEnabled: boolean) => navigationEnabled ? (
      <Shell412 tabBar={React.createElement('TabBar')}><RootStackScreens /></Shell412>
    ) : (
      <Shell412 nav={false}><RootStackScreens /></Shell412>
    )
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(renderShell(true))
    })
    const draft = () => tree.root.findAll((node) => String(node.type) === 'StackDraft')[0]?.props.draft
    const keyboardBehavior = () => tree.root.findAll((node) => String(node.type) === 'KeyboardAvoidingView')[0]?.props.behavior
    await TestRenderer.act(() => setDraft('unsaved'))
    expect(draft()).toBe('unsaved')

    await TestRenderer.act(() => tree.update(renderShell(false)))
    expect(draft()).toBe('unsaved')
    expect(keyboardBehavior()).toBeUndefined()
    await TestRenderer.act(() => tree.update(renderShell(true)))
    expect(draft()).toBe('unsaved')
    expect(keyboardBehavior()).toBe('height')
    expect(mounts).toBe(1)
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
