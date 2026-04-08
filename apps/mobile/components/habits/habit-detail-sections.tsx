import { BarChart3, Flame, Trophy } from 'lucide-react-native'
import { Text, TouchableOpacity, View, type TextStyle, type ViewStyle } from 'react-native'

type TranslationFn = (key: string, values?: Record<string, unknown>) => string

export interface HabitDetailMetrics {
  currentStreak: number
  longestStreak: number
  monthlyCompletionRate: number
}

export interface HabitDetailNote {
  id: string
  dateLabel: string
  note: string
}

export interface HabitDetailSectionStyles {
  statsGrid: ViewStyle
  statCard: ViewStyle
  statLabel: TextStyle
  statValue: TextStyle
  skeletonIcon: ViewStyle
  skeletonLabel: ViewStyle
  skeletonValue: ViewStyle
  notesSection: ViewStyle
  sectionTitle: TextStyle
  notesList: ViewStyle
  noteCard: ViewStyle
  noteDate: TextStyle
  noteText: TextStyle
  buttonRow: ViewStyle
  editButton: ViewStyle
  editButtonText: TextStyle
  deleteButton: ViewStyle
  deleteButtonText: TextStyle
}

interface HabitDetailStatsGridProps {
  metrics: HabitDetailMetrics | null
  loading: boolean
  t: TranslationFn
  colors: {
    primary: string
    surfaceGround: string
    borderMuted: string
    textSecondary: string
    textPrimary: string
  }
  styles: Pick<
    HabitDetailSectionStyles,
    'statsGrid' | 'statCard' | 'statLabel' | 'statValue' | 'skeletonIcon' | 'skeletonLabel' | 'skeletonValue'
  >
}

interface HabitDetailRecentNotesProps {
  notes: HabitDetailNote[]
  t: TranslationFn
  styles: Pick<
    HabitDetailSectionStyles,
    'notesSection' | 'sectionTitle' | 'notesList' | 'noteCard' | 'noteDate' | 'noteText'
  >
}

interface HabitDetailActionButtonsProps {
  onEdit: () => void
  onDelete: () => void
  t: TranslationFn
  styles: Pick<
    HabitDetailSectionStyles,
    'buttonRow' | 'editButton' | 'editButtonText' | 'deleteButton' | 'deleteButtonText'
  >
}

export function HabitDetailStatsGrid({
  metrics,
  loading,
  t,
  colors,
  styles,
}: Readonly<HabitDetailStatsGridProps>) {
  if (metrics && !loading) {
    return (
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Flame size={20} color={colors.primary} />
          <Text style={styles.statLabel}>
            {t('habits.detail.currentStreak')}
          </Text>
          <Text style={styles.statValue}>
            {t('habits.detail.streakDays', {
              n: metrics.currentStreak,
            })}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Trophy size={20} color={colors.primary} />
          <Text style={styles.statLabel}>
            {t('habits.detail.longestStreak')}
          </Text>
          <Text style={styles.statValue}>
            {t('habits.detail.streakDays', {
              n: metrics.longestStreak,
            })}
          </Text>
        </View>
        <View style={styles.statCard}>
          <BarChart3 size={20} color={colors.primary} />
          <Text style={styles.statLabel}>
            {t('habits.detail.monthlyRate')}
          </Text>
          <Text style={styles.statValue}>
            {Math.round(metrics.monthlyCompletionRate)}%
          </Text>
        </View>
      </View>
    )
  }

  if (!metrics && loading) {
    return (
      <View style={styles.statsGrid}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.statCard}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonLabel} />
            <View style={styles.skeletonValue} />
          </View>
        ))}
      </View>
    )
  }

  return null
}

export function HabitDetailRecentNotes({
  notes,
  t,
  styles,
}: Readonly<HabitDetailRecentNotesProps>) {
  if (notes.length === 0) return null

  return (
    <View style={styles.notesSection}>
      <Text style={styles.sectionTitle}>{t('habits.detail.recentNotes')}</Text>
      <View style={styles.notesList}>
        {notes.map((note) => (
          <View key={note.id} style={styles.noteCard}>
            <Text style={styles.noteDate}>{note.dateLabel}</Text>
            <Text style={styles.noteText}>{note.note}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function HabitDetailActionButtons({
  onEdit,
  onDelete,
  t,
  styles,
}: Readonly<HabitDetailActionButtonsProps>) {
  return (
    <View style={styles.buttonRow}>
      <TouchableOpacity
        style={styles.editButton}
        onPress={onEdit}
        activeOpacity={0.7}
      >
        <Text style={styles.editButtonText}>{t('common.edit')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={onDelete}
        activeOpacity={0.7}
      >
        <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
      </TouchableOpacity>
    </View>
  )
}
