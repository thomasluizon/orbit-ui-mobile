import { useEffect, useMemo } from 'react'
import { Animated, Easing } from 'react-native'
import { easings } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'

interface CelebrationEntranceStyles {
  orbStyle: {
    opacity: Animated.Value
    transform: { scale: Animated.AnimatedInterpolation<number> }[]
  }
  titleStyle: {
    opacity: Animated.AnimatedInterpolation<number>
    transform: { translateY: Animated.AnimatedInterpolation<number> }[]
  }
  subtitleStyle: {
    opacity: Animated.AnimatedInterpolation<number>
    transform: { translateY: Animated.AnimatedInterpolation<number> }[]
  }
  footerStyle: {
    opacity: Animated.AnimatedInterpolation<number>
    transform: { translateY: Animated.AnimatedInterpolation<number> }[]
  }
}

/**
 * Celebration choreography per the CelebrationFrame artboard: the hero orb
 * springs in from 0.3 scale and then breathes with a gentle scale pulse while
 * title, subtitle, and CTA rise in sequence. Collapses to static styles when
 * the user prefers reduced motion.
 */
export function useCelebrationEntrance(active: boolean): CelebrationEntranceStyles {
  const prefersReducedMotion = usePrefersReducedMotion()
  const orb = useMemo(() => new Animated.Value(0), [])
  const pulse = useMemo(() => new Animated.Value(0), [])
  const rise = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (!active) {
      orb.setValue(0)
      pulse.setValue(0)
      rise.setValue(0)
      return
    }

    if (prefersReducedMotion) {
      orb.setValue(1)
      rise.setValue(1)
      return
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    const entrance = Animated.parallel([
      Animated.spring(orb, {
        toValue: 1,
        stiffness: 220,
        damping: 22,
        mass: 1,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 1,
        duration: 560,
        delay: 180,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
    ])
    entrance.start(({ finished }) => {
      if (finished) pulseLoop.start()
    })

    return () => {
      entrance.stop()
      pulseLoop.stop()
    }
  }, [active, prefersReducedMotion, orb, pulse, rise])

  const riseSlot = (from: number, to: number) => ({
    opacity: rise.interpolate({
      inputRange: [from, to],
      outputRange: [0, 1],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        translateY: rise.interpolate({
          inputRange: [from, to],
          outputRange: [12, 0],
          extrapolate: 'clamp' as const,
        }),
      },
    ],
  })

  return {
    orbStyle: {
      opacity: orb,
      transform: [
        {
          scale: orb.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        },
        {
          scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }),
        },
      ],
    },
    titleStyle: riseSlot(0, 0.55),
    subtitleStyle: riseSlot(0.2, 0.75),
    footerStyle: riseSlot(0.4, 1),
  }
}
