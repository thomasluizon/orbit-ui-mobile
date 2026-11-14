import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'

const KeyboardRevealGroupContext = createContext<RefObject<View | null> | null>(null)

/**
 * Brings a field, its check and its main action above the keyboard together. The group needs its
 * scroller to reach the keyboard edge, so the scrollers around that scroller reserve no reveal margin.
 */
export function KeyboardRevealGroup({ children, style, testID }: Readonly<{
  children: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}>) {
  const groupRef = useRef<View>(null)
  const keyboardAware = useKeyboardAwareInputReveal()
  const yieldEnclosingRevealMargin = keyboardAware?.yieldEnclosingRevealMargin
  useEffect(() => yieldEnclosingRevealMargin?.(), [yieldEnclosingRevealMargin])
  return (
    <KeyboardRevealGroupContext.Provider value={groupRef}>
      <View ref={groupRef} testID={testID} style={style} onLayout={() => keyboardAware?.refresh()}>{children}</View>
    </KeyboardRevealGroupContext.Provider>
  )
}

export function useKeyboardRevealGroup() {
  return useContext(KeyboardRevealGroupContext)
}
