import { useEffect, useMemo, useRef, useState } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- WHY: SVG stroke animation uses system Animated until the pinned ABI changes. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { StatusRing } from '@/components/ui/status-ring'
import { createTokensV2, easings } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

function LandingRing() {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const circle = useRef<Circle>(null)
  const offset = useMemo(() => new Animated.Value(0), [])
  const [length, setLength] = useState(0)
  const reduced = usePrefersReducedMotion()
  const [swept, setSwept] = useState(reduced)
  useEffect(() => {
    if (!length) return
    if (reduced) return
    offset.setValue(length)
    const animation = Animated.timing(offset, { toValue: 0, duration: 280, easing: toAnimatedEasing(easings.out), useNativeDriver: false })
    animation.start(({ finished }) => { if (finished) setSwept(true) })
    return () => animation.stop()
  }, [length, offset, reduced])
  return <Svg accessible={false} width={56} height={56} viewBox="0 0 34 34" onLayout={() => { const measured = circle.current?.getTotalLength(); if (measured) setLength(measured) }}><Circle cx={17} cy={17} r={15.5} fill="none" stroke={tokens.statusEmpty} strokeWidth={1.5} /><AnimatedCircle ref={circle} cx={17} cy={17} r={15.5} fill="none" stroke={tokens.primary} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${length} ${length}`} strokeDashoffset={offset} opacity={swept ? 0 : 1} rotation={-90} origin="17, 17" /></Svg>
}

interface Props { createdHabit: string; emoji: string; remindersOff: boolean; skipped: boolean; signedOut: boolean; onFinish: () => void }
export function OnboardingComplete({ createdHabit, emoji, remindersOff, skipped, signedOut, onFinish }: Readonly<Props>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const prefix = 'onboarding.flow.done'
  const titleKey = signedOut ? 'signedOutTitle' : skipped ? 'skippedTitle' : 'title'
  const bodyKey = signedOut ? 'signedOutBody' : skipped ? 'skippedBody' : remindersOff ? 'remindersOffBody' : 'body'
  return <View style={styles.root}><View style={styles.intro}>{createdHabit ? <LandingRing /> : null}<Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t(`${prefix}.${titleKey}`)}</Text><Text style={[styles.body, { color: tokens.fg2 }]}>{t(`${prefix}.${bodyKey}`)}</Text></View>{createdHabit ? <View style={[styles.habit, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]}><View style={[styles.emoji, { backgroundColor: tokens.bgWell }]}><Text style={styles.emojiText}>{emoji}</Text></View><View style={styles.copy}><Text style={[styles.habitTitle, { color: tokens.fg1 }]}>{createdHabit}</Text><Text style={[styles.pending, { color: tokens.fg3 }]}>{t(`${prefix}.pending`)}</Text></View><StatusRing status="empty" size={30} label={t(`${prefix}.pending`)} /></View> : null}<PillButton onClick={onFinish}>{t(`${prefix}.${signedOut ? 'signIn' : 'seeDay'}`)}</PillButton></View>
}
const styles = StyleSheet.create({ root: { gap: 24, paddingVertical: 32 }, intro: { alignItems: 'flex-start', gap: 12 }, title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, letterSpacing: -0.44, lineHeight: 26 }, body: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 26 }, habit: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 16, padding: 16 }, emoji: { alignItems: 'center', borderRadius: 12, height: 44, justifyContent: 'center', width: 44 }, emojiText: { fontSize: 24 }, copy: { flex: 1 }, habitTitle: { fontFamily: 'Geist_500Medium', fontSize: 15 }, pending: { fontFamily: 'Geist_400Regular', fontSize: 12 } })
