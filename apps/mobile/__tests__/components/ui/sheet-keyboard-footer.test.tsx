import React from 'react'
import { Platform, StyleSheet, Text } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import {
  __emitKeyboardEvent,
  __setWindowDimensions,
  __resetTestHostConfig,
  __setMeasureInWindowImpl,
  __setScrollToImpl,
} from '../../../test-mocks/react-native'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { Sheet } from '@/components/ui/sheet'
import { useUIStore } from '@/stores/ui-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { PillButton } from '@/components/ui/pill-button'
import { KeyboardAwareSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { createTokensV2 } from '@/lib/theme'

vi.unmock('@/components/ui/sheet')

const safeArea = vi.hoisted(() => ({ bottom: 24, left: 0, right: 0 }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, ...safeArea }),
}))

const { present } = vi.hoisted(() => ({ present: vi.fn(() => Promise.resolve()) }))
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode; footer?: React.ReactNode }> {
    present = present
    dismiss = vi.fn(() => Promise.resolve())
    render() {
      return <>{this.props.children}{this.props.footer}</>
    }
  },
}))

const TestRenderer = require('react-test-renderer')

describe('Sheet footer and keyboard (mobile)', () => {
  beforeEach(() => {
    safeArea.bottom = 24
    useUIStore.setState({ openOverlayIds: [] })
    useAppToastStore.setState({ currentToast: null, queue: [] })
    present.mockReset()
    present.mockResolvedValue(undefined)
    __resetTestHostConfig()
  })

  afterEach(() => {
    __resetTestHostConfig()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([0, 76])('reveals a focused lower input above a %i-high footer through the sheet body scroller', async (footerHeight) => {
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => setTimeout(() => callback(0), 0))
    vi.useFakeTimers()
    const scrollTo = vi.fn()
    __setMeasureInWindowImpl((callback, _props, name) => name === 'ScrollView' ? callback(0, 0, 360, 740) : callback(0, 620, 100, 54))
    __setScrollToImpl(scrollTo)
    let tree: ReturnType<typeof TestRenderer.create>

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open actions={footerHeight ? <PillButton onClick={vi.fn()}>Save</PillButton> : undefined}>
          <BottomSheetAppTextInput testID="lower-input" value="Lower field" />
        </Sheet>,
      )
      await Promise.resolve()
    })

    if (footerHeight) {
      TestRenderer.act(() => {
        tree!.root.findByType(TrueSheet).props.footer.props.onLayout({ nativeEvent: { layout: { height: footerHeight } } })
      })
    }

    TestRenderer.act(() => {
      const lowerInput = tree!.root.findAllByType('TextInput').find((node: { props: { testID?: string } }) => node.props.testID === 'lower-input')
      lowerInput!.props.onFocus({})
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      vi.advanceTimersByTime(60)
    })

    expect(scrollTo).toHaveBeenCalledWith({ y: 298 + (footerHeight ? footerHeight + safeArea.bottom : 0), animated: true })
  })

  it.each(['android', 'ios'] as const)('measures the %s keyboard edge from where the presented sheet draws its body', async (platform) => {
    const previous = Platform.OS
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
    const SHEET_TOP = 160
    const HEADER = 72
    const FOOTER = 76
    const KEYBOARD_TOP = 590
    const field = { y: 400, height: 54 }
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => setTimeout(() => callback(0), 0))
    vi.useFakeTimers()
    const scrollTo = vi.fn()
    __setMeasureInWindowImpl((callback, _props, name) => name === 'ScrollView' ? callback(0, HEADER, 360, 580) : callback(0, field.y, 100, field.height))
    __setScrollToImpl(scrollTo)
    let tree!: ReturnType<typeof TestRenderer.create>
    try {
      await TestRenderer.act(async () => {
        tree = TestRenderer.create(
          <Sheet open title="Edit habit" onClose={vi.fn()} actions={<PillButton onClick={vi.fn()}>Save</PillButton>}>
            <BottomSheetAppTextInput testID="note-input" value="" />
          </Sheet>,
        )
        await Promise.resolve()
      })
      const nativeSheet = tree.root.findByType(TrueSheet)
      TestRenderer.act(() => {
        nativeSheet.props.header.props.onLayout({ nativeEvent: { layout: { height: HEADER } } })
        nativeSheet.props.footer.props.onLayout({ nativeEvent: { layout: { height: FOOTER } } })
      })
      TestRenderer.act(() => tree.root.findByType(TrueSheet).props.onDidPresent({ nativeEvent: { index: 0, position: SHEET_TOP, detent: 1 } }))
      const bodyPadding = () => StyleSheet.flatten(tree.root.findByType(KeyboardAwareSheetScrollView).findByType('ScrollView').props.contentContainerStyle).paddingBottom ?? 0
      const restingPadding = bodyPadding()
      TestRenderer.act(() => {
        tree.root.findAllByType('TextInput').find((node: { props: { testID?: string } }) => node.props.testID === 'note-input')!.props.onFocus({})
        __emitKeyboardEvent(platform === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', { endCoordinates: { screenY: KEYBOARD_TOP } })
        vi.advanceTimersByTime(60)
      })
      const keyboardEdgeInSheet = KEYBOARD_TOP - FOOTER - safeArea.bottom - (platform === 'android' ? SHEET_TOP : 0)
      expect(bodyPadding() - restingPadding).toBe(HEADER + 580 - keyboardEdgeInSheet + 24)
      if (platform === 'android') {
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 148, animated: true })
      } else {
        expect(field.y + field.height).toBeLessThanOrEqual(keyboardEdgeInSheet - 24)
        expect(scrollTo).not.toHaveBeenCalled()
      }
    } finally {
      TestRenderer.act(() => tree.unmount())
      Object.defineProperty(Platform, 'OS', { configurable: true, value: previous })
    }
  })

  it.each([0, 24])('reserves the measured footer above a %i bottom inset and uses its full height for the keyboard', async (bottomInset) => {
    safeArea.bottom = bottomInset
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open title="T" actions={<PillButton onClick={vi.fn()}>Save</PillButton>}><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })
    const footer = tree!.root.findByType(TrueSheet).props.footer
    TestRenderer.act(() => footer.props.onLayout({ nativeEvent: { layout: { height: 76 } } }))
    const scroller = tree!.root.findByType(KeyboardAwareSheetScrollView)
    expect(tree!.root.findByProps({ testID: 'sheet-footer-space' }).props.style.height).toBe(76)
    expect(scroller.findAllByProps({ testID: 'sheet-footer-space' })).toHaveLength(0)
    expect(scroller.props.keyboardVerticalOffset).toBe(76 + bottomInset)
    TestRenderer.act(() => footer.props.onLayout({ nativeEvent: { layout: { height: 112 } } }))
    expect(tree!.root.findByType(KeyboardAwareSheetScrollView).props.keyboardVerticalOffset).toBe(112 + bottomInset)
    expect(tree!.root.findByProps({ testID: 'sheet-footer-space' }).props.style.height).toBe(112)
    TestRenderer.act(() => tree!.unmount())
  })

  it.each([
    { width: 1280, height: 640, fontScale: 2, headerHeight: 100, footerHeight: 112, bottomInset: 24 },
    { width: 640, height: 320, fontScale: 1, headerHeight: 72, footerHeight: 76, bottomInset: 0 },
  ])('bounds the focus-scrolling viewport above the footer at $width by $height with font scale $fontScale', async ({ width, height, fontScale, headerHeight, footerHeight, bottomInset }) => {
    safeArea.bottom = bottomInset
    __setWindowDimensions({ width, height, scale: 1, fontScale })
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open title="Editor" actions={<PillButton onClick={vi.fn()}>Save</PillButton>}><Text>Parent</Text></Sheet>)
      await Promise.resolve()
    })
    const nativeSheet = tree!.root.findByType(TrueSheet)
    TestRenderer.act(() => {
      nativeSheet.props.header.props.onLayout({ nativeEvent: { layout: { height: headerHeight } } })
      nativeSheet.props.footer.props.onLayout({ nativeEvent: { layout: { height: footerHeight } } })
    })
    const scroller = tree!.root.findByType(KeyboardAwareSheetScrollView)
    const viewportHeight = StyleSheet.flatten(scroller.props.style).maxHeight
    const footerTop = nativeSheet.props.maxContentHeight + bottomInset - footerHeight
    expect(headerHeight + viewportHeight + bottomInset).toBeLessThanOrEqual(footerTop)
    expect(viewportHeight).toBeGreaterThanOrEqual(48)
    expect(scroller.findAllByProps({ testID: 'sheet-footer-space' })).toHaveLength(0)
    TestRenderer.act(() => tree!.unmount())
  })

  it('paints the measured native footer with the sheet surface', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open actions={<PillButton onClick={vi.fn()}>Save</PillButton>}><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })
    expect(StyleSheet.flatten(tree!.root.findByType(TrueSheet).props.footer.props.style)).toMatchObject({ backgroundColor: createTokensV2().bgSheet })
    TestRenderer.act(() => tree!.unmount())
  })

  it('clears the footer reserve and keyboard offset when actions leave the sheet', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open actions={<Text>Save</Text>}><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })
    TestRenderer.act(() => tree!.root.findByType(TrueSheet).props.footer.props.onLayout({ nativeEvent: { layout: { height: 76 } } }))
    TestRenderer.act(() => tree!.update(<Sheet open><Text>Body</Text></Sheet>))
    expect(tree!.root.findByType(TrueSheet).props.footer).toBeUndefined()
    expect(tree!.root.findByProps({ testID: 'sheet-footer-space' }).props.style.height).toBe(0)
    expect(tree!.root.findByType(KeyboardAwareSheetScrollView).props.keyboardVerticalOffset).toBeUndefined()
    TestRenderer.act(() => tree!.unmount())
  })

  it('keeps actions in the native fixed footer', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open title="Title" actions={<Text>Save</Text>}><Text>Body</Text></Sheet>,
      )
      await Promise.resolve()
    })
    const nativeSheet = tree.root.findByType(TrueSheet)
    expect(nativeSheet.props.footer).toBeDefined()
    const bodyScroller = tree.root.findAllByType('ScrollView')[0]
    const bodyStyle = (StyleSheet.flatten(bodyScroller.props.style) ?? {}) as { flex?: number; flexGrow?: number }
    const contentStyle = StyleSheet.flatten(bodyScroller.props.contentContainerStyle) as { flex?: number; flexGrow?: number }
    expect(bodyStyle.flex).toBeUndefined()
    expect(bodyStyle.flexGrow).toBeUndefined()
    expect(contentStyle.flex).toBeUndefined()
    expect(contentStyle.flexGrow).toBeUndefined()
    const actions = nativeSheet.props.footer.props.children[1]
    expect(StyleSheet.flatten(nativeSheet.props.footer.props.style)).not.toHaveProperty('paddingBottom')
    expect(StyleSheet.flatten(actions.props.style)).toMatchObject({ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 })
    expect(nativeSheet.props.footer.props.onLayout).toBeTypeOf('function')
    await TestRenderer.act(() => {
      nativeSheet.props.footer.props.onLayout({ nativeEvent: { layout: { height: 112 } } })
    })
    expect(tree.root.findByProps({ testID: 'sheet-footer-space' }).props.style.height).toBe(112)
    await TestRenderer.act(() => {
      nativeSheet.props.header.props.onLayout({ nativeEvent: { layout: { height: 56 } } })
    })
    const measuredScroller = tree.root.findAllByType('ScrollView')[0]
    expect(measuredScroller.props.style.maxHeight).toBeCloseTo(892 * 0.85 - 24 - 56 - 24 - 112)
  })

  it.each([false, true])('separates footer actions with space only with virtualizedBody=%s', async (virtualizedBody) => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Sheet open virtualizedBody={virtualizedBody} actions={<Text>Save</Text>}>
          <Text>Body</Text>
        </Sheet>,
      )
      await Promise.resolve()
    })
    try {
      const footer = tree!.root.findByType(TrueSheet).props.footer
      const actions = footer.props.children[1]
      const footerStyle = StyleSheet.flatten(footer.props.style)
      const actionStyle = StyleSheet.flatten(actions.props.style)
      const body = tree!.root.findByProps({ testID: virtualizedBody ? 'sheet-virtualized-body' : 'sheet-body-scroll' })
      const bodyStyle = StyleSheet.flatten(virtualizedBody ? body.props.style : body.props.contentContainerStyle)
      expect(bodyStyle.paddingBottom).toBe(virtualizedBody ? 0 : 24)
      expect(actionStyle.paddingTop).toBe(16)
      expect(actionStyle.borderTopWidth ?? actionStyle.borderWidth ?? 0).toBe(0)
      expect(footerStyle.borderTopWidth ?? footerStyle.borderWidth ?? 0).toBe(0)
    } finally {
      TestRenderer.act(() => tree!.unmount())
    }
  })

  it('keeps a persistent sheet error clear of the bottom inset', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Sheet open title="Title"><Text>Body</Text></Sheet>)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      useAppToastStore.getState().showError('Could not save')
      await Promise.resolve()
    })

    const footer = tree.root.findByType(TrueSheet).props.footer
    expect(footer).toBeDefined()
    expect(StyleSheet.flatten(footer.props.style)).not.toHaveProperty('paddingBottom')
    TestRenderer.act(() => tree.unmount())
  })
})
