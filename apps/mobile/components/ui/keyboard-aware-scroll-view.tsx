import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import {
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  UIManager,
  findNodeHandle,
  type FlatListProps,
  type KeyboardAvoidingViewProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet'

interface KeyboardAwareViewProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  keyboardVerticalOffset?: number
  behavior?: KeyboardAvoidingViewProps['behavior']
}

interface KeyboardAwareScrollViewProps extends ComponentProps<typeof ScrollView> {
  children: ReactNode
  containerStyle?: StyleProp<ViewStyle>
  keyboardVerticalOffset?: number
  behavior?: KeyboardAvoidingViewProps['behavior']
}

interface KeyboardAwareBottomSheetScrollViewProps
  extends ComponentProps<typeof BottomSheetScrollView> {
  children: ReactNode
  keyboardVerticalOffset?: number
}

interface KeyboardAwareFlatListProps<ItemT> extends FlatListProps<ItemT> {
  keyboardVerticalOffset?: number
}

type KeyboardAwareScrollable = {
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

interface KeyboardAwareKeyboardFrame {
  top: number
}

interface KeyboardAwareContextValue {
  revealInput: (input: KeyboardAwareInputTarget) => void
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
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

  UIManager.measureInWindow(nodeHandle, (_x, y, _width, height) => {
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
  const keyboardVisibleRef = useRef(false)
  const keyboardFrameRef = useRef<KeyboardAwareKeyboardFrame | null>(null)
  const scrollOffsetYRef = useRef(0)

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetYRef.current = event.nativeEvent.contentOffset.y
    },
    [],
  )

  const revealInput = useCallback(
    (input: KeyboardAwareInputTarget) => {
      focusedInputRef.current = input

      if (!keyboardVisibleRef.current) {
        return
      }

      requestAnimationFrame(() => {
        scrollFocusedInputIntoView(
          scrollableRef.current,
          input,
          keyboardFrameRef.current,
          scrollOffsetYRef.current,
          keyboardVerticalOffset + 24,
        )
      })
    },
    [keyboardVerticalOffset, scrollableRef],
  )

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const handleKeyboardShow = (
      event?: {
        endCoordinates?: {
          screenY?: number
          height?: number
        }
      },
    ) => {
      keyboardVisibleRef.current = true
      const screenHeight = Dimensions.get('window').height
      const keyboardTop =
        event?.endCoordinates?.screenY ??
        screenHeight - (event?.endCoordinates?.height ?? 0)

      keyboardFrameRef.current = { top: keyboardTop }
      const focusedInput = focusedInputRef.current

      if (!focusedInput) {
        return
      }

      setTimeout(() => {
        scrollFocusedInputIntoView(
          scrollableRef.current,
          focusedInput,
          keyboardFrameRef.current,
          scrollOffsetYRef.current,
          keyboardVerticalOffset + 24,
        )
      }, 40)
    }

    const handleKeyboardHide = () => {
      keyboardVisibleRef.current = false
      keyboardFrameRef.current = null
    }

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow)
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide)

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [keyboardVerticalOffset, scrollableRef])

  return useMemo(
    () => ({
      revealInput,
      handleScroll,
    }),
    [handleScroll, revealInput],
  )
}

export function useKeyboardAwareInputReveal() {
  return useContext(KeyboardAwareContext)
}

export function KeyboardAwareView({
  children,
  style,
  keyboardVerticalOffset = 0,
  behavior,
}: Readonly<KeyboardAwareViewProps>) {
  return (
    <KeyboardAvoidingView
      style={style}
      behavior={resolveKeyboardBehavior(behavior)}
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
  keyboardShouldPersistTaps = 'always',
  contentInsetAdjustmentBehavior = 'automatic',
  ...props
}: Readonly<KeyboardAwareScrollViewProps>) {
  const scrollRef = useRef<ScrollView>(null)
  const keyboardAwareContext = useKeyboardAwareContextValue(
    scrollRef as RefObject<KeyboardAwareScrollable | null>,
    keyboardVerticalOffset,
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
      <KeyboardAwareView
        style={[styles.container, containerStyle]}
        keyboardVerticalOffset={keyboardVerticalOffset}
        behavior={behavior}
      >
        <ScrollView
          {...props}
          ref={scrollRef}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
          automaticallyAdjustKeyboardInsets
          onScroll={handleScroll}
        >
          {children}
        </ScrollView>
      </KeyboardAwareView>
    </KeyboardAwareContext.Provider>
  )
}

export function KeyboardAwareBottomSheetScrollView({
  children,
  keyboardVerticalOffset = 0,
  keyboardShouldPersistTaps = 'always',
  ...props
}: Readonly<KeyboardAwareBottomSheetScrollViewProps>) {
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null)
  const keyboardAwareContext = useKeyboardAwareContextValue(
    scrollRef as RefObject<KeyboardAwareScrollable | null>,
    keyboardVerticalOffset,
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
      <BottomSheetScrollView
        {...props}
        ref={scrollRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        onScroll={handleScroll}
      >
        {children}
      </BottomSheetScrollView>
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
      <FlatList {...props} ref={assignRef} onScroll={handleScroll} />
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
