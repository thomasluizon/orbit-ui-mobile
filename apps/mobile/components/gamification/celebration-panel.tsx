import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- WHY: the pinned Reanimated ABI cannot move until https://github.com/thomasluizon/orbit-ui-mobile/issues/243.
  Animated,
  StyleSheet, Text, View, useWindowDimensions, findNodeHandle, type HostInstance,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { motionDurations, motionEasings, SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { isStreakCelebrationMilestone, type CelebrationQueueItem } from '@orbit/shared/stores'
import { X } from '@/components/ui/icons'
import { Button } from '@/components/ui/pill-button'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { createTokensV2 } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { plural } from '@/lib/plural'
import { useAppTheme } from '@/lib/use-app-theme'
import { useShellFocusTarget } from '@/components/shell/shell-focus-target'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useUIStore } from '@/stores/ui-store'
import { DailyStreakMoment } from './daily-streak-moment'
import { useCelebrationPresentation } from './use-celebration-presentation'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

function getCelebrationCopy(
  active: NonNullable<ReturnType<typeof useUIStore.getState>['activeCelebration']>,
): {
  eyebrowKey: string
  lineKey: string
  values: Record<string, string | number>
  pluralCount?: number
} {
  switch (active.kind) {
    case 'daily-streak':
    case 'streak':
      return {
        eyebrowKey: 'celebration.streak.eyebrow',
        lineKey: 'celebration.streak.line',
        values: { count: active.payload.streak },
      }
    case 'goal-completed': {
      const unit = active.payload.unit.trim()
      return {
        eyebrowKey: 'celebration.goal.eyebrow',
        lineKey: unit
          ? 'celebration.goal.line'
          : 'celebration.goal.lineWithoutUnit',
        values: unit
          ? { name: active.payload.name, count: active.payload.count, unit }
          : { name: active.payload.name, count: active.payload.count },
      }
    }
    case 'level-up':
      return {
        eyebrowKey: 'celebration.level.eyebrow',
        lineKey: 'celebration.level.line',
        values: { level: active.payload.level },
      }
    case 'all-done':
      return {
        eyebrowKey: 'celebration.day.eyebrow',
        lineKey: 'celebration.day.line',
        values: { count: active.payload.count },
        pluralCount: active.payload.count,
      }
  }
}

export function CelebrationPanel() {
  const active = useUIStore((state) => state.activeCelebration)
  const generation = useAccountGeneration()
  const [observed, setObserved] = useState({ id: active?.id, generation })
  if (observed.id !== active?.id) setObserved({ id: active?.id, generation })
  const reduced = usePrefersReducedMotion()
  const focusHost = useShellFocusTarget()
  const closeRef = useRef<View>(null)
  const originRef = useRef<HostInstance | null>(null)
  const focused = useRef(false)
  const transferFocus = useRef(false)
  const pendingFocus = useRef(false)
  const complete = () => {
    const stillOwnsFocus = focusHost ? focusHost.currentTarget() === findNodeHandle(closeRef.current) : focused.current
    const shouldTransfer = pendingFocus.current && stillOwnsFocus && generation === getAccountGeneration()
    transferFocus.current = false
    pendingFocus.current = false
    if (!active) return
    useUIStore.getState().completeActiveCelebration(active.id)
    if (!shouldTransfer) return
    if (useUIStore.getState().activeCelebration) transferFocus.current = true
    else if (originRef.current?.isConnected) originRef.current.focus()
    else focusHost?.focusMain()
  }
  useLayoutEffect(() => {
    if (generation !== observed.generation) { pendingFocus.current = false; transferFocus.current = false; focused.current = false; originRef.current = null; return }
    if (transferFocus.current) { transferFocus.current = false; closeRef.current?.focus(); return }
    pendingFocus.current = false
    originRef.current = focusHost?.currentHost() ?? null
  }, [active?.id, focusHost, generation, observed.generation])
  if (!active || observed.generation !== generation) return null
  if (active.kind === 'streak' && !isStreakCelebrationMilestone(active.payload.streak)) return null
  return <CelebrationItem key={active.id} active={active} reduced={reduced} closeRef={closeRef} complete={complete}
    onFocus={(value) => { focused.current = value }} beforeDismiss={() => { pendingFocus.current = focused.current }} />
}

function CelebrationItem({ active, reduced, closeRef, complete, beforeDismiss, onFocus }: {
  active: CelebrationQueueItem
  reduced: boolean
  closeRef: React.RefObject<View | null>
  complete: () => void
  beforeDismiss: () => void
  onFocus: (focused: boolean) => void
}) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { width, fontScale } = useWindowDimensions()
  const daily = active.kind === 'daily-streak'
  const { eyebrowKey, lineKey, values, pluralCount } = getCelebrationCopy(active)
  const translatedLine = t(lineKey, values)
  const line = pluralCount === undefined ? translatedLine : plural(translatedLine, pluralCount)
  const label = daily ? plural(t('streakDisplay.badge.tooltip', { count: active.payload.streak }), active.payload.streak) : line
  const [announcement, setAnnouncement] = useState('')
  const announced = useRef(false)
  const { presentation, snapshot } = useCelebrationPresentation(active.id, daily, reduced, complete)
  const { phase, revision, hidden } = snapshot
  const exiting = phase === 'manual-exit' || phase === 'automatic-exit'
  const entering = phase === 'enter' && !reduced && !hidden
  const [y] = useState(() => new Animated.Value(0))
  const [opacity] = useState(() => new Animated.Value(1))
  useEffect(() => {
    if (announced.current) return
    const timeout = setTimeout(() => { announced.current = true; setAnnouncement(label) }, 0)
    return () => clearTimeout(timeout)
  }, [label])
  useLayoutEffect(() => {
    let cancelled = false
    y.stopAnimation((current) => {
      if (cancelled) return
      y.setValue(current)
      if (reduced || hidden || phase === 'hold') { y.setValue(0); opacity.setValue(1); return }
      if (phase === 'enter') y.setValue(12)
      const timing = { duration: exiting ? motionDurations.base : motionDurations.slow,
        easing: toAnimatedEasing(exiting ? motionEasings.exit : motionEasings.enter), useNativeDriver: true }
      Animated.timing(y, { ...timing, toValue: exiting ? 12 : 0 }).start()
      if (exiting) Animated.timing(opacity, { ...timing, toValue: 0 }).start(({ finished }) => {
        if (finished && !cancelled) presentation.finishExit(revision)
      })
    })
    return () => { cancelled = true; y.stopAnimation(); opacity.stopAnimation() }
  }, [exiting, hidden, opacity, phase, presentation, reduced, revision, y])
  const dismiss = () => { if (phase === 'manual-exit') return; beforeDismiss(); presentation.dismiss() }
  return (
    <Animated.View testID={daily ? 'daily-streak-moment' : 'celebration-panel'} data-phase={phase}
      data-motion={reduced ? 'static' : 'animated'}
      onPointerEnter={(event) => { if (event.nativeEvent.pointerType === 'mouse') presentation.pause('hover', true) }} onPointerLeave={() => presentation.pause('hover', false)}
      style={[styles.panel, daily ? styles.daily : undefined, { backgroundColor: tokens.bgElev, borderColor: tokens.hairline,
        opacity, transform: [{ translateY: y }] }]}>
      <Text testID={daily ? 'daily-streak-announcement' : 'celebration-announcement'} accessibilityLiveRegion="polite"
        style={styles.announcement}>{announcement}</Text>
      <CelebrationRing entering={entering} startedAt={snapshot.startedAt} />
      <View style={[styles.copy, { minWidth: Math.min(width - 80, 112 * fontScale) }]} accessible accessibilityLabel={label}>
        {daily ? <DailyStreakMoment streak={active.payload.streak} entering={entering} /> : (
          <View importantForAccessibility="no-hide-descendants">
            <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>{t(eyebrowKey)}</Text>
            <Text style={[styles.line, { color: tokens.fg1 }]}>{line}</Text>
          </View>
        )}
      </View>
      <Button buttonRef={closeRef} variant="ghost" quiet iconOnly minimumHeight={TOUCH_TARGET_MIN}
        label={t('celebration.close')} disabled={phase === 'manual-exit'} onClick={dismiss}
        onFocus={() => { onFocus(true); presentation.pause('focus', true) }}
        onBlur={() => { onFocus(false); presentation.pause('focus', false) }}>
        <X aria-hidden size={20} color={tokens.fg2} />
      </Button>
    </Animated.View>
  )
}

function CelebrationRing({ entering, startedAt }: { entering: boolean; startedAt: number }) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const circle = useRef<Circle>(null)
  const [length, setLength] = useState(0)
  const [offset] = useState(() => new Animated.Value(0))
  const measure = () => {
    const measured = circle.current?.getTotalLength()
    if (measured !== undefined && Number.isFinite(measured) && measured > 0) setLength(measured)
  }
  useLayoutEffect(() => {
    offset.stopAnimation()
    offset.setValue(0)
    const remaining = startedAt + motionDurations.slow - Date.now()
    if (!entering || !length || remaining <= 0) return
    offset.setValue(length)
    const animation = Animated.timing(offset, { toValue: 0, duration: remaining,
      easing: toAnimatedEasing(motionEasings.enter), useNativeDriver: false })
    animation.start()
    return () => animation.stop()
  }, [entering, length, offset, startedAt])
  return (
    <View testID="celebration-ring" style={styles.ring} importantForAccessibility="no-hide-descendants">
      <Svg onLayout={measure} width={44} height={44} viewBox="0 0 44 44">
        <Circle cx={22} cy={22} r={18} fill="none" stroke={tokens.statusEmpty} strokeWidth={2} />
        <AnimatedCircle ref={circle} cx={22} cy={22} r={18} fill="none" stroke={tokens.fg1} strokeWidth={3}
          strokeLinecap="round" strokeDasharray={length || undefined} strokeDashoffset={entering && length ? offset : 0}
          rotation={-90} origin="22, 22" />
      </Svg>
      <View pointerEvents="none" style={styles.mark}><OrbitMark size={16} accent={false} /></View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: SPACING.s24 },
  daily: { gap: 12, padding: SPACING.s16 },
  ring: { height: 44, width: 44 },
  mark: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { fontFamily: 'GeistMono_500Medium', fontSize: 12, letterSpacing: 0.72, textTransform: 'uppercase' },
  line: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 24.65 },
  announcement: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', fontFamily: 'Geist_400Regular', fontSize: 14 },
})
