import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { type StyleProp, type ViewStyle, View } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useConversationMotion, useConversationLayout } from '@/components/chat/conversation-motion'

const ComposerOriginContext = createContext<{ current: number | null } | null>(null)

export function ConversationComposerMotionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const origin = useMemo(() => ({ current: null as number | null }), [])
  return <ComposerOriginContext.Provider value={origin}>{children}</ComposerOriginContext.Provider>
}

export function ConversationComposerMotion({ children, source, destination, style, onLayout, testID }: Readonly<{
  children: ReactNode
  source: boolean
  destination: boolean
  onLayout?: (event: import('react-native').LayoutChangeEvent) => void
  testID?: string
  style: StyleProp<ViewStyle>
}>) {
  const origin = useContext(ComposerOriginContext)
  const host = useRef<View>(null)
  const entered = useRef(false)
  const motionEnabled = useRef(true)
  const mounted = useRef(true)
  const configuration = useConversationMotion()
  const layout = useConversationLayout()
  const offset = useSharedValue(0)
  const presentation = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))
  useEffect(() => {
    mounted.current = true
    motionEnabled.current = configuration.duration > 0
    if (configuration.duration === 0) { cancelAnimation(offset); offset.value = 0 }
    return () => { mounted.current = false; cancelAnimation(offset) }
  }, [configuration.duration, offset])
  useEffect(() => {
    if (!source || !origin) return
    return () => { origin.current = null }
  }, [origin, source])
  function measure() {
    if (!source && (!destination || entered.current)) return
    host.current?.measureInWindow((_x, y) => {
      if (!origin || !mounted.current) return
      if (source) { origin.current = y; return }
      if (entered.current) return
      entered.current = true
      if (origin.current === null || !motionEnabled.current) return
      offset.value = origin.current - y
      offset.value = withTiming(0, { duration: configuration.duration, easing: Easing.bezier(...configuration.easing) })
    })
  }
  return <Animated.View ref={host} testID={testID ?? "conversation-composer-motion"} onLayout={event => { onLayout?.(event); measure() }} layout={layout} style={[style, presentation]}>{children}</Animated.View>
}
