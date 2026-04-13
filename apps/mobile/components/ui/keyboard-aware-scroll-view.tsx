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
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  findNodeHandle,
  type FlatListProps,
  type KeyboardAvoidingViewProps,
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
}

type KeyboardAwareInputTarget = Parameters<typeof findNodeHandle>[0]

interface KeyboardAwareContextValue {
  revealInput: (input: KeyboardAwareInputTarget) => void
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
  additionalOffset: number,
) {
  if (!scrollable || !input) {
    return
  }

  const nodeHandle =
    typeof input === 'number' ? input : findNodeHandle(input)

  if (!nodeHandle) {
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
}

function useKeyboardAwareContextValue(
  scrollableRef: RefObject<KeyboardAwareScrollable | null>,
  keyboardVerticalOffset: number,
) {
  const focusedInputRef = useRef<KeyboardAwareInputTarget>(null)
  const keyboardVisibleRef = useRef(false)

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

    const handleKeyboardShow = () => {
      keyboardVisibleRef.current = true
      const focusedInput = focusedInputRef.current

      if (!focusedInput) {
        return
      }

      setTimeout(() => {
        scrollFocusedInputIntoView(
          scrollableRef.current,
          focusedInput,
          keyboardVerticalOffset + 24,
        )
      }, 40)
    }

    const handleKeyboardHide = () => {
      keyboardVisibleRef.current = false
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
    }),
    [revealInput],
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

  return (
    <KeyboardAwareContext.Provider value={keyboardAwareContext}>
      <BottomSheetScrollView
        {...props}
        ref={scrollRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
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

  return (
    <KeyboardAwareContext.Provider value={keyboardAwareContext}>
      <FlatList {...props} ref={assignRef} />
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
