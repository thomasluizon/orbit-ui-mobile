import { forwardRef, useState } from 'react'
import { Pressable, type PressableProps, type View } from 'react-native'
import Animated from 'react-native-reanimated'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export const MotionPressable = forwardRef<View, Readonly<PressableProps>>(function MotionPressable(
  { style, children, onPressIn, onPressOut, ...props },
  ref,
) {
  const [pressed, setPressed] = useState(false)

  return (
    <AnimatedPressable
      ref={ref}
      {...props}
      onPressIn={(event) => { setPressed(true); onPressIn?.(event) }}
      onPressOut={(event) => { setPressed(false); onPressOut?.(event) }}
      style={[
        typeof style === 'function' ? style({ pressed }) : style,
        {
          transform: [{ scale: pressed ? 0.96 : 1 }],
          transition: 'transform 150ms cubic-bezier(0.16, 1, 0.3, 1), background-color 240ms cubic-bezier(0.2, 0, 0, 1)',
        },
      ]}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  )
})
