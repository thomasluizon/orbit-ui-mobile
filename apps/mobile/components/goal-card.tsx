import { useMemo, useRef } from 'react'
import { Pressable, View, Text, StyleSheet } from 'react-native'
import { useTourTarget } from '@/hooks/use-tour-target'
import { differenceInDays, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { Goal } from '@orbit/shared/types/goal'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { plural } from '@/lib/plural'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { StatusDot, type StatusDotState } from '@/components/ui/status-dot'
import { ProgressBar } from '@/components/ui/progress-bar'

interface GoalCardProps {
  goal: Goal
  onPress?: (goalId: string) => void
  onLongPress?: () => void
  tourTargetId?: string
}

export function GoalCard({ goal, onPress, onLongPress, tourTargetId }: Readonly<GoalCardProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const progress = Math.min(100, Math.round(goal.progressPercentage))
  const isStreak = isStreakGoal(goal.type)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const cardRef = useRef<View>(null)
  const progressRef = useRef<View>(null)
  useTourTarget(tourTargetId ?? '__noop__', cardRef)
  useTourTarget(tourTargetId ? 'tour-goal-progress' : '__noop__', progressRef)

  const progressColor = useMemo(() => {
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

  const progressTextColor = useMemo(() => {
    if (goal.status === 'Completed') return tokens.statusDone
    if (goal.status === 'Abandoned') return tokens.fg3
    if (isStreak) return tokens.statusOverdueText
    if (goal.progressPercentage >= 75) return tokens.statusDone
    return tokens.primary
  }, [
    goal.status,
    goal.progressPercentage,
    isStreak,
    tokens.statusOverdueText,
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
        textColor: tokens.statusBadText,
      }
    }
    if (daysLeft === 0) {
      return {
        text: t('goals.deadline.dueToday'),
        textColor: tokens.statusOverdueText,
      }
    }
    if (daysLeft <= 7) {
      return {
        text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
        textColor: tokens.statusOverdueText,
      }
    }
    return {
      text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
      textColor: tokens.fg3,
    }
  }, [goal.deadline, goal.status, t, tokens.statusOverdueText, tokens.statusBadText, tokens.fg3])

  const statusBadge = useMemo(() => {
    if (goal.status === 'Completed') {
      return {
        text: t('goals.status.completed'),
        textColor: tokens.statusDone,
      }
    }
    if (goal.status === 'Abandoned') {
      return {
        text: t('goals.status.abandoned'),
        textColor: tokens.fg3,
      }
    }
    return null
  }, [goal.status, t, tokens.statusDone, tokens.fg3])

  const trackingDot = useMemo<{ state: StatusDotState; label: string } | null>(() => {
    if (goal.status !== 'Active') return null
    switch (goal.trackingStatus) {
      case 'on_track':
        return { state: 'done', label: t('goals.metrics.onTrack') }
      case 'at_risk':
        return { state: 'overdue', label: t('goals.metrics.atRisk') }
      case 'behind':
        return { state: 'bad', label: t('goals.metrics.behind') }
      default:
        return null
    }
  }, [goal.status, goal.trackingStatus, t])

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

  const percentLabel = t('goals.progressPercentage', {
    pct: progress,
  })

  const cardAccessibilityLabel = [
    goal.title,
    progressLabel,
    `${progress}%`,
    statusBadge?.text,
    deadlineInfo?.text,
  ]
    .filter((part): part is string => part != null)
    .join(', ')

  return (
    <Pressable
      ref={tourTargetId ? cardRef : undefined}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
      onPress={() => onPress?.(goal.id)}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={cardAccessibilityLabel}
      accessibilityHint={onLongPress ? t('goals.reorderHint') : undefined}
    >
      <View style={styles.headerRow}>
        <View style={styles.emojiWell}>
          <Text style={styles.emojiWellText}>{isStreak ? '🔥' : '🎯'}</Text>
        </View>

        <View style={styles.headerContent}>
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.title,
                goal.status === 'Abandoned' && styles.titleAbandoned,
              ]}
              numberOfLines={2}
            >
              {goal.title}
            </Text>
            {statusBadge ? (
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { color: statusBadge.textColor }]}>
                  {statusBadge.text}
                </Text>
              </View>
            ) : (
              trackingDot && (
                <StatusDot state={trackingDot.state} accessibilityLabel={trackingDot.label} />
              )
            )}
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.progressLabel} numberOfLines={1}>
              {progressLabel}
            </Text>
            {deadlineInfo && (
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { color: deadlineInfo.textColor }]}>
                  {deadlineInfo.text}
                </Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[styles.percentText, { color: progressTextColor }]}>
          {progress}%
        </Text>
      </View>

      <View
        ref={tourTargetId ? progressRef : undefined}
        style={styles.progressRow}
      >
        <ProgressBar
          style={styles.progressBar}
          progress={progress / 100}
          label={percentLabel}
          color={progressColor}
        />
      </View>
    </Pressable>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    card: {
      backgroundColor: tokens.bgCard,
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: tokens.hairline,
      overflow: 'hidden',
    },
    cardPressed: {
      transform: [{ scale: 0.99 }],
      backgroundColor: tokens.bgElevPressed,
      borderColor: tokens.hairlineStrong,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    emojiWell: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: tokens.bgWell,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    emojiWellText: {
      fontSize: 20,
      lineHeight: 26,
    },
    headerContent: {
      flex: 1,
      minWidth: 0,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
      flex: 1,
    },
    titleAbandoned: {
      textDecorationLine: 'line-through',
      color: tokens.fg3,
    },

    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: tokens.hairlineStrong,
    },
    badgeText: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 10.5,
      letterSpacing: 0.63,
      textTransform: 'uppercase',
    },

    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 2,
    },
    progressLabel: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 13,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
    },

    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    progressBar: {
      flex: 1,
    },
    percentText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 18,
      letterSpacing: -0.18,
      fontVariant: ['tabular-nums'],
      flexShrink: 0,
    },
  })
}
