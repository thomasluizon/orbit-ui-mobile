import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

const ListScopeContext = createContext<{ scope: string; bulk: boolean }>({ scope: '', bulk: false })

/** `bulk` is true while a bulk action changes the rows: a row then changes with no motion of its own, and `ListBulkSettle` plays the one motion of the group. */
export function ListScope({ scope, bulk = false, children }: Readonly<{ scope: string; bulk?: boolean; children: ReactNode }>) {
  const value = useMemo(() => ({ scope, bulk }), [scope, bulk])
  return <ListScopeContext.Provider value={value}>{children}</ListScopeContext.Provider>
}

export function useListScope(): string {
  return useContext(ListScopeContext).scope
}

export function useListBulk(): boolean {
  return useContext(ListScopeContext).bulk
}

/** The one motion of a bulk action: the group settles from the `list-enter` scale once for each new generation. Reduced motion keeps the group still. */
export function ListBulkSettle({ generation, children }: Readonly<{ generation: number; children: ReactNode }>) {
  const reduced = usePrefersReducedMotion()
  const scale = useSharedValue(1)
  const settledGeneration = useRef(generation)
  useEffect(() => {
    if (generation === settledGeneration.current) return
    settledGeneration.current = generation
    const settle = resolveMotionPreset('list-enter', reduced)
    if (settle.scaleFrom === 1) return
    scale.value = settle.scaleFrom
    scale.value = withTiming(1, { duration: settle.enterDuration, easing: Easing.bezier(...settle.enterEasing) })
    return () => {
      cancelAnimation(scale)
      scale.value = 1
    }
  }, [generation, reduced, scale])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return <Animated.View testID="list-bulk-settle" data-generation={generation} style={[styles.fill, style]}>{children}</Animated.View>
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
