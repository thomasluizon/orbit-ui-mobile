import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  findNodeHandle,
  useWindowDimensions,
  type KeyboardEvent,
  type FlatListProps,
  type KeyboardAvoidingViewProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
interface KeyboardAwareViewProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  keyboardVerticalOffset?: number
  behavior?: Exclude<KeyboardAvoidingViewProps['behavior'], undefined>
  avoidKeyboard?: boolean
}

interface KeyboardAwareScrollViewProps extends ComponentProps<typeof ScrollView> {
  children: ReactNode
  containerStyle?: StyleProp<ViewStyle>
  keyboardVerticalOffset?: number
  behavior?: Exclude<KeyboardAvoidingViewProps['behavior'], undefined>
  avoidKeyboard?: boolean
}

interface KeyboardAwareSheetScrollViewProps
  extends ComponentProps<typeof ScrollView> {
  ref?: Ref<ScrollView>
  children: ReactNode
  keyboardVerticalOffset?: number
}

interface KeyboardAwareFlatListProps<ItemT> extends FlatListProps<ItemT> {
  keyboardVerticalOffset?: number
}

type KeyboardAwareScrollable = {
  measureInWindow?: MeasurableInWindow['measureInWindow']
  getNativeScrollRef?: () => MeasurableInWindow | null
  getScrollResponder?: () => {
    scrollResponderScrollNativeHandleToKeyboard?: (
      nodeHandle: number,
      additionalOffset?: number,
      preventNegativeScrollOffset?: boolean,
    ) => void
  } | null
  scrollResponderScrollNativeHandleToKeyboard?: (
    nodeHandle: number,
    additionalOffset?: number,
    preventNegativeScrollOffset?: boolean,
  ) => void
  scrollTo?: (
    y?: number | { x?: number; y?: number; animated?: boolean },
    x?: number,
    animated?: boolean,
  ) => void
  scrollToOffset?: (params: { animated?: boolean | null; offset: number }) => void
}

type KeyboardAwareInputTarget = Parameters<typeof findNodeHandle>[0]

type MeasurableInWindow = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void
}

interface KeyboardAwareKeyboardFrame {
  top: number
}

interface KeyboardAwareContextValue {
  revealInput: (input: KeyboardAwareInputTarget) => void
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  refresh: () => void
  clearInput: (input: KeyboardAwareInputTarget) => void
  keyboardSpace: number
}

const KeyboardAwareContext = createContext<KeyboardAwareContextValue | null>(null)

function resolveKeyboardBehavior(
  behavior?: KeyboardAvoidingViewProps['behavior'],
): KeyboardAvoidingViewProps['behavior'] {
  if (behavior) return behavior
  return Platform.OS === 'ios' ? 'padding' : 'height'
}

function scrollFocusedInputIntoView(
  scrollable: KeyboardAwareScrollable | null,
  input: KeyboardAwareInputTarget,
  keyboardFrame: KeyboardAwareKeyboardFrame | null,
  currentScrollY: number,
  additionalOffset: number,
) {
  if (!scrollable || !input || !keyboardFrame) {
    return
  }

  const nodeHandle =
    typeof input === 'number' ? input : findNodeHandle(input)

  if (!nodeHandle) {
    return
  }

  const measurableInput =
    typeof input !== 'number' && 'measureInWindow' in input
      ? (input as MeasurableInWindow)
      : null

  if (!measurableInput) {
    return
  }

  measurableInput.measureInWindow((_x, y, _width, height) => {
    const desiredBottom = keyboardFrame.top - additionalOffset
    const inputBottom = y + height

    if (inputBottom <= desiredBottom) {
      return
    }

    const nextScrollY = Math.max(
      0,
      currentScrollY + (inputBottom - desiredBottom),
    )

    if (typeof scrollable.scrollToOffset === 'function') {
      scrollable.scrollToOffset({ offset: nextScrollY, animated: true })
      return
    }

    if (typeof scrollable.scrollTo === 'function') {
      scrollable.scrollTo({ y: nextScrollY, animated: true })
      return
    }

    if (
      typeof scrollable.scrollResponderScrollNativeHandleToKeyboard === 'function'
    ) {
      scrollable.scrollResponderScrollNativeHandleToKeyboard(
        nodeHandle,
        additionalOffset,
        true,
      )
      return
    }

    const responder =
      typeof scrollable.getScrollResponder === 'function'
        ? scrollable.getScrollResponder()
        : null

    responder?.scrollResponderScrollNativeHandleToKeyboard?.(
      nodeHandle,
      additionalOffset,
      true,
    )
  })
}

function useKeyboardAwareContextValue(
  scrollableRef: RefObject<KeyboardAwareScrollable | null>,
  keyboardVerticalOffset: number,
) {
  const focusedInputRef = useRef<KeyboardAwareInputTarget>(null)
  const keyboardFrameRef = useRef<KeyboardAwareKeyboardFrame | null>(null)
  const scrollOffsetYRef = useRef(0)
  const [keyboardSpace, setKeyboardSpace] = useState(0)
  const { width, height } = useWindowDimensions()

  const refresh = useCallback(() => {
    const scrollable = scrollableRef.current
    const frame = keyboardFrameRef.current
    if (!scrollable || !frame) return
    const viewport = scrollable.getNativeScrollRef?.() ?? scrollable
    viewport.measureInWindow?.((_x, y, _width, viewportHeight) => {
      const visibleBottom = Math.min(y + viewportHeight, frame.top - keyboardVerticalOffset)
      setKeyboardSpace(Math.max(0, y + viewportHeight - visibleBottom) + 24)
      scrollFocusedInputIntoView(scrollable, focusedInputRef.current,
        { top: visibleBottom }, scrollOffsetYRef.current, 24)
    })
  }, [keyboardVerticalOffset, scrollableRef])
  const revealInput = useCallback((input: KeyboardAwareInputTarget) => {
    focusedInputRef.current = input
    requestAnimationFrame(refresh)
  }, [refresh])
  const clearInput = useCallback((input: KeyboardAwareInputTarget) => {
    if (focusedInputRef.current === input) focusedInputRef.current = null
  }, [])
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetYRef.current = event.nativeEvent.contentOffset.y
  }, [])

  useEffect(() => {
    let active = true
    const update = (event: KeyboardEvent) => {
      keyboardFrameRef.current = { top: event.endCoordinates.screenY }
      requestAnimationFrame(() => { if (active) refresh() })
    }
    const hide = () => {
      keyboardFrameRef.current = null
      setKeyboardSpace(0)
    }
    const metrics = Keyboard.metrics()
    if (metrics) {
      keyboardFrameRef.current = { top: metrics.screenY }
      requestAnimationFrame(() => { if (active) refresh() })
    }
    const subscriptions = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', update),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', hide),
      Keyboard.addListener('keyboardDidChangeFrame', update),
    ]
    return () => { active = false; subscriptions.forEach(subscription => subscription.remove()) }
  }, [refresh, width, height])

  return useMemo(() => ({ revealInput, clearInput, handleScroll, refresh, keyboardSpace }),
    [revealInput, clearInput, handleScroll, refresh, keyboardSpace])
}

function keyboardContentStyle(style: StyleProp<ViewStyle>, keyboardSpace: number) {
  if (!keyboardSpace) return style
  const padding = StyleSheet.flatten([style])
  return [style, { paddingBottom: (padding.paddingBottom ?? padding.paddingVertical ?? padding.padding ?? 0) as number + keyboardSpace }]
}

export function useKeyboardAwareInputReveal() {
  return useContext(KeyboardAwareContext)
}

export function KeyboardAwareView({
  children,
  style,
  keyboardVerticalOffset = 0,
  behavior,
  avoidKeyboard = true,
}: Readonly<KeyboardAwareViewProps>) {
  return (
    <KeyboardAvoidingView
      style={style}
      behavior={avoidKeyboard ? resolveKeyboardBehavior(behavior) : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  )
}

export function KeyboardAwareScrollView({
  children,
  containerStyle,
  keyboardVerticalOffset = 0,
  behavior,
  avoidKeyboard = true,
  keyboardShouldPersistTaps = 'always',
  contentInsetAdjustmentBehavior = 'automatic',
  ...props
}: Readonly<KeyboardAwareScrollViewProps>) {
  const scrollRef = useRef<ScrollView>(null)
  const keyboardAwareContext = useKeyboardAwareContextValue(
    scrollRef,
    keyboardVerticalOffset,
  )
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      keyboardAwareContext.handleScroll(event)
      props.onScroll?.(event)
    },
    [keyboardAwareContext, props],
  )

  const scrollContent = (
    <ScrollView
      {...props}
      ref={scrollRef}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
      onScroll={handleScroll}
      contentContainerStyle={keyboardContentStyle(props.contentContainerStyle, keyboardAwareContext.keyboardSpace)}
      onLayout={(event) => { keyboardAwareContext.refresh(); props.onLayout?.(event) }}
      onContentSizeChange={(width, height) => { keyboardAwareContext.refresh(); props.onContentSizeChange?.(width, height) }}
    >
      {children}
    </ScrollView>
  )

  return (
    <KeyboardAwareContext.Provider value={keyboardAwareContext}>
      {avoidKeyboard ? (
        <KeyboardAwareView
          style={[styles.container, containerStyle]}
          keyboardVerticalOffset={keyboardVerticalOffset}
          behavior={behavior}
        >
          {scrollContent}
        </KeyboardAwareView>
      ) : (
        <View style={[styles.container, containerStyle]}>{scrollContent}</View>
      )}
    </KeyboardAwareContext.Provider>
  )
}

export function KeyboardAwareSheetScrollView({
  children,
  ref,
  keyboardVerticalOffset = 0,
  keyboardShouldPersistTaps = 'always',
  ...props
}: Readonly<KeyboardAwareSheetScrollViewProps>) {
  const scrollRef = useRef<ScrollView>(null)
  const keyboardAwareContext = useKeyboardAwareContextValue(
    scrollRef,
    keyboardVerticalOffset,
  )
  const assignRef = useCallback((node: ScrollView | null) => {
    scrollRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }, [ref])
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      keyboardAwareContext.handleScroll(event)
      props.onScroll?.(event)
    },
    [keyboardAwareContext, props],
  )
  return (
    <KeyboardAwareContext.Provider value={keyboardAwareContext}>
      <ScrollView
        {...props}
        ref={assignRef}
        style={props.style}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        nestedScrollEnabled
        onScroll={handleScroll}
        contentContainerStyle={keyboardContentStyle(props.contentContainerStyle, keyboardAwareContext.keyboardSpace)}
        onLayout={(event) => { keyboardAwareContext.refresh(); props.onLayout?.(event) }}
        onContentSizeChange={(width, height) => { keyboardAwareContext.refresh(); props.onContentSizeChange?.(width, height) }}
      >
        {children}
      </ScrollView>
    </KeyboardAwareContext.Provider>
  )
}

function KeyboardAwareFlatListInner<ItemT>(
  {
    keyboardVerticalOffset = 0,
    ...props
  }: Readonly<KeyboardAwareFlatListProps<ItemT>>,
  ref: Ref<FlatList<ItemT>>,
) {
  const listRef = useRef<FlatList<ItemT>>(null)
  const keyboardAwareContext = useKeyboardAwareContextValue(
    listRef as RefObject<KeyboardAwareScrollable | null>,
    keyboardVerticalOffset,
  )

  const assignRef = useCallback(
    (node: FlatList<ItemT> | null) => {
      listRef.current = node

      if (typeof ref === 'function') {
        ref(node)
        return
      }

      if (ref) {
        ref.current = node
      }
    },
    [ref],
  )
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      keyboardAwareContext.handleScroll(event)
      props.onScroll?.(event)
    },
    [keyboardAwareContext, props],
  )

  return (
    <KeyboardAwareContext.Provider value={keyboardAwareContext}>
      <FlatList {...props} ref={assignRef} onScroll={handleScroll}
        contentContainerStyle={keyboardContentStyle(props.contentContainerStyle, keyboardAwareContext.keyboardSpace)}
        onLayout={(event) => { keyboardAwareContext.refresh(); props.onLayout?.(event) }}
        onContentSizeChange={(width, height) => { keyboardAwareContext.refresh(); props.onContentSizeChange?.(width, height) }} />
    </KeyboardAwareContext.Provider>
  )
}

type KeyboardAwareFlatListComponent = <ItemT>(
  props: KeyboardAwareFlatListProps<ItemT> & {
    ref?: Ref<FlatList<ItemT>>
  },
) => ReactElement | null

export const KeyboardAwareFlatList = forwardRef(
  KeyboardAwareFlatListInner,
) as KeyboardAwareFlatListComponent

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
