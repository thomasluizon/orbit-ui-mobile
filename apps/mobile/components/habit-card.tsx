import { useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
} from 'react-native'
import { Check, SkipForward, ChevronRight } from 'lucide-react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitCardProps {
  habit: NormalizedHabit
  dateStr: string
  isLogged: boolean
  onLog: (habitId: string) => void
  onSkip?: (habitId: string) => void
  onPress?: (habitId: string) => void
  isSelectMode?: boolean
  isSelected?: boolean
  onToggleSelection?: (habitId: string) => void
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
}

// ---------------------------------------------------------------------------
// HabitCard
// ---------------------------------------------------------------------------

export function HabitCard({
  habit,
  dateStr,
  isLogged,
  onLog,
  onSkip,
  onPress,
  isSelectMode,
  isSelected,
  onToggleSelection,
}: HabitCardProps) {
  const handlePress = useCallback(() => {
    if (isSelectMode && onToggleSelection) {
      onToggleSelection(habit.id)
    } else if (onPress) {
      onPress(habit.id)
    }
  }, [isSelectMode, onToggleSelection, onPress, habit.id])

  const handleLog = useCallback(() => {
    onLog(habit.id)
  }, [onLog, habit.id])

  const handleSkip = useCallback(() => {
    onSkip?.(habit.id)
  }, [onSkip, habit.id])

  const instanceForDate = habit.instances?.find((i) => i.date === dateStr)
  const isCompleted = isLogged || instanceForDate?.status === 'Completed'
  const isOverdue = habit.isOverdue && !isCompleted

  const tagColors = habit.tags?.slice(0, 3)

  const cardStyle: ViewStyle[] = [
    styles.card,
    isCompleted && styles.cardCompleted,
    isSelected && styles.cardSelected,
  ].filter(Boolean) as ViewStyle[]

  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={handlePress}
      onLongPress={
        !isSelectMode && onToggleSelection
          ? () => onToggleSelection(habit.id)
          : undefined
      }
      activeOpacity={0.7}
    >
      {/* Select checkbox */}
      {isSelectMode && (
        <View
          style={[
            styles.checkbox,
            isSelected && styles.checkboxSelected,
          ]}
        >
          {isSelected && <Check size={12} color="#fff" />}
        </View>
      )}

      {/* Log button */}
      {!isSelectMode && (
        <TouchableOpacity
          style={[
            styles.logButton,
            isCompleted && styles.logButtonCompleted,
            habit.isBadHabit && !isCompleted && styles.logButtonBad,
          ]}
          onPress={handleLog}
          activeOpacity={0.7}
        >
          {isCompleted && <Check size={16} color="#fff" />}
        </TouchableOpacity>
      )}

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              isCompleted && styles.titleCompleted,
            ]}
            numberOfLines={1}
          >
            {habit.title}
          </Text>
          {isOverdue && (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueText}>Overdue</Text>
            </View>
          )}
        </View>

        {/* Meta row: time + tags */}
        <View style={styles.metaRow}>
          {habit.dueTime && (
            <Text style={styles.timeText}>{habit.dueTime}</Text>
          )}
          {tagColors?.map((tag) => (
            <View
              key={tag.id}
              style={[styles.tagDot, { backgroundColor: tag.color }]}
            />
          ))}
          {habit.hasSubHabits && (
            <Text style={styles.subText}>sub-habits</Text>
          )}
        </View>
      </View>

      {/* Skip button */}
      {!isSelectMode && !isCompleted && onSkip && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <SkipForward size={14} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Chevron for navigation */}
      {!isSelectMode && onPress && (
        <ChevronRight size={16} color={colors.textMuted} />
      )}
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
  cardCompleted: {
    opacity: 0.6,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  logButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logButtonCompleted: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  logButtonBad: {
    borderColor: colors.red,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  overdueBadge: {
    backgroundColor: 'rgba(249,115,22,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  overdueText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.orange,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  timeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  skipButton: {
    padding: 6,
  },
})
