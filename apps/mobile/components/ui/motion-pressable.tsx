import { useState } from 'react'
import { Pressable, type PressableProps } from 'react-native'
import Animated from 'react-native-reanimated'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export function MotionPressable({ style, children, onPressIn, onPressOut, ...props }: Readonly<PressableProps>) {
  const [pressed, setPressed] = useState(false)

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => { setPressed(true); onPressIn?.(event) }}
      onPressOut={(event) => { setPressed(false); onPressOut?.(event) }}
      style={[
        typeof style === 'function' ? style({ pressed }) : style,
        {
          transform: [{ scale: pressed ? 0.96 : 1 }],
          transitionProperty: ['transform', 'backgroundColor'],
          transitionDuration: [150, 240],
          transitionTimingFunction: ['cubic-bezier(0.16, 1, 0.3, 1)', 'cubic-bezier(0.2, 0, 0, 1)'],
        },
      ]}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  )
}
