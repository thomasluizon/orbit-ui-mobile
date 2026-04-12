import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native'
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
import { createColors } from '@/lib/theme'
import { ProBadge } from '@/components/ui/pro-badge'

type AppColors = ReturnType<typeof createColors>

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
  const { colors } = useAppTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createTooltipStyles(colors), [colors])

  const iconKey = step.section ? TOUR_SECTION_ICONS[step.section] : undefined
  const SectionIcon = iconKey
    ? SECTION_ICON_MAP[iconKey as keyof typeof SECTION_ICON_MAP]
    : undefined

  const sectionName = sectionProgress.section
    ? t(`tour.sections.${sectionProgress.section}`)
    : ''

  // Match web behavior: if target center is in the bottom half, show tooltip at top
  const screenHeight = Dimensions.get('window').height
  const targetCenter = targetRect.y + targetRect.height / 2
  const mode = targetCenter > screenHeight * 0.5 ? 'sheet-top' : 'sheet-bottom'

  const containerStyle = mode === 'sheet-top' ? styles.containerTop : styles.containerBottom
  const tooltipStyle = mode === 'sheet-top'
    ? [styles.tooltip, styles.tooltipTop, { paddingTop: insets.top + 12 }]
    : [styles.tooltip, styles.tooltipBottom]

  return (
    <View style={containerStyle}>
      <View style={tooltipStyle}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          {SectionIcon && <SectionIcon size={16} color={colors.primary} />}
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

        {/* Title */}
        <Text style={styles.title}>{t(step.titleKey)}</Text>

        {/* Description */}
        <Text style={styles.description}>{t(step.descriptionKey)}</Text>

        {/* Progress dots */}
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

        {/* Navigation */}
        <View style={styles.navRow}>
          {!isFirstStep ? (
            <Pressable style={styles.backButton} onPress={onPrev}>
              <ChevronLeft size={16} color={colors.textSecondary} />
              <Text style={styles.backButtonText}>{t('tour.ui.back')}</Text>
            </Pressable>
          ) : (
            <View />
          )}

          <View style={{ flex: 1 }} />

          <Pressable style={styles.nextButton} onPress={onNext}>
            <Text style={styles.nextButtonText}>
              {isLastStep ? t('tour.ui.finish') : t('tour.ui.next')}
            </Text>
            {!isLastStep && <ChevronRight size={16} color={colors.white} />}
          </Pressable>
        </View>

        {/* Skip */}
        <Pressable style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipButtonText}>{t('tour.ui.skip')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function createTooltipStyles(colors: AppColors) {
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
      backgroundColor: colors.surface,
      paddingHorizontal: 20,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 10,
    },
    tooltipBottom: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingTop: 12,
      paddingBottom: 32,
      shadowOffset: { width: 0, height: -4 },
    },
    tooltipTop: {
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      borderBottomWidth: 1,
      borderColor: colors.border,
      paddingBottom: 16,
      shadowOffset: { width: 0, height: 4 },
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderMuted,
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
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    stepCount: {
      fontSize: 12,
      color: colors.textMuted,
    },
    proBadgeSpacing: {
      marginLeft: 'auto' as const,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    description: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    dotsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginBottom: 16,
    },
    dot: {
      height: 6,
      borderRadius: 3,
    },
    dotActive: {
      width: 16,
      backgroundColor: colors.primary,
    },
    dotCompleted: {
      width: 6,
      backgroundColor: colors.primary_30,
    },
    dotInactive: {
      width: 6,
      backgroundColor: colors.borderMuted,
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
      paddingVertical: 10,
      borderRadius: 12,
    },
    backButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    nextButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    nextButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.white,
    },
    skipButton: {
      alignItems: 'center',
      marginTop: 8,
      paddingVertical: 4,
    },
    skipButtonText: {
      fontSize: 12,
      color: colors.textMuted,
    },
  })
}
