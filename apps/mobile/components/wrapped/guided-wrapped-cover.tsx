import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useFlowAnnouncement } from '@/hooks/use-flow-announcement'
import { usePrefersReducedMotion } from '@/lib/motion'
import { styles as wrappedStyles } from '@/app/wrapped-styles'
import type { WrappedCoverProps } from './wrapped-cover'

const WIDE_WIDTH = 1024

/** The Orbit line names the empty and the failed states. A ready or loading cover has no job for it, so the block closes up. */
const COVER_LINE_KEYS = {
  empty: 'wrapped.orbitLine.empty',
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

/** Compact: pinned under the scroller and spanning the column. Wide: out of the flow of the lower space, hugging its label, at most 360 wide. */
function StartAction({ wide, loading, onStart, onMeasure }: Readonly<{ wide: boolean; loading: boolean; onStart: () => void; onMeasure: (height: number) => void }>) {
  const { t } = useTranslation()
  const button = <Button loading={loading} focusableWhenLoading onClick={onStart}>{t('wrapped.start')}</Button>
  if (!wide) return <View testID="wrapped-cover-primary" style={styles.primaryCompact}>{button}</View>
  return (
    <View testID="wrapped-cover-primary" onLayout={(event: LayoutChangeEvent) => onMeasure(event.nativeEvent.layout.height)} style={styles.primaryWide}>
      <View style={styles.primaryWideCap}>{button}</View>
    </View>
  )
}

/**
 * The Wrapped cover under `orbit_guided_flows`: Orbit, the title of the period, the Orbit line and the period question in one centred block.
 * Compact, the start action is pinned under the scroller and spans the column. Wide, two equal spaces hold the block in the centre of the
 * column, and the start action hangs 24 under the block, hugging its label. The action sits out of the flow of the lower space, so the two
 * spaces stay equal; both are never shorter than the action, so it stays in the scroll range.
 */
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
  const [startHeight, setStartHeight] = useState(0)
  const line = state === 'empty' || state === 'failed' ? t(COVER_LINE_KEYS[state]) : null
  const announcement = useFlowAnnouncement(line, 'cover')
  const question = t('wrapped.periodQuestion')
  const start = state === 'ready' || state === 'loading'
    ? <StartAction wide={wide} loading={state === 'loading'} onStart={onStart} onMeasure={setStartHeight} />
    : null
  const wideSpace = [styles.wideSpace, { minHeight: start ? startHeight : 0 }]

  return (
    <FlowLookProvider look={lookControls}>
      <View testID={`wrapped-cover-${state}`} style={[styles.root, { paddingBottom: clearance > 0 ? clearance : insets.bottom }]}>
        <ScrollView testID="wrapped-cover-scroll" style={styles.scroller} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {wide ? <View style={wideSpace} /> : null}
          <View testID="wrapped-cover-block" style={styles.block}>
            <View ref={mascotRef} collapsable={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <OrbitMascot size={wide ? 128 : 96} state="parado" lookAt={lookAt} turnKey={period} />
            </View>
            <Animated.View testID="wrapped-cover-period-group" style={[styles.group, { opacity }]}>
              <Text style={[wrappedStyles.coverEyebrow, { color: tokens.fg3 }]}>{t('wrapped.title')}</Text>
              <Text accessibilityRole="header" accessibilityHint={line ?? undefined} textBreakStrategy="balanced" style={[styles.title, wide ? styles.titleWide : null, { color: tokens.fg1 }]}>
                {t(`wrapped.coverTitles.${period}`)}
              </Text>
              {line ? <Text testID="wrapped-orbit-line" accessibilityRole={state === 'failed' ? 'alert' : undefined} style={[styles.line, { color: tokens.fg2 }]}>{line}</Text> : null}
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
            {state === 'loading' ? <View style={styles.skeleton}><Skeleton variant="settings" rows={3} label={t('wrapped.loading')} /></View> : null}
          </View>
          {wide ? <View style={wideSpace}>{start}</View> : null}
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
  primaryWide: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: SPACING.s24 },
  primaryWideCap: { maxWidth: 360 },
  wideSpace: { flexGrow: 1, flexBasis: 0, width: '100%' },
  skeleton: { width: '100%' },
})
