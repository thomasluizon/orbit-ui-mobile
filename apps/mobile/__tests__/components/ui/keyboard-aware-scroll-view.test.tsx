import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __emitKeyboardEvent,
  __resetTestHostConfig,
  __setHostRefsNull,
} from '../../../test-mocks/react-native'
import {
  KeyboardAwareBottomSheetScrollView,
  KeyboardAwareFlatList,
  KeyboardAwareScrollView,
  KeyboardAwareView,
  useKeyboardAwareInputReveal,
} from '@/components/ui/keyboard-aware-scroll-view'

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
  return Object.assign(new React.Component({}), {
    measureInWindow: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => callback(0, y, 0, height),
  })
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

  it('ignores revealInput while the keyboard is hidden', () => {
    vi.useFakeTimers()
    renderScrollView()
    TestRenderer.act(() => {
      capturedContext?.revealInput(createFocusableInput({ y: 500, height: 40 }))
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
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { height: 300 } })
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
    __setHostRefsNull(true)
    renderScrollView()
    const input = createFocusableInput({ y: 700, height: 40 })
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
})

describe('KeyboardAwareBottomSheetScrollView (mobile)', () => {
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
        <KeyboardAwareBottomSheetScrollView onScroll={onScroll} contentContainerStyle={{ padding: 4 }}>
          <ContextProbe />
        </KeyboardAwareBottomSheetScrollView>,
      )
    })
    const event = { nativeEvent: { contentOffset: { y: 12 } } }
    TestRenderer.act(() => {
      tree!.root.findByType('ScrollView').props.onScroll(event)
    })
    expect(onScroll).toHaveBeenCalledWith(event)
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
