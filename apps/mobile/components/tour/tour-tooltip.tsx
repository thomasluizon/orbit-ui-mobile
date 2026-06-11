import { useEffect, useMemo } from 'react'
import { Animated, View, Text, Pressable, StyleSheet, Dimensions } from 'react-native'
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

  const screenHeight = Dimensions.get('window').height
  const targetCenter = targetRect.y + targetRect.height / 2
  const mode = targetCenter > screenHeight * 0.5 ? 'sheet-top' : 'sheet-bottom'

  const containerStyle = mode === 'sheet-top' ? styles.containerTop : styles.containerBottom
  const tooltipStyle = mode === 'sheet-top'
    ? [styles.tooltip, styles.tooltipTop, { paddingTop: insets.top + 12 }]
    : [styles.tooltip, styles.tooltipBottom]

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
        <View style={styles.handle} />

        <View style={styles.header}>
          {SectionIcon && <SectionIcon size={16} color={tokens.primary} strokeWidth={1.8} />}
          <Text style={styles.sectionName}>{sectionName}</Text>
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

        <View style={styles.dotsContainer}>
          {Array.from({ length: sectionProgress.total }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === sectionProgress.current - 1
                  ? styles.dotActive
                  : i < sectionProgress.current - 1
                    ? styles.dotCompleted
                    : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        <View style={styles.navRow}>
          {!isFirstStep ? (
            <Pressable style={styles.backButton} onPress={onPrev}>
              <ChevronLeft size={16} color={tokens.fg2} strokeWidth={1.8} />
              <Text style={styles.backButtonText}>{t('tour.ui.back')}</Text>
            </Pressable>
          ) : (
            <View />
          )}

          <View style={{ flex: 1 }} />

          <Pressable
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

        <Pressable style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipButtonText}>{t('tour.ui.skip')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

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
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderTopWidth: 1,
      borderColor: tokens.hairline,
      paddingTop: 12,
      paddingBottom: 32,
      shadowOffset: { width: 0, height: -4 },
    },
    tooltipTop: {
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
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
      marginBottom: 16,
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
      fontSize: 13.5,
      lineHeight: 21,
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
    dot: {
      height: 8,
      borderRadius: 999,
    },
    dotActive: {
      width: 16,
      backgroundColor: tokens.primary,
    },
    dotCompleted: {
      width: 8,
      backgroundColor: tintFromPrimary(tokens, 0.4),
    },
    dotInactive: {
      width: 8,
      backgroundColor: tokens.fg4,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      minHeight: 44,
      borderRadius: radius.full,
    },
    backButtonText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg2,
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
      transform: [{ scale: 0.97 }],
    },
    nextButtonText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
      color: tokens.fgOnPrimary,
    },
    skipButton: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      minHeight: 44,
    },
    skipButtonText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
