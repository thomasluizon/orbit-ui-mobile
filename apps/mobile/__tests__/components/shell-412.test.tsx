import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __emitKeyboardEvent, __focusHost, __getFocusedNativeTag, __setWindowDimensions } from '../../test-mocks/react-native'
import { Shell412 } from '@/components/shell/shell-412'
import { Composer } from '@/components/shell/composer'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useShellScrollToTopSlot } from '@/components/shell/shell-scroll-to-top-slot'
import { useShellComposerSlot } from '@/components/shell/shell-composer-slot'
import { useShellNoticeSlot } from '@/hooks/use-shell-notice-slot'
import ProgressScreen from '@/app/(tabs)/progress'
import { Fab } from '@/components/ui/fab'
import { Toast } from '@/components/ui/app-toast'
import { createTokensV2 } from '@/lib/theme'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

vi.mock('@/components/progress/progress-content', () => ({ ProgressContent: () => React.createElement('ProgressContent') }))

const safeArea = vi.hoisted(() => ({ top: 24, bottom: 24 }))
const appearance = vi.hoisted(() => ({ currentScheme: 'purple', currentTheme: 'dark' }))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: safeArea.top, right: 0, bottom: safeArea.bottom, left: 0 }),
  SafeAreaView: (props: Record<string, unknown>) => React.createElement('SafeAreaView', props),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => appearance,
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type ReactTestRenderer = import('react-test-renderer').ReactTestRenderer
type ParentedTestInstance = import('react-test-renderer').ReactTestInstance & { parent: ParentedTestInstance | null }

function findByTestId(tree: ReactTestRenderer, testID: string) {
  return tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  )
}

function ScrollSurface() {
  const clearance = useShellScrollerClearance()
  return <ScrollView testID="scroll-surface" contentContainerStyle={{ paddingBottom: clearance }} />
}

function LongScrollSurface() {
  const paddingBottom = useShellScrollerClearance()
  return <ScrollView testID="floating-list" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom }}>
    <View testID="long-content" style={{ height: 1600 }} />
  </ScrollView>
}

describe('Shell412 mobile', () => {
  beforeEach(() => {
    safeArea.top = 24
    safeArea.bottom = 24
    appearance.currentTheme = 'dark'
  })

  it.each([320, 412, 840, 1600].flatMap(width => (['dark', 'light'] as const).flatMap(mode =>
    [en, ptBR].flatMap(words => [1, 2].map(fontScale => ({ width, mode, words, fontScale }))),
  )))('retains floating coverage through notice, inset and keyboard transitions at $width/$mode/$fontScale', async ({ width, mode, words, fontScale }) => {
    const viewport = { width, height: width === 840 ? 240 : 915 }
    __setWindowDimensions({ ...viewport, scale: 1, fontScale })
    appearance.currentTheme = mode
    safeArea.top = 0
    safeArea.bottom = 0
    const composer = <Composer state="idle" value="Draft" onChangeValue={vi.fn()} onSend={vi.fn()} suggestions={[]} words={words.shell.composer} />
    const shell = (notice?: React.ReactNode) => <Shell412 header={<View style={{ height: 48 }} />}
      composer={composer} notice={notice} fab={<Fab label={words.nav.createHabit} onClick={vi.fn()}><View /></Fab>}
      tabBar={<View style={{ height: 80 }} />}><LongScrollSurface /></Shell412>
    let tree!: GeometryTree
    await TestRenderer.act(() => { tree = TestRenderer.create(shell()) as GeometryTree })
    try {
      const reportLayout = findByTestId(tree, 'shell-412')[0]!.props.onLayout as (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void
      await TestRenderer.act(() => reportLayout({ nativeEvent: { layout: { x: 0, y: 0, ...viewport } } }))
      const input = tree.root.findAll(node => String(node.type) === 'TextInput')[0]!
      for (const notice of [undefined, <></>, <Toast key="notice" kind="neutral" message="Saved" persistent />, <View key="tall" style={{ minHeight: 160 }}><Toast kind="neutral" message="Saved" persistent /></View>]) {
        for (const bottom of [0, 24]) {
          safeArea.bottom = bottom
          await TestRenderer.act(() => tree.update(shell(notice)))
          for (const keyboard of ['keyboardDidShow', 'keyboardDidHide'] as const) {
            await TestRenderer.act(() => __emitKeyboardEvent(keyboard))
            const boxes = measureSafeArea(tree.toJSON(), host => host.props.testID, viewport)
            const fab = boxes.get('fab')!
            const list = boxes.get('floating-list')!
            const bottomChrome = boxes.get('shell-bottom')!
            expect(list.bottom, 'viewport reaches real controls').toBe(bottomChrome.top)
            expect(fab.top, 'target remains inside list viewport').toBeGreaterThanOrEqual(list.top)
            expect(fab.bottom, 'target clears pinned controls').toBe(list.bottom - 16)
            expect(fab.width).toBe(60)
            expect(fab.left + fab.width).toBe(boxes.get('shell-background')!.left + Math.min(width, 740) - 16)
            expect(tree.root.findAll(node => String(node.type) === 'TextInput')[0]).toBe(input)
            const bottomInset = StyleSheet.flatten(findByTestId(tree, 'shell-bottom')[0]!.props.style as ViewStyle).paddingBottom as number
            const outerInset = StyleSheet.flatten(findByTestId(tree, 'shell-412')[0]!.props.style as ViewStyle).paddingBottom as number | undefined
            expect(bottomInset + (outerInset ?? 0)).toBe(keyboard === 'keyboardDidShow' ? 0 : bottom)
          }
        }
      }
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it.each([false, true])('extends the actual list through the floating FAB region with notice=%s', async (withNotice) => {
    __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
    let tree!: GeometryTree
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Shell412 header={<View style={{ height: 48 }} />}
        composer={<Composer state="idle" value="" onChangeValue={vi.fn()} onSend={vi.fn()} suggestions={[]}
          words={{ placeholder: 'Ask Astra', send: 'Send', paste: 'Paste', nothingToPaste: 'Nothing to paste', clear: 'Clear message', actions: 'Attach', suggestionsLabel: 'Suggestions' }} />}
        notice={withNotice ? <Toast kind="neutral" message="Saved" persistent /> : undefined}
        fab={<Fab label="Create" onClick={vi.fn()}><View /></Fab>}
        tabBar={<View style={{ height: 80 }} />}><LongScrollSurface /></Shell412>) as GeometryTree
    })
    try {
      const boxes = measureSafeArea(tree.toJSON(), host => host.props.testID)
      const scroller = boxes.get('shell-scroller')!
      const list = boxes.get('floating-list')!
      const fab = boxes.get('fab')!
      const anchor = boxes.get(withNotice ? 'shell-notice' : 'shell-composer-band')!
      const bottom = boxes.get('shell-bottom')!
      const style = (id: string) => StyleSheet.flatten(findByTestId(tree, id)[0]!.props.style) as ViewStyle
      const clearance = StyleSheet.flatten(findByTestId(tree, 'floating-list')[0]!.props.contentContainerStyle as ViewStyle).paddingBottom as number
      const content = boxes.get('long-content')!
      const maximumScroll = Math.max(0, content.bottom + clearance - list.bottom)
      expect.soft(fab.width, 'original target size').toBe(60)
      expect.soft(fab.bottom, 'FAB stays above actual pinned controls').toBeLessThanOrEqual(anchor.top - 16)
      expect.soft(fab.left + fab.width, 'original trailing inset').toBe(396)
      expect.soft(clearance, 'list retains end clearance').toBeGreaterThanOrEqual(fab.bottom - fab.top + 16)
      expect.soft(content.bottom - maximumScroll, 'last content clears the FAB at scroll end').toBeLessThanOrEqual(fab.top - 16)
      expect.soft(style('composer-idle').backgroundColor, 'opaque composer').toBe(createTokensV2('purple', 'dark').bg)
      if (withNotice) expect.soft(style('toast-neutral').backgroundColor, 'opaque notice').toBe(createTokensV2('purple', 'dark').bgSheet)
      expect.soft(scroller.bottom, 'list viewport reaches the pinned controls anchor underneath the floating FAB').toBeGreaterThanOrEqual(anchor.top)
      expect.soft(list.bottom, 'actual list viewport contains the FAB vertical band').toBeGreaterThanOrEqual(fab.bottom)
      const opaqueBand = style('shell-bottom').backgroundColor !== undefined && style('shell-bottom').backgroundColor !== 'transparent'
        && bottom.width >= 411 && bottom.top <= fab.top && bottom.bottom >= fab.bottom
      expect.soft(opaqueBand, 'no full-width opaque bottom ancestor covers the FAB-only list band').toBe(false)
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it.each([[412, 915], [480, 915], [840, 900], [1100, 900], [1352, 915], [1200, 1600], [1600, 1200], [740, 240]])(
    'preserves composer input focus, its clear action and expanded menu across FAB changes at %i by %i', async (width, height) => {
      __setWindowDimensions({ width, height, scale: 1, fontScale: 1 })
      const onChangeValue = vi.fn()
      const onSend = vi.fn()
      function DraftComposer() {
        const [draft, setDraft] = useState('Keep this draft')
        return <Composer state="idle" value={draft} onChangeValue={value => { onChangeValue(value); setDraft(value) }} onSend={onSend} suggestions={[]}
          words={{ placeholder: 'Ask Astra', send: 'Send', paste: 'Paste', nothingToPaste: 'Nothing to paste', clear: 'Clear message', actions: 'Attach', suggestionsLabel: 'Suggestions' }}
          onAttachFile={vi.fn()} attachWords={{ file: 'Document', image: 'Photo', trayLabel: 'Attachments', remove: name => `Remove ${name}` }} />
      }
      const composer = <DraftComposer />
      const shell = (floating: boolean, notice?: React.ReactNode) => <Shell412 composer={composer} notice={notice} tabBar={React.createElement('TabBar')}
        fab={floating ? React.createElement('Fab') : undefined} />
      let tree!: ReactTestRenderer
      await TestRenderer.act(() => { tree = TestRenderer.create(shell(true)) })
      try {
        const textInput = () => tree.root.findAll(node => String(node.type) === 'TextInput')[0]!
        const input = textInput()
        const nativeTag = input.props.__nativeTag as number
        const actions = () => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'Attach')[0]!
        const expanded = () => (actions().props.accessibilityState as { expanded: boolean }).expanded
        await TestRenderer.act(() => __focusHost(nativeTag))
        const clear = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'Clear message')
        expect(clear).toHaveLength(1)
        await TestRenderer.act(() => (clear[0]!.props.onPress as () => void)())
        expect(onChangeValue).toHaveBeenCalledExactlyOnceWith('')
        expect(textInput().props.value).toBe('')
        expect(__getFocusedNativeTag()).toBe(nativeTag)
        expect(onSend).not.toHaveBeenCalled()
        await TestRenderer.act(() => (textInput().props.onChangeText as (value: string) => void)('Keep this draft'))
        await TestRenderer.act(() => (actions().props.onPress as () => void)())
        expect(__getFocusedNativeTag()).toBe(nativeTag)
        expect(expanded()).toBe(true)
        for (const [floating, notice] of [[false, undefined], [true, <></>], [true, <View key="tall" style={{ height: 160 }} />], [true, undefined]] as const) {
          await TestRenderer.act(() => tree.update(shell(floating, notice)))
          expect.soft(textInput() === input, 'same mounted input').toBe(true)
          expect.soft(textInput().props.value, 'draft survives FAB changes').toBe('Keep this draft')
          expect.soft(__getFocusedNativeTag(), 'input keeps native focus').toBe(nativeTag)
          expect.soft(expanded(), 'menu stays expanded').toBe(true)
        }
      } finally { await TestRenderer.act(() => tree.update(<></>)) }
    },
  )

  it('places the optional pill inside the scroller and removes registered content on unmount', async () => {
    function RegisteredPill() {
      useShellScrollToTopSlot(true, React.createElement('Pill'))
      return null
    }
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<Shell412 header={React.createElement('Header')} fab={React.createElement('Fab')} tabBar={React.createElement('Tabs')}><RegisteredPill /></Shell412>) })
    const slot = findByTestId(tree, 'shell-scroll-to-top')[0]!
    expect(StyleSheet.flatten(slot.props.style)).toMatchObject({ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' })
    expect(slot.props.pointerEvents).toBe('box-none')
    expect(findByTestId(tree, 'shell-scroller')[0]!.findAll((node) => node === slot)).toHaveLength(1)
    expect(findByTestId(tree, 'shell-fab')[0]!.findAll((node) => node === slot)).toHaveLength(0)
    await TestRenderer.act(() => tree.update(<Shell412 nav={false} />))
    expect(findByTestId(tree, 'shell-scroll-to-top')).toHaveLength(0)
    await TestRenderer.act(() => tree.update(<Shell412 nav={false} scrollToTop={React.createElement('Pill')} />))
    expect(findByTestId(tree, 'shell-scroll-to-top')).toHaveLength(1)
    await TestRenderer.act(() => tree.update(<Shell412 nav={false} scrollToTop={React.createElement('Pill')} conversation={React.createElement('Conversation')} conversationLabel="Conversation" />))
    expect(findByTestId(tree, 'shell-scroll-to-top')).toHaveLength(0)
    await TestRenderer.act(() => tree.update(<></>))
  })

  it.each([412, 840, 1200, 1600])('centres every shell surface in a capped column at %ipx', async (width) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Shell412 header={<ScrollSurface />} tabBar={<ScrollSurface />} composer={<ScrollSurface />} fab={<ScrollSurface />} conversation={<ScrollSurface />} conversationLabel="Conversation"><ScrollSurface /></Shell412>)
    })
    const background = findByTestId(tree, 'shell-background')[0]!
    expect(StyleSheet.flatten(background.props.style)).toMatchObject({ alignSelf: 'center', width: Math.min(width, 740), maxWidth: 740 })
    expect(StyleSheet.flatten(findByTestId(tree, 'shell-conversation')[0]!.props.style)).toMatchObject({ alignSelf: 'center', width: Math.min(width, 740), maxWidth: 740 })
    for (const testID of ['shell-header', 'shell-scroller', 'shell-tab-bar', 'shell-fab']) {
      expect(background.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)).toHaveLength(1)
    }
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('reflows after folding without remounting or losing screen state', async () => {
    const mounted = vi.fn()
    let increment!: () => void
    function StatefulScreen() {
      const [count, setCount] = useState(0)
      useEffect(() => { mounted() }, [])
      increment = () => setCount((previous) => previous + 1)
      return React.createElement('Screen', { count })
    }
    __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
    const renderShell = () => <Shell412 tabBar={<ScrollSurface />}><StatefulScreen /></Shell412>
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(renderShell()) })
    await TestRenderer.act(() => increment())
    for (const [width, height] of [[840, 900], [900, 480], [412, 915]] as const) {
      __setWindowDimensions({ width, height, scale: 1, fontScale: 1 })
      await TestRenderer.act(() => tree.update(renderShell()))
      expect((StyleSheet.flatten(findByTestId(tree, 'shell-background')[0]!.props.style) as ViewStyle).width).toBe(Math.min(width, 740))
      expect(tree.root.findAll((node) => String(node.type) === 'Screen')[0]!.props.count).toBe(1)
      expect(mounted).toHaveBeenCalledTimes(1)
    }
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('centres pinned controls and the floating overlay in the same capped shell', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412 notice={React.createElement('Notice')} composer={React.createElement('Composer')} fab={React.createElement('Fab')} tabBar={React.createElement('TabBar')} />,
      )
    })
    const bottom = findByTestId(tree, 'shell-bottom')[0]!
    const pinnedSlot = findByTestId(tree, 'shell-pinned-slot')[0]! as ParentedTestInstance
    let ancestor = pinnedSlot.parent
    while (ancestor && ancestor !== bottom) {
      const style = StyleSheet.flatten(ancestor.props.style) as ViewStyle | undefined
      if (typeof ancestor.type === 'string' && style?.maxWidth === 740) break
      ancestor = ancestor.parent
    }
    expect(ancestor).not.toBe(bottom)
    expect(StyleSheet.flatten(ancestor?.props.style)).toMatchObject({ alignSelf: 'center', maxWidth: 740, width: '100%' })
    for (const testID of ['shell-notice']) {
      expect(ancestor?.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)).toHaveLength(1)
    }
    expect(StyleSheet.flatten(bottom.props.style)).not.toHaveProperty('maxWidth')
    expect(StyleSheet.flatten(bottom.props.style)).toMatchObject({ paddingBottom: 24 })
  })

  it.each([412, 1352])('keeps notices inside the content margins at %ipx', async (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Shell412 notice={React.createElement('Notice')} tabBar={React.createElement('TabBar')} />)
    })
    expect(StyleSheet.flatten(findByTestId(tree, 'shell-notice')[0]!.props.style)).toMatchObject({ paddingHorizontal: 16 })
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('floats the FAB without reserving a band or drawing a hairline', async () => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Shell412 composer={React.createElement('Composer')} fab={React.createElement('Fab')} tabBar={React.createElement('TabBar')}><ScrollSurface /></Shell412>)
    })
    const band = StyleSheet.flatten(findByTestId(tree, 'shell-fab-band')[0]?.props.style as ViewStyle)
    expect(band).toMatchObject({ position: 'absolute', height: 96, bottom: 0, right: 0, left: 0 })
    expect(band).not.toHaveProperty('borderTopWidth')
    expect(band.backgroundColor, 'floating free space is transparent').toBeUndefined()
    expect(findByTestId(tree, 'shell-fab')[0]?.props.pointerEvents, 'overlay wrapper passes free-space touches').toBe('box-none')
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

  it.each([412, 1352])('keeps tab-only clearance without a composer band at %ipx', async (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Shell412 tabBar={React.createElement('TabBar')}><ScrollSurface /></Shell412>)
    })
    expect(findByTestId(tree, 'shell-tab-bar')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-composer-band')).toHaveLength(0)
    expect(StyleSheet.flatten(findByTestId(tree, 'scroll-surface')[0]?.props.contentContainerStyle)).toMatchObject({ paddingBottom: 32 })
    expect(StyleSheet.flatten(findByTestId(tree, 'shell-bottom')[0]?.props.style)).toMatchObject({ paddingBottom: 24 })
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

  it.each(['today', 'calendar', 'progress', 'profile'])('keeps the %s chrome and scroller under one keyboard owner', async (destination) => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412 composer={destination === 'today' ? React.createElement('Composer', { destination }) : undefined} tabBar={React.createElement('TabBar')}>
          {React.createElement('DestinationList', { destination })}
        </Shell412>,
      )
    })

    const owner = tree.root.findAll((node) => String(node.type) === 'KeyboardAvoidingView')
    expect(owner).toHaveLength(1)
    expect(owner[0]?.props.behavior).toBe('height')
    expect(owner[0]?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-scroller')).toHaveLength(1)
    expect(owner[0]?.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-pinned-slot')).toHaveLength(destination === 'today' ? 1 : 0)

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

  it('mounts Profile feedback above the tab bar without a composer', async () => {
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
          tabBar={React.createElement('TabBar')}
        >
          <ProfileExportNotice />
        </Shell412>,
      )
      await Promise.resolve()
    })

    const notice = findByTestId(tree, 'shell-notice')[0]
    expect(notice?.findAll((node) => String(node.type) === 'ExportDone')).toHaveLength(1)
    expect(findByTestId(tree, 'shell-pinned-slot')).toHaveLength(0)
    expect(findByTestId(tree, 'shell-tab-bar')).toHaveLength(1)
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
    expect(StyleSheet.flatten(fabBand?.props.style)).toMatchObject({ position: 'absolute', height: 96, bottom: 0 })
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
