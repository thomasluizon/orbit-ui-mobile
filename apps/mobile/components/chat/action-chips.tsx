import { View, Text, StyleSheet } from 'react-native'
import { CheckCircle, XCircle, Info } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { ActionResult } from '@orbit/shared/types/chat'
import { ConflictWarning } from './conflict-warning'
import { colors, radius } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  log_habit: 'chat.action.logged',
  create_habit: 'chat.action.created',
  update_habit: 'chat.action.updated',
  delete_habit: 'chat.action.deleted',
  skip_habit: 'chat.action.skipped',
  create_sub_habit: 'chat.action.createdSubHabit',
  suggest_breakdown: 'chat.action.breakdown',
  assign_tags: 'chat.action.tagsUpdated',
  duplicate_habit: 'chat.action.duplicated',
  move_habit: 'chat.action.moved',
  // Legacy names (backward compat)
  LogHabit: 'chat.action.logged',
  CreateHabit: 'chat.action.created',
  UpdateHabit: 'chat.action.updated',
  DeleteHabit: 'chat.action.deleted',
  SkipHabit: 'chat.action.skipped',
  CreateSubHabit: 'chat.action.createdSubHabit',
  SuggestBreakdown: 'chat.action.breakdown',
  AssignTags: 'chat.action.tagsUpdated',
}

type ChipStyleEntry = {
  text: string
  bg: string
  border: string
  Icon: typeof CheckCircle
}

const CHIP_STYLES: Record<string, ChipStyleEntry> = {
  Success: {
    text: colors.emerald400,
    bg: colors.emerald500_10,
    border: colors.emerald500_30,
    Icon: CheckCircle,
  },
  Failed: {
    text: colors.red400,
    bg: colors.red500_10,
    border: colors.red500_30,
    Icon: XCircle,
  },
}

const DEFAULT_CHIP_STYLE: ChipStyleEntry = {
  text: '#60a5fa',
  bg: 'rgba(59,130,246,0.10)',
  border: 'rgba(59,130,246,0.30)',
  Icon: Info,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chipStyle(action: ActionResult): ChipStyleEntry {
  return CHIP_STYLES[action.status] ?? DEFAULT_CHIP_STYLE
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActionChipsProps {
  actions: ActionResult[]
}

export function ActionChips({ actions }: Readonly<ActionChipsProps>) {
  const { t } = useTranslation()

  function actionLabel(action: ActionResult): string {
    const name = action.entityName || t('chat.unknownEntity')
    const labelKey = ACTION_LABELS[action.type]
    if (labelKey) return t(labelKey, { name })
    // Fallback: humanize the tool name
    return `${action.type.replaceAll('_', ' ')}: ${name}`
  }

  return (
    <View style={styles.container}>
      {actions.map((action, index) => {
        if (action.status === 'Suggestion') return null
        const style = chipStyle(action)
        const IconComponent = style.Icon

        return (
          <View key={`${action.type}-${action.entityId || index}`}>
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: style.bg,
                  borderColor: style.border,
                },
              ]}
            >
              <IconComponent size={10} color={style.text} />
              <Text style={[styles.chipText, { color: style.text }]}>
                {actionLabel(action)}
              </Text>
            </View>

            {action.status === 'Failed' && action.error && (
              <Text style={styles.errorText}>{action.error}</Text>
            )}

            {action.conflictWarning?.hasConflict && (
              <ConflictWarning warning={action.conflictWarning} />
            )}
          </View>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    color: colors.red400,
    marginTop: 4,
    paddingLeft: 4,
  },
})
