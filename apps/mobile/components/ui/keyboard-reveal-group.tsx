import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'

const KeyboardRevealGroupContext = createContext<RefObject<View | null> | null>(null)

export function KeyboardRevealGroup({ children, style, testID }: Readonly<{
  children: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}>) {
  const groupRef = useRef<View>(null)
  const keyboardAware = useKeyboardAwareInputReveal()
  return (
    <KeyboardRevealGroupContext.Provider value={groupRef}>
      <View ref={groupRef} testID={testID} style={style} onLayout={() => keyboardAware?.refresh()}>{children}</View>
    </KeyboardRevealGroupContext.Provider>
  )
}

export function useKeyboardRevealGroup() {
  return useContext(KeyboardRevealGroupContext)
}
