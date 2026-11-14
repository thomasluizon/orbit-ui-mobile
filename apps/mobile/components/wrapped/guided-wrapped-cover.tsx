import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { SPACING, motionDurations, motionEasings } from '@orbit/shared/theme'
import { RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { FlowLookProvider, useFlowLookState } from '@/components/ui/flow-look'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { OptionCard } from '@/components/ui/option-card'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Button } from '@/components/ui/pill-button'
import { useFlowAnnouncement } from '@/hooks/use-flow-announcement'
import { usePrefersReducedMotion } from '@/lib/motion'
import { styles as wrappedStyles } from '@/app/wrapped-styles'
import type { WrappedCoverProps } from './wrapped-cover'

const WIDE_WIDTH = 1024

const COVER_LINE_KEYS = {
  ready: 'wrapped.coverSubtitle',
  loading: 'wrapped.coverSubtitle',
  empty: 'wrapped.empty',
  failed: 'wrapped.error',
} as const

/** The title and the line fade in when the person picks another period. The first paint and reduced motion are still. */
function usePeriodFade(period: RecapSharePeriod, reducedMotion: boolean) {
  const [opacity] = useState(() => new Animated.Value(1))
  const shownPeriod = useRef(period)
  useEffect(() => {
    if (shownPeriod.current === period) return undefined
    shownPeriod.current = period
    if (reducedMotion) return undefined
    opacity.setValue(0)
    const fade = Animated.timing(opacity, { toValue: 1, duration: motionDurations.micro, useNativeDriver: true, easing: Easing.bezier(...motionEasings.standard) })
    fade.start()
    return () => fade.stop()
  }, [period, opacity, reducedMotion])
  return opacity
}

/** The Wrapped cover under `orbit_guided_flows`: Orbit, the title of the period, the Orbit line and the period question in one centred block. */
export function GuidedWrappedCover({ tokens, period, onSelectPeriod, state, onStart, onRetry }: Readonly<WrappedCoverProps>) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const wide = width >= WIDE_WIDTH
  const insets = useSafeAreaInsets()
  const clearance = useShellScrollerClearance()
  const reducedMotion = usePrefersReducedMotion()
  const { lookAt, mascotRef, lookAtControl, lookAway } = useFlowLookState()
  const lookControls = useMemo(() => ({ lookAtControl, lookAway }), [lookAtControl, lookAway])
  const opacity = usePeriodFade(period, reducedMotion)
  const line = t(COVER_LINE_KEYS[state])
  const announcement = useFlowAnnouncement(line, 'cover')
  const question = t('wrapped.periodQuestion')
  const start = state === 'ready' || state === 'loading' ? (
    <View testID="wrapped-cover-primary" style={wide ? styles.primaryWide : styles.primaryCompact}>
      <Button loading={state === 'loading'} focusableWhenLoading onClick={onStart}>{t('wrapped.start')}</Button>
    </View>
  ) : null

  return (
    <FlowLookProvider look={lookControls}>
      <View testID={`wrapped-cover-${state}`} style={[styles.root, { paddingBottom: clearance > 0 ? clearance : insets.bottom }]}>
        <ScrollView testID="wrapped-cover-scroll" style={styles.scroller} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View testID="wrapped-cover-block" style={styles.block}>
            <View ref={mascotRef} collapsable={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <OrbitMascot size={wide ? 128 : 96} state="parado" lookAt={lookAt} turnKey={period} />
            </View>
            <Animated.View testID="wrapped-cover-period-group" style={[styles.group, { opacity }]}>
              <Text style={[wrappedStyles.coverEyebrow, { color: tokens.fg3 }]}>{t('wrapped.title')}</Text>
              <Text accessibilityRole="header" accessibilityHint={line} textBreakStrategy="balanced" style={[styles.title, wide ? styles.titleWide : null, { color: tokens.fg1 }]}>
                {t(`wrapped.coverTitles.${period}`)}
              </Text>
              <Text testID="wrapped-orbit-line" accessibilityRole={state === 'failed' ? 'alert' : undefined} style={[styles.line, { color: tokens.fg2 }]}>{line}</Text>
              {state === 'failed' ? <IconButton label={t('wrapped.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton> : null}
            </Animated.View>
            <View style={styles.questionGroup}>
              <Text accessibilityRole="header" textBreakStrategy="balanced" style={[styles.question, { color: tokens.fg1 }]}>{question}</Text>
              <View role="group" accessibilityLabel={question} style={styles.options}>
                {RECAP_SHARE_PERIODS.map((value) => (
                  <OptionCard key={value} label={t(`wrapped.periods.${value}`)} selected={period === value} onSelect={() => onSelectPeriod(value)} />
                ))}
              </View>
            </View>
            {wide ? start : null}
          </View>
        </ScrollView>
        <Text accessibilityLiveRegion="polite" style={styles.status}>{state === 'loading' ? t('wrapped.loading') : announcement}</Text>
        {wide ? null : start}
      </View>
    </FlowLookProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroller: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.s16, paddingVertical: SPACING.s16 },
  block: { width: '100%', maxWidth: 592, alignItems: 'center', gap: SPACING.s24 },
  group: { alignItems: 'center', gap: SPACING.s12 },
  title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33, letterSpacing: -0.56, textAlign: 'center' },
  titleWide: { fontSize: 34, lineHeight: 39, letterSpacing: -0.68 },
  line: { maxWidth: 360, fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  questionGroup: { width: '100%', gap: SPACING.s12 },
  question: { fontFamily: 'Geist_500Medium', fontSize: 17, lineHeight: 24, textAlign: 'center' },
  options: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: SPACING.s12 },
  status: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  primaryCompact: { paddingHorizontal: SPACING.s16, paddingBottom: SPACING.s16, paddingTop: SPACING.s8 },
  primaryWide: { width: '100%', maxWidth: 360 },
})
