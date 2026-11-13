import { useState, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { steadyColumnInset } from '@orbit/shared/utils'
import { useKeyboardAwareInputReveal } from '@/components/ui/keyboard-aware-scroll-view'

export function SteadyColumn({ viewportHeight, blockSpace, style, children }: Readonly<{
  viewportHeight: number
  blockSpace: number
  style: StyleProp<ViewStyle>
  children: ReactNode
}>) {
  const keyboardSpace = useKeyboardAwareInputReveal()?.keyboardSpace ?? 0
  const [columnHeight, setColumnHeight] = useState(0)
  const inset = steadyColumnInset({ viewport: viewportHeight - keyboardSpace, column: columnHeight, block: blockSpace })
  return (
    <View style={{ width: '100%', alignItems: 'center', paddingTop: inset }}>
      <View testID="login-column" style={style} onLayout={(event) => setColumnHeight(event.nativeEvent.layout.height)}>
        {children}
      </View>
    </View>
  )
}
