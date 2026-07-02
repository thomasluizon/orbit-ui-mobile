import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Animated } from 'react-native'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { easings } from '@/lib/theme'

interface DismissibleCardProps {
  visible: boolean
  children: ReactNode
}

/**
 * Keeps a dismissed engagement card mounted for a 160ms fade + 4px rise exit
 * before unmounting, mirroring the web AnimatePresence exit. Instant under
 * reduced motion.
 */
export function DismissibleCard({ visible, children }: Readonly<DismissibleCardProps>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const exitAnim = useMemo(() => new Animated.Value(1), [])
  const [rendered, setRendered] = useState(visible)
  const [previousVisible, setPreviousVisible] = useState(visible)
  if (visible !== previousVisible) {
    setPreviousVisible(visible)
    if (visible) setRendered(true)
  }

  useEffect(() => {
    if (visible) {
      exitAnim.stopAnimation?.()
      exitAnim.setValue(1)
      return
    }
    if (!rendered) return

    const exitAnimation = Animated.timing(exitAnim, {
      toValue: 0,
      duration: prefersReducedMotion ? 0 : 160,
      easing: toAnimatedEasing(easings.smooth),
      useNativeDriver: true,
    })
    exitAnimation.start(({ finished }) => {
      if (finished) setRendered(false)
    })
    return () => exitAnimation.stop()
  }, [exitAnim, prefersReducedMotion, rendered, visible])

  if (!rendered) return null

  return (
    <Animated.View
      style={{
        opacity: exitAnim,
        transform: [
          {
            translateY: exitAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-4, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  )
}
