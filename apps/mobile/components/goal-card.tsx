import { useCallback, useMemo, useRef } from 'react'
import { Animated, Easing, Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTourTarget } from '@/hooks/use-tour-target'
import { differenceInDays, parseISO } from 'date-fns'
import { Flame } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { Goal } from '@orbit/shared/types/goal'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { plural } from '@/lib/plural'
import { createTokensV2, gradients, radius, shadows } from '@/lib/theme'
import { useResolvedMotionPreset } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

interface GoalCardProps {
  goal: Goal
  onPress?: (goalId: string) => void
  tourTargetId?: string
}

export function GoalCard({ goal, onPress, tourTargetId }: GoalCardProps) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const selectionMotion = useResolvedMotionPreset('selection')
  const progress = Math.min(100, Math.round(goal.progressPercentage))
  const isStreak = isStreakGoal(goal.type)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const cardRef = useRef<View>(null)
  const progressRef = useRef<View>(null)
  const pressScale = useMemo(() => new Animated.Value(1), [])
  useTourTarget(tourTargetId ?? '__noop__', cardRef)
  useTourTarget(tourTargetId ? 'tour-goal-progress' : '__noop__', progressRef)

  const handlePressIn = useCallback(() => {
    Animated.timing(pressScale, {
      toValue: selectionMotion.reducedMotionEnabled ? 1 : 0.985,
      duration: 100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [pressScale, selectionMotion.reducedMotionEnabled])

  const handlePressOut = useCallback(() => {
    Animated.timing(pressScale, {
      toValue: 1,
      duration: selectionMotion.exitDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [pressScale, selectionMotion.exitDuration])

  const progressBarColor = useMemo(() => {
    if (goal.status === 'Completed') return tokens.statusDone
    if (goal.status === 'Abandoned') return tokens.fg3
    if (isStreak) return tokens.statusOverdue
    if (goal.progressPercentage >= 75) return tokens.statusDone
    return tokens.primary
  }, [
    goal.status,
    goal.progressPercentage,
    isStreak,
    tokens.statusOverdue,
    tokens.statusDone,
    tokens.primary,
    tokens.fg3,
  ])

  const deadlineInfo = useMemo(() => {
    if (!goal.deadline) return null
    const deadlineDate = parseISO(goal.deadline)
    const today = new Date()
    const daysLeft = differenceInDays(deadlineDate, today)

    if (goal.status !== 'Active') return null

    if (daysLeft < 0) {
      return {
        text: t('goals.deadline.overdue'),
        textColor: tokens.statusBad,
        bgColor: 'rgba(239, 68, 68, 0.1)',
      }
    }
    if (daysLeft <= 7) {
      return {
        text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
        textColor: tokens.statusOverdue,
        bgColor: 'rgba(245, 158, 11, 0.1)',
      }
    }
    return {
      text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
      textColor: tokens.fg3,
      bgColor: tokens.bgElev,
    }
  }, [
    goal.deadline,
    goal.status,
    t,
    tokens.statusOverdue,
    tokens.statusBad,
    tokens.bgElev,
    tokens.fg3,
  ])

  const statusBadge = useMemo(() => {
    if (goal.status === 'Completed') {
      return {
        text: t('goals.status.completed'),
        textColor: tokens.statusDone,
        bgColor: 'rgba(34, 197, 94, 0.1)',
      }
    }
    if (goal.status === 'Abandoned') {
      return {
        text: t('goals.status.abandoned'),
        textColor: tokens.fg3,
        bgColor: tokens.bgElev,
      }
    }
    return null
  }, [goal.status, t, tokens.statusDone, tokens.bgElev, tokens.fg3])

  const trackingBorder = useMemo(() => {
    switch (goal.trackingStatus) {
      case 'on_track':
        return { borderLeftWidth: 3, borderLeftColor: tokens.statusDone }
      case 'at_risk':
        return { borderLeftWidth: 3, borderLeftColor: tokens.statusOverdue }
      case 'behind':
        return { borderLeftWidth: 3, borderLeftColor: tokens.statusBad }
      default:
        return {}
    }
  }, [goal.trackingStatus, tokens.statusOverdue, tokens.statusDone, tokens.statusBad])

  const progressLabel = isStreak
    ? t('goals.streak.ofTarget', {
        current: goal.currentValue,
        target: goal.targetValue,
      })
    : t('goals.progressOf', {
        current: goal.currentValue,
        target: goal.targetValue,
        unit: goal.unit,
      })

  const isCompleted = goal.status === 'Completed'

  return (
    <Animated.View style={{ transform: [{ scale: pressScale }] }}>
      <TouchableOpacity
        ref={tourTargetId ? cardRef : undefined}
        style={[styles.card, trackingBorder, isCompleted && styles.cardCompleted]}
        onPress={() => onPress?.(goal.id)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.88}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={goal.title}
      >
      {isCompleted && Platform.OS === 'android' && (
        <View style={styles.androidCompletedGlow} pointerEvents="none" />
      )}
      <LinearGradient
        colors={gradients.surfaceSheen}
        locations={gradients.surfaceSheenLocations}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.25, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={styles.insetHighlight} pointerEvents="none" />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          {isStreak && (
            <Flame size={14} color={tokens.statusOverdue} style={styles.flameIcon} />
          )}
          <Text
            style={[
              styles.title,
              goal.status === 'Abandoned' && styles.titleAbandoned,
            ]}
            numberOfLines={1}
          >
            {goal.title}
          </Text>
          {statusBadge && (
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusBadge.bgColor },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: statusBadge.textColor },
                ]}
              >
                {statusBadge.text}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.progressLabel}>{progressLabel}</Text>

        <View
          ref={tourTargetId ? progressRef : undefined}
          style={styles.progressBar}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: progress,
          }}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: progressBarColor,
              },
            ]}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.percentText}>
            {t('goals.progressPercentage', { pct: goal.progressPercentage })}
          </Text>
          {deadlineInfo && (
            <View
              style={[
                styles.deadlineBadge,
                { backgroundColor: deadlineInfo.bgColor },
              ]}
            >
              <Text
                style={[
                  styles.deadlineBadgeText,
                  { color: deadlineInfo.textColor },
                ]}
              >
                {deadlineInfo.text}
              </Text>
            </View>
          )}
        </View>
      </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
  card: {
    backgroundColor: tokens.bgElev,
    borderRadius: radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: tokens.hairline,
    marginBottom: 10,
    overflow: 'hidden',
    ...shadows.cardParent,
    elevation: 5,
  },
  cardCompleted: {
    shadowColor: tokens.statusDone,
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  androidCompletedGlow: {
    position: 'absolute',
    inset: -4,
    backgroundColor: tokens.bgElev,
    borderRadius: radius.xl + 4,
  },
  insetHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: tokens.hairline,
    pointerEvents: 'none',
  },

  content: {
    flex: 1,
    minWidth: 0,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  flameIcon: {
    flexShrink: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.fg1,
    flex: 1,
  },
  titleAbandoned: {
    textDecorationLine: 'line-through',
    color: tokens.fg3,
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  progressLabel: {
    fontSize: 12,
    color: tokens.fg2,
    marginBottom: 8,
  },

    progressBar: {
      height: 8,
      backgroundColor: tokens.bgSunk,
    borderRadius: 9999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 9999,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  percentText: {
    fontSize: 11,
    fontWeight: '500',
    color: tokens.fg3,
  },

  deadlineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  deadlineBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  })
}
