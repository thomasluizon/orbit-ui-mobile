import { useMemo } from 'react'
import { StyleSheet, Dimensions } from 'react-native'
import Svg, { Rect, Defs, Mask } from 'react-native-svg'
import Animated, { useAnimatedProps, withTiming, Easing } from 'react-native-reanimated'
import type { TourTargetRect } from '@orbit/shared/stores'

const AnimatedRect = Animated.createAnimatedComponent(Rect)

const BORDER_RADIUS = 12
const PADDING = 8

interface TourSpotlightProps {
  targetRect: TourTargetRect
}

export function TourSpotlight({ targetRect }: TourSpotlightProps) {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

  const animatedProps = useAnimatedProps(() => ({
    x: withTiming(targetRect.x - PADDING, { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
    y: withTiming(targetRect.y - PADDING, { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
    width: withTiming(targetRect.width + PADDING * 2, { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
    height: withTiming(targetRect.height + PADDING * 2, { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
  }))

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 9998,
        },
      }),
    [],
  )

  return (
    <Animated.View style={styles.container} pointerEvents="box-only">
      <Svg width={screenWidth} height={screenHeight}>
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
          fill="rgba(0, 0, 0, 0.6)"
          mask="url(#tourMask)"
        />
      </Svg>
    </Animated.View>
  )
}
