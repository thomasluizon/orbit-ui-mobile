import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native'
import { steadyColumnInset } from '@orbit/shared/utils'
import { useKeyboardAwareInputReveal } from '@/components/ui/keyboard-aware-scroll-view'

/** Keeps the current length when a new measurement differs from it by one device pixel or less. */
// WHY: Yoga snaps each edge from its absolute position, so a half-pixel move changes a measured height by one pixel, and a layout effect that moves the column by it never settles. https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/ReactCommon/yoga/yoga/algorithm/PixelGrid.cpp#L145-L156
export function steadyLength(current: number, measured: number, pixelRatio: number) {
  return Math.round(Math.abs(measured - current) * pixelRatio) <= 1 ? current : measured
}

export function SteadyColumn({ viewportHeight, blockSpace, style, children }: Readonly<{
  viewportHeight: number
  blockSpace: number
  style: StyleProp<ViewStyle>
  children: ReactNode
}>) {
  const keyboardSpace = useKeyboardAwareInputReveal()?.keyboardSpace ?? 0
  const { scale } = useWindowDimensions()
  const columnRef = useRef<View>(null)
  const [columnHeight, setColumnHeight] = useState(0)
  const measureColumn = useCallback(() => {
    columnRef.current?.measureInWindow((_x, _y, _width, height) => setColumnHeight((current) => steadyLength(current, height, scale)))
  }, [scale])
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
