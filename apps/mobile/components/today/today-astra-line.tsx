import type { OrbitLookTarget } from '@orbit/shared/contracts/brand'
import { PADDING, SPACING, motionDurations, motionEasings } from '@orbit/shared/theme'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useFlag } from '@/hooks/use-flag'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayAstraLineProps {
  text: string
  destination: string
  role?: 'button' | 'link'
  onPress?: () => void
  disabled?: boolean
  busy?: boolean
  announce?: boolean
  loading?: boolean
  /** Descansando when the AI is absent: offline or at the message limit. The row never shows another state. */
  mascotState?: 'parado' | 'pensando' | 'descansando'
  /** The control Orbit looks toward, measured from `mascotRef`. */
  lookAt?: OrbitLookTarget | null
  /** A page change the person caused: the ring turns once. */
  turnKey?: string | number
  mascotRef?: RefObject<View | null>
}

/** A new sentence fades in on the micro duration. The first sentence, the guided flows off and reduced motion show at once. */
function useSentenceFade(text: string, still: boolean) {
  const opacity = useSharedValue(1)
  const shown = useRef(text)
  useEffect(() => {
    if (shown.current === text) return undefined
    shown.current = text
    if (still) return undefined
    opacity.value = 0
    opacity.value = withTiming(1, { duration: motionDurations.micro, easing: Easing.bezier(...motionEasings.standard) })
    return () => {
      cancelAnimation(opacity)
      opacity.value = 1
    }
  }, [opacity, still, text])
  return useAnimatedStyle(() => ({ opacity: opacity.value }))
}

export function TodayAstraLine({ text, destination, role = 'button', onPress, disabled = false, busy = false, announce = false, loading = false, mascotState = 'parado', lookAt, turnKey, mascotRef }: Readonly<TodayAstraLineProps>) {
  const guided = useFlag('orbit_guided_flows')
  const { fontScale } = useWindowDimensions()
  const reducedMotion = usePrefersReducedMotion()
  const sentenceStyle = useSentenceFade(text, !guided || reducedMotion)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ paddingBottom: PADDING.sectionGap * Math.max(0, fontScale - 1) }}>
      <Pressable
        testID="today-astra-slot"
        accessibilityRole={role}
        accessibilityLabel={text}
        accessibilityLiveRegion={announce ? 'polite' : undefined}
        accessibilityHint={destination}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        style={[styles.line, { backgroundColor: tokens.bgWell }, focused ? { outlineStyle: 'solid', outlineWidth: 2, outlineColor: tokens.fg1, outlineOffset: -2 } : null]}
        onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={onPress}
      >
        {!disabled && (pressed || hovered) ? <View accessible={false} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.feedback, { backgroundColor: tokens.bgHoverOpaque }]} /> : null}
        <View ref={mascotRef} accessible={false} style={{ width: 48, flexShrink: 0, alignItems: 'center' }}>
          {guided ? <OrbitMascot size={48} state={mascotState} lookAt={lookAt} turnKey={turnKey} /> : <OrbitMascot size={20} color={tokens.fg3} />}
        </View>
        {loading ? <View testID="summary-skeleton" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.skeleton}>
          <View style={[styles.placeholder, { backgroundColor: tokens.hairlineStrong }]} />
          <View style={[styles.placeholder, { backgroundColor: tokens.hairlineStrong, width: '66.67%' }]} />
        </View> : <Animated.View testID="today-astra-sentence" style={[styles.sentence, sentenceStyle]}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.text, { color: tokens.fg2 }]}>
            {text}
          </Text>
        </Animated.View>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  line: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: SPACING.s8, paddingRight: SPACING.s16, paddingVertical: SPACING.s8, borderRadius: 12 },
  feedback: { borderRadius: 12 },
  skeleton: { flex: 1, minWidth: 0, minHeight: 14 * 1.55 * 2, justifyContent: 'center', gap: 8 },
  placeholder: { height: 14, borderRadius: 8, width: '100%' },
  sentence: { minWidth: 0, flex: 1 },
  text: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 14 * 1.55 },
})
