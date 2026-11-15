import React from 'react'
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccessibilityInfo as TestAccessibilityInfo,
  __emitKeyboardEvent,
  __resetTestHostConfig,
  __setHostRefsNull,
  __setMeasureInWindowImpl,
  __setScrollToImpl,
} from '../../../test-mocks/react-native'
import {
  KeyboardAwareFlatList,
  KeyboardAwareScreenShiftProvider,
  KeyboardAwareScrollHost,
  KeyboardAwareSheetScrollView,
  KeyboardAwareScrollView,
  KeyboardAwareView,
  useKeyboardAwareInputReveal,
} from '@/components/ui/keyboard-aware-scroll-view'
import { KeyboardRevealGroup } from '@/components/ui/keyboard-reveal-group'
import { TypedTextInput } from '@/components/ui/typed-text-input'

const TestRenderer = require('react-test-renderer')

type RevealContext = ReturnType<typeof useKeyboardAwareInputReveal>

let capturedContext: RevealContext = null

function ContextProbe() {
  capturedContext = useKeyboardAwareInputReveal()
  return null
}

interface MeasureResult {
  y: number
  height: number
}

function createFocusableInput({ y, height }: MeasureResult) {
  __setMeasureInWindowImpl((callback) => callback(0, y, 0, height))
  const inputRef = React.createRef<TextInput>()
  TestRenderer.act(() => {
    TestRenderer.create(<TextInput ref={inputRef} />)
  })
  if (!inputRef.current) throw new Error('TextInput host ref was not assigned')
  return inputRef.current
}

function renderScrollView(onScroll?: (event: unknown) => void) {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <KeyboardAwareScrollView onScroll={onScroll}>
        <ContextProbe />
      </KeyboardAwareScrollView>,
    )
  })
  return tree!
}

describe('KeyboardAwareScrollView (mobile)', () => {
  beforeEach(() => {
    capturedContext = null
    __resetTestHostConfig()
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      callback(0)
      return 0
    })
  })

  afterEach(() => {
    __resetTestHostConfig()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('exposes the reveal context to descendants', () => {
    renderScrollView()
    expect(capturedContext).not.toBeNull()
    expect(typeof capturedContext?.revealInput).toBe('function')
    expect(typeof capturedContext?.handleScroll).toBe('function')
  })

  it('keeps input reveal without a second avoidance wrapper under the shell', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <KeyboardAwareScrollView avoidKeyboard={false}>
          <ContextProbe />
        </KeyboardAwareScrollView>,
      )
    })
    expect(tree!.root.findAll((node: { type: unknown }) => String(node.type) === 'KeyboardAvoidingView')).toHaveLength(0)
    expect(capturedContext?.revealInput).toBeTypeOf('function')
  })

  it('tracks scroll offset through the wrapped onScroll handler', () => {
    const onScroll = vi.fn()
    const tree = renderScrollView(onScroll)
    const scrollView = tree.root.findByType('ScrollView')
    const event = { nativeEvent: { contentOffset: { y: 240 } } }
    TestRenderer.act(() => {
      scrollView.props.onScroll(event)
    })
    expect(onScroll).toHaveBeenCalledWith(event)
  })

  it('reveals a field above the scroller after a person scrolls with the keyboard open', () => {
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    const tree = renderScrollView()
    const input = createFocusableInput({ y: 64, height: 54 })
    __setMeasureInWindowImpl((callback, _props, name) => name === 'ScrollView'
      ? callback(0, 80, 360, 320) : callback(0, 64, 360, 54))
    TestRenderer.act(() => {
      tree.root.findByType('ScrollView').props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } })
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      capturedContext?.revealInput(input)
    })
    expect(scrollTo).toHaveBeenCalledWith({ y: 260, animated: true })
  })

  it('ignores revealInput while the keyboard is hidden', () => {
    vi.useFakeTimers()
    renderScrollView()
    const input = createFocusableInput({ y: 500, height: 40 })
    TestRenderer.act(() => {
      capturedContext?.revealInput(input)
      vi.advanceTimersByTime(60)
    })
    expect(capturedContext).not.toBeNull()
  })

  it('scrolls a focused input into view after the keyboard shows', () => {
    vi.useFakeTimers()
    renderScrollView()
    const input = createFocusableInput({ y: 520, height: 44 })
    const measureSpy = vi.spyOn(input, 'measureInWindow')
    TestRenderer.act(() => {
      capturedContext?.revealInput(input)
    })
    TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      vi.advanceTimersByTime(60)
    })
    expect(measureSpy).toHaveBeenCalled()
  })

  it('leaves the scroll position untouched when the input already fits', () => {
    vi.useFakeTimers()
    renderScrollView()
    const input = createFocusableInput({ y: 10, height: 20 })
    const measureSpy = vi.spyOn(input, 'measureInWindow')
    TestRenderer.act(() => {
      capturedContext?.revealInput(input)
    })
    TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      vi.advanceTimersByTime(60)
    })
    expect(measureSpy).toHaveBeenCalled()
  })

  it('reveals immediately through requestAnimationFrame when the keyboard is already open', () => {
    renderScrollView()
    TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { duration: 0, easing: 'keyboard', endCoordinates: { screenY: 592, screenX: 0, width: 412, height: 300 } })
    })
    const input = createFocusableInput({ y: 700, height: 40 })
    const measureSpy = vi.spyOn(input, 'measureInWindow')
    TestRenderer.act(() => {
      capturedContext?.revealInput(input)
    })
    expect(measureSpy).toHaveBeenCalled()
  })

  it('stops revealing focused inputs once the keyboard hides', () => {
    renderScrollView()
    TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      __emitKeyboardEvent('keyboardDidHide')
    })
    const input = createFocusableInput({ y: 700, height: 40 })
    const measureSpy = vi.spyOn(input, 'measureInWindow')
    TestRenderer.act(() => {
      capturedContext?.revealInput(input)
    })
    expect(measureSpy).not.toHaveBeenCalled()
  })

  it('returns early when the scrollable ref is null', () => {
    vi.useFakeTimers()
    const input = createFocusableInput({ y: 700, height: 40 })
    __setHostRefsNull(true)
    renderScrollView()
    TestRenderer.act(() => {
      capturedContext?.revealInput(input)
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      vi.advanceTimersByTime(60)
    })
    expect(capturedContext).not.toBeNull()
  })

  it('does nothing on keyboard show when no input is focused', () => {
    vi.useFakeTimers()
    renderScrollView()
    TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      vi.advanceTimersByTime(60)
    })
    expect(capturedContext).not.toBeNull()
  })

  it('bails out for a numeric node handle that cannot be measured', () => {
    renderScrollView()
    TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
    })
    expect(() => {
      TestRenderer.act(() => {
        capturedContext?.revealInput(900)
      })
    }).not.toThrow()
  })

  it('cancels pending keyboard and focus animation frames on unmount', () => {
    let nextFrame = 0
    const pending = new Map<number, (timestamp: number) => void>()
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      pending.set(++nextFrame, callback)
      return nextFrame
    })
    const cancel = vi.fn((frame: number) => pending.delete(frame))
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const tree = renderScrollView()
    const input = createFocusableInput({ y: 700, height: 40 })
    TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
      capturedContext?.revealInput(input)
    })
    expect(pending.size).toBeGreaterThan(0)
    const frames = [...pending.keys()]
    TestRenderer.act(() => tree.unmount())
    expect(pending.size).toBe(0)
    for (const frame of frames) expect(cancel).toHaveBeenCalledWith(frame)
  })

  it('unsubscribes the keyboard listeners on unmount', () => {
    const tree = renderScrollView()
    TestRenderer.act(() => {
      tree.unmount()
    })
    const input = createFocusableInput({ y: 700, height: 40 })
    const measureSpy = vi.spyOn(input, 'measureInWindow')
    TestRenderer.act(() => {
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400 } })
    })
    expect(measureSpy).not.toHaveBeenCalled()
  })

  describe('a field and its action at 375 x 667 with the keyboard top at 432', () => {
    const SCREEN_HEIGHT = 667
    const KEYBOARD_TOP = 432
    const REVEAL_MARGIN = 24
    function renderFieldAndAction(group: { current: MeasureResult }) {
      const scrollTo = vi.fn()
      __setScrollToImpl(scrollTo)
      __setMeasureInWindowImpl((callback, props, name) => {
        if (name === 'ScrollView') callback(0, 20, 375, KEYBOARD_TOP - 20)
        else if (props.testID === 'field-action') callback(0, group.current.y, 375, group.current.height)
        else callback(0, 300, 375, 56)
      })
      let tree!: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => {
        tree = TestRenderer.create(
          <KeyboardAwareScrollView>
            <KeyboardRevealGroup testID="field-action">
              <TypedTextInput accessibilityLabel="Code" />
              <View accessibilityRole="button" />
            </KeyboardRevealGroup>
          </KeyboardAwareScrollView>,
        )
      })
      return { tree, scrollTo }
    }

    it('lifts the whole group above the keyboard when the field alone already fits', () => {
      const group = { current: { y: 300, height: 243 } }
      const { tree, scrollTo } = renderFieldAndAction(group)
      TestRenderer.act(() => tree.root.findByType(TextInput).props.onFocus({ nativeEvent: {} }))
      TestRenderer.act(() => __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: KEYBOARD_TOP } }))
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 300 + 243 - (KEYBOARD_TOP - REVEAL_MARGIN), animated: true })
    })

    it.each([true, false])('lifts the group with no animation exactly when reduce motion is on, as web jumps (reduce motion: %s)', (reduced) => {
      const listeners = new Set<(enabled: boolean) => void>()
      const subscription = vi.spyOn(TestAccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
        if (event === 'reduceMotionChanged') listeners.add(listener)
        return { remove: () => { listeners.delete(listener) } }
      })
      const { tree, scrollTo } = renderFieldAndAction({ current: { y: 300, height: 243 } })
      try {
        TestRenderer.act(() => listeners.forEach((listener) => listener(reduced)))
        TestRenderer.act(() => tree.root.findByType(TextInput).props.onFocus({ nativeEvent: {} }))
        TestRenderer.act(() => __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: KEYBOARD_TOP } }))
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 300 + 243 - (KEYBOARD_TOP - REVEAL_MARGIN), animated: !reduced })
      } finally {
        TestRenderer.act(() => listeners.forEach((listener) => listener(false)))
        TestRenderer.act(() => tree.unmount())
        subscription.mockRestore()
      }
    })

    it('lifts the group again when it grows while the field keeps focus', () => {
      const group = { current: { y: 200, height: 150 } }
      const { tree, scrollTo } = renderFieldAndAction(group)
      TestRenderer.act(() => tree.root.findByType(TextInput).props.onFocus({ nativeEvent: {} }))
      TestRenderer.act(() => __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: KEYBOARD_TOP } }))
      expect(scrollTo).not.toHaveBeenCalled()
      group.current = { y: 200, height: 150 + 65 + 24 }
      const groupHost = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'View' && node.props.testID === 'field-action')[0]
      TestRenderer.act(() => groupHost.props.onLayout())
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 200 + 239 - (KEYBOARD_TOP - REVEAL_MARGIN), animated: true })
    })

    function renderPaddedScroller(viewport: number, field: boolean) {
      __setMeasureInWindowImpl((callback) => callback(0, 20, 375, viewport))
      let tree!: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => {
        tree = TestRenderer.create(<KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          {field ? <TypedTextInput accessibilityLabel="Code" /> : <View />}
        </KeyboardAwareScrollView>)
      })
      if (field) TestRenderer.act(() => tree.root.findByType(TextInput).props.onFocus({ nativeEvent: {} }))
      const paddingBottom = () => StyleSheet.flatten(tree.root.findByType(ScrollView).props.contentContainerStyle).paddingBottom as number
      return { tree, paddingBottom }
    }

    it.each([{ viewport: SCREEN_HEIGHT - 20, label: 'under' }, { viewport: KEYBOARD_TOP - 20, label: 'above' }])(
      'ends the scroll of the focused field clear of the keyboard when the scroller reaches $label it', ({ viewport }) => {
        const { paddingBottom } = renderPaddedScroller(viewport, true)
        TestRenderer.act(() => __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: KEYBOARD_TOP } }))
        const lastLineBottomAtScrollEnd = 20 + viewport - paddingBottom()
        expect(lastLineBottomAtScrollEnd).toBeLessThanOrEqual(KEYBOARD_TOP - REVEAL_MARGIN)
      })

    it('keeps the reveal margin in a focused scroller that ends more than the margin above the keyboard, as the chat composer does', () => {
      const { paddingBottom } = renderPaddedScroller(KEYBOARD_TOP - 20 - REVEAL_MARGIN - 100, true)
      TestRenderer.act(() => __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: KEYBOARD_TOP } }))
      expect(paddingBottom()).toBe(16 + REVEAL_MARGIN)
    })

    const fieldlessScrollers = {
      ScrollView: () => <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: 16 }}><View /></KeyboardAwareScrollView>,
      SheetScrollView: () => <KeyboardAwareSheetScrollView contentContainerStyle={{ paddingBottom: 16 }}><View /></KeyboardAwareSheetScrollView>,
      FlatList: () => <KeyboardAwareFlatList data={[]} renderItem={() => null} contentContainerStyle={{ paddingBottom: 16 }} />,
      ScrollHost: function ScrollHost() {
        const scrollRef = React.useRef<ScrollView>(null)
        return <KeyboardAwareScrollHost scrollRef={scrollRef as unknown as React.RefObject<null>} contentContainerStyle={{ paddingBottom: 16 }}>
          {(bindings) => <ScrollView ref={scrollRef} contentContainerStyle={bindings.contentContainerStyle} />}
        </KeyboardAwareScrollHost>
      },
    }

    it.each(Object.keys(fieldlessScrollers) as (keyof typeof fieldlessScrollers)[])(
      'keeps the covered part and the reveal margin in a %s that holds no field, so a list beside the field ends as far above the keyboard as before', (kind) => {
        __setMeasureInWindowImpl((callback) => callback(0, 20, 375, SCREEN_HEIGHT - 20))
        let tree!: ReturnType<typeof TestRenderer.create>
        const Scroller = fieldlessScrollers[kind]
        TestRenderer.act(() => { tree = TestRenderer.create(<Scroller />) })
        TestRenderer.act(() => __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: KEYBOARD_TOP } }))
        const host = tree.root.findAll((node: { type: unknown }) => node.type === 'ScrollView' || node.type === 'FlatList')[0]
        expect(StyleSheet.flatten(host.props.contentContainerStyle).paddingBottom).toBe(16 + SCREEN_HEIGHT - KEYBOARD_TOP + REVEAL_MARGIN)
      })

    function renderNestedScrollers(group: boolean) {
      const outerPadding = () => StyleSheet.flatten(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'ScrollView' && node.props.testID === 'outer')[0].props.contentContainerStyle).paddingBottom as number
      const innerPadding = () => StyleSheet.flatten(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'ScrollView' && node.props.testID === 'inner')[0].props.contentContainerStyle).paddingBottom as number
      __setMeasureInWindowImpl((callback, props, name) => {
        if (name === 'ScrollView' && props.testID === 'outer') callback(0, 0, 375, SCREEN_HEIGHT)
        else if (name === 'ScrollView') callback(0, 20, 375, KEYBOARD_TOP - 20)
        else callback(0, 200, 375, 56)
      })
      const field = <TypedTextInput accessibilityLabel="Email" />
      const screen = (withGroup: boolean) => <KeyboardAwareSheetScrollView testID="outer" contentContainerStyle={{ paddingBottom: 16 }}>
        <KeyboardAwareScrollView testID="inner" avoidKeyboard={false} contentContainerStyle={{ paddingBottom: 16 }}>
          {withGroup ? <KeyboardRevealGroup testID="field-action">{field}</KeyboardRevealGroup> : field}
        </KeyboardAwareScrollView>
      </KeyboardAwareSheetScrollView>
      let tree!: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { tree = TestRenderer.create(screen(group)) })
      TestRenderer.act(() => tree.root.findByType(TextInput).props.onFocus({ nativeEvent: {} }))
      TestRenderer.act(() => __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: KEYBOARD_TOP } }))
      return { tree, screen, outerPadding, innerPadding }
    }

    it('lets a scroller with a field and action group reach the keyboard edge: the scroller around it reserves only the covered part', () => {
      const { tree, screen, outerPadding, innerPadding } = renderNestedScrollers(true)
      expect(outerPadding()).toBe(16 + SCREEN_HEIGHT - KEYBOARD_TOP)
      expect(innerPadding()).toBe(16 + REVEAL_MARGIN)
      TestRenderer.act(() => tree.update(screen(false)))
      expect(outerPadding()).toBe(16 + SCREEN_HEIGHT - KEYBOARD_TOP + REVEAL_MARGIN)
    })

    it('keeps the reveal margin in the scroller around a nested field that has no group, as before', () => {
      const { outerPadding } = renderNestedScrollers(false)
      expect(outerPadding()).toBe(16 + SCREEN_HEIGHT - KEYBOARD_TOP + REVEAL_MARGIN)
    })

    it.each([true, false])('drops the keyboard space when iOS hides the keyboard and then reports the end frame (focused field: %s)', (field) => {
      const previous = Platform.OS
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })
      try {
        const { tree, paddingBottom } = renderPaddedScroller(SCREEN_HEIGHT - 20, field)
        TestRenderer.act(() => {
          __emitKeyboardEvent('keyboardWillShow', { endCoordinates: { screenY: KEYBOARD_TOP } })
          __emitKeyboardEvent('keyboardDidChangeFrame', { endCoordinates: { screenY: KEYBOARD_TOP } })
        })
        expect(paddingBottom()).toBeGreaterThan(16)
        TestRenderer.act(() => {
          if (field) tree.root.findByType(TextInput).props.onBlur({ nativeEvent: {} })
          __emitKeyboardEvent('keyboardWillHide')
          __emitKeyboardEvent('keyboardDidChangeFrame', { endCoordinates: { screenY: SCREEN_HEIGHT } })
          __emitKeyboardEvent('keyboardDidHide')
        })
        expect(paddingBottom()).toBe(16)
      } finally {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: previous })
      }
    })
  })
})

describe('KeyboardAwareSheetScrollView (mobile)', () => {
  beforeEach(() => {
    __resetTestHostConfig()
  })
  afterEach(() => {
    __resetTestHostConfig()
  })

  it('wraps children and forwards scroll events', () => {
    const onScroll = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <KeyboardAwareSheetScrollView onScroll={onScroll} contentContainerStyle={{ padding: 4 }}>
          <ContextProbe />
        </KeyboardAwareSheetScrollView>,
      )
    })
    const event = { nativeEvent: { contentOffset: { y: 12 } } }
    TestRenderer.act(() => {
      tree!.root.findByType('ScrollView').props.onScroll(event)
    })
    expect(tree!.root.findByType('ScrollView').props.nestedScrollEnabled).toBe(true)
    expect(onScroll).toHaveBeenCalledWith(event)
  })

  it('lifts a focused sheet field above the footer and keyboard when the sheet draws below where its content is measured', () => {
    const SHEET_TOP = 160
    const KEYBOARD_TOP = 590
    const FOOTER = 100
    const REVEAL_MARGIN = 24
    const field = { y: 400, height: 54 }
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      callback(0)
      return 0
    })
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    __setMeasureInWindowImpl((callback, _props, name) => {
      if (name === 'ScrollView') callback(0, 70, 375, 580)
      else callback(0, field.y, 375, field.height)
    })
    let tree!: ReturnType<typeof TestRenderer.create>
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(
          <KeyboardAwareScreenShiftProvider value={() => SHEET_TOP}>
            <KeyboardAwareSheetScrollView keyboardVerticalOffset={FOOTER}>
              <TypedTextInput accessibilityLabel="Anything to note?" />
            </KeyboardAwareSheetScrollView>
          </KeyboardAwareScreenShiftProvider>,
        )
      })
      TestRenderer.act(() => tree.root.findByType(TextInput).props.onFocus({ nativeEvent: {} }))
      TestRenderer.act(() => __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: KEYBOARD_TOP } }))
      const keyboardEdgeInSheet = KEYBOARD_TOP - SHEET_TOP - FOOTER
      expect(scrollTo).toHaveBeenLastCalledWith({ y: field.y + field.height - (keyboardEdgeInSheet - REVEAL_MARGIN), animated: true })
      expect(StyleSheet.flatten(tree.root.findByType(ScrollView).props.contentContainerStyle).paddingBottom).toBe(70 + 580 - keyboardEdgeInSheet + REVEAL_MARGIN)
    } finally {
      TestRenderer.act(() => tree.unmount())
      vi.unstubAllGlobals()
    }
  })
})

describe('KeyboardAwareFlatList (mobile)', () => {
  beforeEach(() => {
    __resetTestHostConfig()
  })
  afterEach(() => {
    __resetTestHostConfig()
  })

  it('assigns a function ref and forwards scroll events', () => {
    const listRef = vi.fn()
    const onScroll = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <KeyboardAwareFlatList
          ref={listRef}
          data={[]}
          renderItem={() => null}
          onScroll={onScroll}
        />,
      )
    })
    expect(listRef).toHaveBeenCalled()
    const event = { nativeEvent: { contentOffset: { y: 8 } } }
    TestRenderer.act(() => {
      tree!.root.findByType('FlatList').props.onScroll(event)
    })
    expect(onScroll).toHaveBeenCalledWith(event)
  })

  it('assigns an object ref', () => {
    const listRef = React.createRef<unknown>()
    TestRenderer.act(() => {
      TestRenderer.create(
        <KeyboardAwareFlatList
          ref={listRef as React.Ref<never>}
          data={[]}
          renderItem={() => null}
        />,
      )
    })
    expect(listRef.current).not.toBeNull()
  })
})

describe('KeyboardAwareView (mobile)', () => {
  it('resolves the android height behavior by default', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <KeyboardAwareView>
          <ContextProbe />
        </KeyboardAwareView>,
      )
    })
    expect(tree!.root.findByType('KeyboardAvoidingView').props.behavior).toBe('height')
  })

  it('honors an explicit behavior override', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<KeyboardAwareView behavior="position">child</KeyboardAwareView>)
    })
    expect(tree!.root.findByType('KeyboardAvoidingView').props.behavior).toBe('position')
  })
})
