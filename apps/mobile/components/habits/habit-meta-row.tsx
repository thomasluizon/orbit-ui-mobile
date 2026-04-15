import { useMemo } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Clock, Flame, ClipboardCheck } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitCardStatus } from '@orbit/shared/utils'
import { useAppTheme } from '@/lib/use-app-theme'

/** Warm coral for overdue status text + dot. */
const STATUS_CORAL = 'rgb(248, 113, 113)'
/** Success green for completed status text + dot. */
const STATUS_GREEN = 'rgb(34, 197, 94)'

type Tone = 'neutral' | 'primary' | 'destructive' | 'amber' | 'tag'

export interface HabitMetaChip {
  key: string
  tone: Tone
  label?: string
  icon?: 'clock' | 'flame' | 'checklist'
  color?: string
}

interface HabitMetaRowProps {
  habit: NormalizedHabit
  isChild: boolean
  isCompleted: boolean
  frequencyLabel: string
  flexibleProgressLabel: string | null
  statusBadge: { text: string } | null
  /** Full status so we can render Today / Overdue / Completed as a colored label. */
  status?: HabitCardStatus
  checkedCount: number
  matchBadges: ReadonlyArray<{ label: string }>
  displayTime: (time: string | null | undefined) => string
  maxVisibleChips?: number
  tagsRef?: React.RefObject<View | null>
}

/**
 * Mobile mirror of apps/web/components/habits/habit-meta-row.tsx.
 * Renders the same chip set with overflow "+N" collapsing so 15 habits on
 * screen stay visually calm.
 */
export function HabitMetaRow({
  habit,
  isChild,
  isCompleted,
  frequencyLabel,
  flexibleProgressLabel,
  statusBadge,
  status,
  checkedCount,
  matchBadges,
  displayTime,
  maxVisibleChips = 3,
  tagsRef,
}: HabitMetaRowProps) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const chips = useMemo(
    () =>
      buildChips({
        habit,
        flexibleProgressLabel,
        // When `status` is provided we render a richer dot+label pair instead
        // of a destructive chip.
        statusBadge: status ? null : statusBadge,
        checkedCount,
        matchBadges,
        displayTime,
        badHabitLabel: t('habits.badHabit'),
      }),
    [
      habit,
      flexibleProgressLabel,
      statusBadge,
      status,
      checkedCount,
      matchBadges,
      displayTime,
      t,
    ],
  )

  const visible = chips.slice(0, maxVisibleChips)
  const overflow = chips.length - visible.length

  const styles = createStyles(colors)
  const statusLabel = resolveStatusLabel(status, t, isCompleted)

  return (
    <View style={[styles.row, isCompleted && styles.dimmed]}>
      <Text
        style={[styles.frequency, { fontSize: isChild ? 9 : 10 }]}
        numberOfLines={1}
      >
        {frequencyLabel}
      </Text>
      {statusLabel ? (
        <View style={styles.statusLabelRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: statusLabel.color },
            ]}
          />
          <Text
            style={[styles.statusLabelText, { color: statusLabel.color }]}
            numberOfLines={1}
          >
            {statusLabel.text}
          </Text>
        </View>
      ) : null}
      <View ref={tagsRef} style={styles.chipArea}>
        {visible.map((chip) => (
          <Chip key={chip.key} chip={chip} />
        ))}
        {overflow > 0 ? (
          <View style={[styles.chip, styles.chipNeutral]}>
            <Text style={[styles.chipText, { color: colors.textMuted }]}>+{overflow}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

interface StatusLabel {
  text: string
  color: string
}

function resolveStatusLabel(
  status: HabitCardStatus | undefined,
  t: (key: string) => string,
  isCompleted: boolean,
): StatusLabel | null {
  if (status === 'completed' || isCompleted) {
    return { text: t('habits.instance.completed'), color: STATUS_GREEN }
  }
  if (status === 'overdue') {
    return { text: t('habits.overdue'), color: STATUS_CORAL }
  }
  return null
}

function Chip({ chip }: Readonly<{ chip: HabitMetaChip }>) {
  const { colors } = useAppTheme()
  const styles = createStyles(colors)
  let toneStyle: StyleProp<ViewStyle>
  let textColor = colors.textSecondary
  if (chip.tone === 'neutral') {
    toneStyle = styles.chipNeutral
    textColor = colors.textSecondary
  } else if (chip.tone === 'primary') {
    toneStyle = styles.chipPrimary
    textColor = colors.primary
  } else if (chip.tone === 'destructive') {
    toneStyle = styles.chipDestructive
    textColor = colors.danger
  } else if (chip.tone === 'amber') {
    toneStyle = styles.chipAmber
    textColor = colors.amber400
  } else {
    toneStyle = [styles.chipTag, { backgroundColor: chip.color ?? colors.primary }]
    textColor = 'rgba(255, 255, 255, 0.95)'
  }

  return (
    <View style={[styles.chip, toneStyle]}>
      {renderIcon(chip.icon, textColor)}
      {chip.label ? (
        <Text style={[styles.chipText, { color: textColor }]} numberOfLines={1}>
          {chip.label}
        </Text>
      ) : null}
    </View>
  )
}

function renderIcon(icon: HabitMetaChip['icon'], color: string) {
  if (icon === 'clock') return <Clock size={10} color={color} />
  if (icon === 'flame') return <Flame size={10} color={color} />
  if (icon === 'checklist') return <ClipboardCheck size={10} color={color} />
  return null
}

interface BuildChipsArgs {
  habit: NormalizedHabit
  flexibleProgressLabel: string | null
  statusBadge: { text: string } | null
  checkedCount: number
  matchBadges: ReadonlyArray<{ label: string }>
  displayTime: (time: string | null | undefined) => string
  badHabitLabel: string
}

function buildChips({
  habit,
  flexibleProgressLabel,
  statusBadge,
  checkedCount,
  matchBadges,
  displayTime,
  badHabitLabel,
}: BuildChipsArgs): HabitMetaChip[] {
  const chips: HabitMetaChip[] = []

  if (habit.dueTime) {
    const label = habit.dueEndTime
      ? `${displayTime(habit.dueTime)} - ${displayTime(habit.dueEndTime)}`
      : displayTime(habit.dueTime)
    chips.push({ key: 'time', tone: 'neutral', label, icon: 'clock' })
  }

  if (statusBadge) {
    chips.push({ key: 'status', tone: 'destructive', label: statusBadge.text })
  }

  if (flexibleProgressLabel) {
    chips.push({ key: 'flexible', tone: 'primary', label: flexibleProgressLabel })
  }

  if (habit.isBadHabit) {
    chips.push({ key: 'bad', tone: 'destructive', label: badHabitLabel })
  }

  if (habit.checklistItems && habit.checklistItems.length > 0) {
    chips.push({
      key: 'checklist',
      tone: 'neutral',
      label: `${checkedCount}/${habit.checklistItems.length}`,
      icon: 'checklist',
    })
  }

  if (habit.currentStreak != null && habit.currentStreak >= 2) {
    chips.push({
      key: 'streak',
      tone: 'amber',
      label: String(habit.currentStreak),
      icon: 'flame',
    })
  }

  for (const tag of habit.tags ?? []) {
    chips.push({ key: `tag-${tag.id}`, tone: 'tag', label: tag.name, color: tag.color })
  }

  for (const goal of habit.linkedGoals ?? []) {
    chips.push({ key: `goal-${goal.id}`, tone: 'primary', label: goal.title })
  }

  for (const match of matchBadges) {
    chips.push({ key: `match-${match.label}`, tone: 'primary', label: match.label })
  }

  return chips
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
      flexShrink: 1,
      overflow: 'hidden',
    },
    dimmed: { opacity: 0.85 },
    frequency: {
      fontWeight: '600',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      // Slightly de-emphasized so the title holds focus (matches web
      // `.habit-type-chip`).
      color: colors.textMuted,
      opacity: 0.9,
      flexShrink: 0,
    },
    statusLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusLabelText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    chipArea: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 1,
      flexWrap: 'nowrap',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 9999,
      maxWidth: 140,
      flexShrink: 1,
    },
    chipNeutral: {
      backgroundColor: colors.surfaceElevated,
    },
    chipPrimary: {
      backgroundColor: colors.primary_10,
    },
    chipDestructive: {
      backgroundColor: colors.red500_10,
    },
    chipAmber: {
      backgroundColor: 'rgba(251, 191, 36, 0.12)',
    },
    chipTag: {},
    chipText: {
      fontSize: 10,
      fontWeight: '700',
    },
  })
}
