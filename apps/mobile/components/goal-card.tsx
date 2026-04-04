import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Target, ChevronRight } from 'lucide-react-native'
import type { Goal } from '@orbit/shared/types/goal'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalCardProps {
  goal: Goal
  onPress?: (goalId: string) => void
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  surface: '#13111f',
  border: 'rgba(255,255,255,0.07)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  blue: '#3b82f6',
}

function statusColor(status?: string): string {
  switch (status) {
    case 'on_track':
      return colors.green
    case 'at_risk':
      return colors.orange
    case 'behind':
      return colors.red
    case 'completed':
      return colors.green
    default:
      return colors.textMuted
  }
}

function statusLabel(status?: string): string {
  switch (status) {
    case 'on_track':
      return 'On Track'
    case 'at_risk':
      return 'At Risk'
    case 'behind':
      return 'Behind'
    case 'completed':
      return 'Completed'
    case 'no_deadline':
      return 'No Deadline'
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// GoalCard
// ---------------------------------------------------------------------------

export function GoalCard({ goal, onPress }: GoalCardProps) {
  const progress = Math.min(100, Math.round(goal.progressPercentage))
  const color = statusColor(goal.trackingStatus)

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(goal.id)}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
        <Target size={20} color={colors.primary} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {goal.title}
        </Text>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <Text style={styles.progressText}>
            {goal.currentValue}/{goal.targetValue} {goal.unit}
          </Text>
          {goal.trackingStatus && (
            <View style={[styles.statusBadge, { backgroundColor: `${color}20` }]}>
              <Text style={[styles.statusText, { color }]}>
                {statusLabel(goal.trackingStatus)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {onPress && <ChevronRight size={16} color={colors.textMuted} />}
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
})
