import { useEffect, useMemo, useState } from 'react'
import {
  Animated,
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle,
  Target,
  MessageCircle,
  CalendarDays,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native'
import type { TourStep, TourSection } from '@orbit/shared/types'
import type { TourTargetRect } from '@orbit/shared/stores'
import { TOUR_SECTION_ICONS } from '@orbit/shared/types'
import { useAppTheme } from '@/lib/use-app-theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import {
  createTokensV2,
  easings,
  primaryGlow,
  radius,
  shadowsV2,
  tintFromPrimary,
} from '@/lib/theme'
import { ProBadge } from '@/components/ui/pro-badge'

type AppTokens = ReturnType<typeof createTokensV2>

const SECTION_ICON_MAP = {
  'check-circle': CheckCircle,
  'target': Target,
  'message-circle': MessageCircle,
  'calendar-days': CalendarDays,
  'user': User,
} as const

interface TourTooltipProps {
  step: TourStep
  targetRect: TourTargetRect
  sectionProgress: { current: number; total: number; section: TourSection | null }
  isFirstStep: boolean
  isLastStep: boolean
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}

export function TourTooltip({
  step,
  targetRect,
  sectionProgress,
  isFirstStep,
  isLastStep,
  onNext,
  onPrev,
  onSkip,
}: TourTooltipProps) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createTooltipStyles(tokens), [tokens])
  const prefersReducedMotion = usePrefersReducedMotion()
  const entrance = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (prefersReducedMotion) {
      entrance.setValue(1)
      return
    }
    entrance.setValue(0)
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 280,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [entrance, prefersReducedMotion, step.id])

  const iconKey = step.section ? TOUR_SECTION_ICONS[step.section] : undefined
  const SectionIcon = iconKey
    ? SECTION_ICON_MAP[iconKey as keyof typeof SECTION_ICON_MAP]
    : undefined

  const sectionName = sectionProgress.section
    ? t(`tour.sections.${sectionProgress.section}`)
    : ''

  const { height: screenHeight } = useWindowDimensions()
  const targetCenter = targetRect.y + targetRect.height / 2
  const mode = targetCenter > screenHeight * 0.5 ? 'sheet-top' : 'sheet-bottom'

  const containerStyle = mode === 'sheet-top' ? styles.containerTop : styles.containerBottom
  const tooltipStyle = mode === 'sheet-top'
    ? [styles.tooltip, styles.tooltipTop, { paddingTop: insets.top + 12 }]
    : [styles.tooltip, styles.tooltipBottom, { paddingBottom: Math.max(32, insets.bottom + 20) }]

  const entranceStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [mode === 'sheet-top' ? -12 : 12, 0],
        }),
      },
    ],
  }

  return (
    <View style={containerStyle}>
      <Animated.View style={[...tooltipStyle, entranceStyle]}>
        {mode === 'sheet-bottom' && <View style={[styles.handle, styles.handleAtTop]} />}

        <View style={styles.header}>
          {SectionIcon && <SectionIcon size={16} color={tokens.primary} strokeWidth={1.8} />}
          <Text style={styles.sectionName}>{sectionName}</Text>
          <Text style={styles.headerDot}>·</Text>
          <Text style={styles.stepCount}>
            {t('tour.ui.stepOf', {
              current: sectionProgress.current,
              total: sectionProgress.total,
            })}
          </Text>
          {step.proBadge && (
            <ProBadge alwaysVisible label={t('tour.ui.pro')} style={styles.proBadgeSpacing} />
          )}
        </View>

        <Text style={styles.title}>{t(step.titleKey)}</Text>

        <Text style={styles.description}>{t(step.descriptionKey)}</Text>

        <View style={styles.dotsContainer} importantForAccessibility="no-hide-descendants">
          {Array.from({ length: sectionProgress.total }).map((_, i) => {
            const dotState: ProgressDotState =
              i === sectionProgress.current - 1
                ? 'active'
                : i < sectionProgress.current - 1
                  ? 'completed'
                  : 'inactive'
            return (
              <ProgressDot
                key={`progress-dot-${sectionProgress.section}-${i}`}
                state={dotState}
                color={
                  dotState === 'active'
                    ? tokens.primary
                    : dotState === 'completed'
                      ? tintFromPrimary(tokens, 0.4)
                      : tokens.fg4
                }
                reduceMotion={prefersReducedMotion}
              />
            )
          })}
        </View>

        <View style={styles.navRow}>
          {!isFirstStep ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('tour.ui.back')}
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.backButtonPressed : null,
              ]}
              onPress={onPrev}
            >
              <ChevronLeft size={22} color={tokens.fg2} strokeWidth={1.8} />
            </Pressable>
          ) : (
            <View />
          )}

          <View style={{ flex: 1 }} />

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.nextButton,
              primaryGlow(tokens),
              pressed ? styles.nextButtonPressed : null,
            ]}
            onPress={onNext}
          >
            <Text style={styles.nextButtonText}>
              {isLastStep ? t('tour.ui.finish') : t('tour.ui.next')}
            </Text>
            {!isLastStep && <ChevronRight size={16} color={tokens.fgOnPrimary} strokeWidth={1.8} />}
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.skipButton,
            pressed ? styles.skipButtonPressed : null,
          ]}
          onPress={onSkip}
        >
          <Text style={styles.skipButtonText}>{t('tour.ui.skip')}</Text>
        </Pressable>

        {mode === 'sheet-top' && <View style={[styles.handle, styles.handleAtBottom]} />}
      </Animated.View>
    </View>
  )
}

type ProgressDotState = 'active' | 'completed' | 'inactive'

function ProgressDot({
  state,
  color,
  reduceMotion,
}: {
  state: ProgressDotState
  color: string
  reduceMotion: boolean
}) {
  const [scaleX] = useState(() => new Animated.Value(state === 'active' ? 1 : 0.5))

  useEffect(() => {
    const animation = Animated.timing(scaleX, {
      toValue: state === 'active' ? 1 : 0.5,
      duration: reduceMotion ? 0 : 220,
      easing: toAnimatedEasing(easings.smooth),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [scaleX, state, reduceMotion])

  return (
    <Animated.View
      style={[progressDotStyles.dot, { backgroundColor: color, transform: [{ scaleX }] }]}
    />
  )
}

const progressDotStyles = StyleSheet.create({
  dot: {
    width: 16,
    height: 8,
    borderRadius: 999,
  },
})

function createTooltipStyles(tokens: AppTokens) {
  return StyleSheet.create({
    containerBottom: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
    },
    containerTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
    },
    tooltip: {
      backgroundColor: tokens.bgSheet,
      paddingHorizontal: 24,
      ...shadowsV2.shadow3,
    },
    tooltipBottom: {
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      borderTopWidth: 1,
      borderColor: tokens.hairline,
      paddingTop: 12,
      shadowOffset: { width: 0, height: -4 },
    },
    tooltipTop: {
      borderBottomLeftRadius: radius.sheet,
      borderBottomRightRadius: radius.sheet,
      borderBottomWidth: 1,
      borderColor: tokens.hairline,
      paddingBottom: 20,
      shadowOffset: { width: 0, height: 4 },
    },
    handle: {
      width: 44,
      height: 5,
      borderRadius: 999,
      backgroundColor: tokens.hairlineStrong,
      alignSelf: 'center',
    },
    handleAtTop: {
      marginBottom: 16,
    },
    handleAtBottom: {
      marginTop: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    sectionName: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
    },
    headerDot: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.fg4,
    },
    stepCount: {
      fontFamily: 'Roboto_400Regular',
      fontVariant: ['tabular-nums'],
      fontSize: 12,
      letterSpacing: 0.48,
      textTransform: 'uppercase',
      color: tokens.fg3,
    },
    proBadgeSpacing: {
      marginLeft: 'auto' as const,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      letterSpacing: -0.16,
      color: tokens.fg1,
      marginBottom: 6,
    },
    description: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 22,
      color: tokens.fg2,
      marginBottom: 16,
    },
    dotsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 16,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    backButtonPressed: {
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.96 }],
    },
    nextButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 18,
      minHeight: 44,
      borderRadius: radius.full,
      backgroundColor: tokens.primary,
    },
    nextButtonPressed: {
      backgroundColor: tokens.primaryPressed,
      transform: [{ scale: 0.96 }],
    },
    nextButtonText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
      color: tokens.fgOnPrimary,
    },
    skipButton: {
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      minHeight: 44,
      paddingHorizontal: 24,
      borderRadius: radius.full,
    },
    skipButtonPressed: {
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.96 }],
    },
    skipButtonText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
