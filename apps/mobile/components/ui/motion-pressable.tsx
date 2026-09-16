import { useState } from 'react'
import { Pressable, type PressableProps } from 'react-native'
import Animated from 'react-native-reanimated'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

interface MotionPressableProps extends PressableProps {
  active?: boolean
}

export function MotionPressable({ active = false, style, children, onPressIn, onPressOut, ...props }: Readonly<MotionPressableProps>) {
  const [pressed, setPressed] = useState(false)

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => { setPressed(true); onPressIn?.(event) }}
      onPressOut={(event) => { setPressed(false); onPressOut?.(event) }}
      style={[
        typeof style === 'function' ? style({ pressed }) : style,
        {
          transform: [{ scale: pressed || active ? 0.96 : 1 }],
          transition: 'transform 150ms cubic-bezier(0.16, 1, 0.3, 1), background-color 240ms cubic-bezier(0.2, 0, 0, 1)',
        },
      ]}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  )
}
