import { useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions } from 'react-native'
import Svg, { Rect, Defs, Mask } from 'react-native-svg'
import Animated, { useAnimatedProps, withTiming, Easing } from 'react-native-reanimated'
import type { TourTargetRect } from '@orbit/shared/stores'
import { createTokensV2, easings, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePrefersReducedMotion } from '@/lib/motion'

const AnimatedRect = Animated.createAnimatedComponent(Rect)

const BORDER_RADIUS = 12
const PADDING = 8
const GEOMETRY_DURATION = 280

interface TourSpotlightProps {
  targetRect: TourTargetRect | null
}

export function TourSpotlight({ targetRect }: Readonly<TourSpotlightProps>) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const prefersReducedMotion = usePrefersReducedMotion()

  const [lastTargetRect, setLastTargetRect] = useState(targetRect)
  if (targetRect && targetRect !== lastTargetRect) {
    setLastTargetRect(targetRect)
  }
  const rect = targetRect ?? lastTargetRect

  const cutoutX = (rect?.x ?? 0) - PADDING
  const cutoutY = (rect?.y ?? 0) - PADDING
  const cutoutWidth = (rect?.width ?? 0) + PADDING * 2
  const cutoutHeight = (rect?.height ?? 0) + PADDING * 2

  const timing = (value: number) => {
    'worklet'
    if (prefersReducedMotion) return value
    return withTiming(value, {
      duration: GEOMETRY_DURATION,
      easing: Easing.bezier(...easings.smooth),
    })
  }

  const animatedProps = useAnimatedProps(() => ({
    x: timing(cutoutX),
    y: timing(cutoutY),
    width: timing(cutoutWidth),
    height: timing(cutoutHeight),
  }))

  const glowProps = useAnimatedProps(() => ({
    x: timing(cutoutX),
    y: timing(cutoutY),
    width: timing(cutoutWidth),
    height: timing(cutoutHeight),
  }))

  const ringProps = useAnimatedProps(() => ({
    x: timing(cutoutX),
    y: timing(cutoutY),
    width: timing(cutoutWidth),
    height: timing(cutoutHeight),
  }))

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          ...StyleSheet.absoluteFill,
          zIndex: 9998,
        },
      }),
    [],
  )

  return (
    <Animated.View style={styles.container} pointerEvents="box-only">
      <Svg width={screenWidth} height={screenHeight}>
        {rect ? (
          <>
            <Defs>
              <Mask id="tourMask">
                <Rect width={screenWidth} height={screenHeight} fill="white" />
                <AnimatedRect
                  rx={BORDER_RADIUS}
                  ry={BORDER_RADIUS}
                  fill="black"
                  animatedProps={animatedProps}
                />
              </Mask>
            </Defs>
            <Rect
              width={screenWidth}
              height={screenHeight}
              fill="rgba(0, 0, 0, 0.55)"
              mask="url(#tourMask)"
            />
            <AnimatedRect
              rx={BORDER_RADIUS}
              ry={BORDER_RADIUS}
              fill="none"
              stroke={tintFromPrimary(tokens, 0.18)}
              strokeWidth={6}
              animatedProps={glowProps}
            />
            <AnimatedRect
              rx={BORDER_RADIUS}
              ry={BORDER_RADIUS}
              fill="none"
              stroke={tintFromPrimary(tokens, 0.7)}
              strokeWidth={1.5}
              animatedProps={ringProps}
            />
          </>
        ) : (
          <Rect width={screenWidth} height={screenHeight} fill="rgba(0, 0, 0, 0.55)" />
        )}
      </Svg>
    </Animated.View>
  )
}
