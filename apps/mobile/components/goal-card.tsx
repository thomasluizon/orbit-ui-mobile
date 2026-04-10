import { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { differenceInDays, parseISO } from 'date-fns'
import { Flame } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { Goal } from '@orbit/shared/types/goal'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { plural } from '@/lib/plural'
import { createColors } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalCardProps {
  goal: Goal
  onPress?: (goalId: string) => void
}

// ---------------------------------------------------------------------------
// GoalCard
// ---------------------------------------------------------------------------

export function GoalCard({ goal, onPress }: GoalCardProps) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const progress = Math.min(100, Math.round(goal.progressPercentage))
  const isStreak = isStreakGoal(goal.type)
  const styles = useMemo(() => createStyles(colors), [colors])

  // Progress bar color (matches web progressColor logic)
  const progressBarColor = useMemo(() => {
    if (goal.status === 'Completed') return colors.green500
    if (goal.status === 'Abandoned') return colors.textMuted
    if (isStreak) return colors.amber500
    if (goal.progressPercentage >= 75) return colors.green500
    return colors.primary
  }, [goal.status, goal.progressPercentage, isStreak])

  // Deadline info (matches web deadlineInfo logic)
  const deadlineInfo = useMemo(() => {
    if (!goal.deadline) return null
    const deadlineDate = parseISO(goal.deadline)
    const today = new Date()
    const daysLeft = differenceInDays(deadlineDate, today)

    if (goal.status !== 'Active') return null

    if (daysLeft < 0) {
      return {
        text: t('goals.deadline.overdue'),
        textColor: colors.red400,
        bgColor: 'rgba(239, 68, 68, 0.1)', // bg-red-500/10
      }
    }
    if (daysLeft <= 7) {
      return {
        text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
        textColor: colors.amber400,
        bgColor: 'rgba(245, 158, 11, 0.1)', // bg-amber-500/10
      }
    }
    return {
      text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
      textColor: colors.textMuted,
      bgColor: colors.surfaceElevated,
    }
  }, [goal.deadline, goal.status, t])

  // Status badge (matches web statusBadge logic)
  const statusBadge = useMemo(() => {
    if (goal.status === 'Completed') {
      return {
        text: t('goals.status.completed'),
        textColor: colors.green400,
        bgColor: 'rgba(34, 197, 94, 0.1)', // bg-green-500/10
      }
    }
    if (goal.status === 'Abandoned') {
      return {
        text: t('goals.status.abandoned'),
        textColor: colors.textMuted,
        bgColor: colors.surfaceElevated,
      }
    }
    return null
  }, [goal.status, t])

  // Tracking status left border color (matches web trackingBorderClass)
  const trackingBorder = useMemo(() => {
    switch (goal.trackingStatus) {
      case 'on_track':
        return { borderLeftWidth: 3, borderLeftColor: colors.green500 }
      case 'at_risk':
        return { borderLeftWidth: 3, borderLeftColor: colors.amber500 }
      case 'behind':
        return { borderLeftWidth: 3, borderLeftColor: colors.red500 }
      default:
        return {}
    }
  }, [goal.trackingStatus])

  // Progress label: streak goals use "Day X of Y", standard use "X of Y unit"
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

  return (
    <TouchableOpacity
      style={[styles.card, trackingBorder]}
      onPress={() => onPress?.(goal.id)}
      activeOpacity={0.85}
      disabled={!onPress}
    >
      <View style={styles.content}>
        {/* Title row */}
        <View style={styles.titleRow}>
          {isStreak && (
            <Flame size={14} color={colors.amber400} style={styles.flameIcon} />
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

        {/* Progress text */}
        <Text style={styles.progressLabel}>{progressLabel}</Text>

        {/* Progress bar */}
        <View
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

        {/* Footer: percentage + deadline */}
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
  )
}

// ---------------------------------------------------------------------------
// Styles (matches web goal-card exactly)
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof createColors>) {
  return StyleSheet.create({
  // Card: matches bg-surface rounded-[var(--radius-xl)] p-5 border border-border-muted shadow-sm
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20, // --radius-xl = 1.25rem = 20px
    padding: 20, // p-5
    borderWidth: 1,
    borderColor: colors.borderMuted,
    marginBottom: 10, // space-y-2.5
    // Shadow matching --shadow-sm
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },

  content: {
    flex: 1,
    minWidth: 0,
  },

  // Title row
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // gap-2
    marginBottom: 4, // mb-1
  },
  flameIcon: {
    flexShrink: 0,
  },
  title: {
    fontSize: 14, // text-sm
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  titleAbandoned: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },

  // Status badge (completed/abandoned)
  statusBadge: {
    paddingHorizontal: 8, // px-2
    paddingVertical: 2, // py-0.5
    borderRadius: 9999,
  },
  statusBadgeText: {
    fontSize: 10, // text-[10px]
    fontWeight: '700',
  },

  // Progress text
  progressLabel: {
    fontSize: 12, // text-xs
    color: colors.textSecondary,
    marginBottom: 8, // mb-2
  },

  // Progress bar: h-2 bg-surface-elevated rounded-full
  progressBar: {
    height: 8, // h-2
    backgroundColor: colors.surfaceElevated,
    borderRadius: 9999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 9999,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  percentText: {
    fontSize: 11, // text-[11px]
    fontWeight: '500',
    color: colors.textMuted,
  },

  // Deadline badge
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
