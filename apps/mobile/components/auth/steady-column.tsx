import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
  const columnRef = useRef<View>(null)
  const [columnHeight, setColumnHeight] = useState(0)
  const measureColumn = useCallback(() => {
    columnRef.current?.measureInWindow((_x, _y, _width, height) => setColumnHeight(height))
  }, [])
  // WHY: a layout read in a layout effect lands in the commit that changed the column, an onLayout state update paints a frame late. https://reactnative.dev/architecture/landing-page#synchronous-layout-and-effects
  useLayoutEffect(measureColumn)
  const inset = steadyColumnInset({ viewport: viewportHeight - keyboardSpace, column: columnHeight, block: blockSpace })
  return (
    <View style={{ width: '100%', alignItems: 'center', paddingTop: inset }}>
      <View ref={columnRef} testID="login-column" style={style} onLayout={measureColumn}>
        {children}
      </View>
    </View>
  )
}
