'use client'

import { CheckCircle, XCircle, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ActionResult } from '@orbit/shared/types/chat'
import { ConflictWarning } from './conflict-warning'

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

const CHIP_STYLES: Record<
  string,
  { text: string; bg: string; border: string; Icon: typeof CheckCircle }
> = {
  Success: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    Icon: CheckCircle,
  },
  Failed: {
    text: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    Icon: XCircle,
  },
}

const DEFAULT_CHIP_STYLE = {
  text: 'text-blue-400',
  bg: 'bg-blue-500/10',
  border: 'border-blue-500/30',
  Icon: Info,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chipStyle(action: ActionResult) {
  return CHIP_STYLES[action.status] ?? DEFAULT_CHIP_STYLE
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActionChipsProps {
  actions: ActionResult[]
}

export function ActionChips({ actions }: ActionChipsProps) {
  const t = useTranslations()

  function actionLabel(action: ActionResult): string {
    const name = action.entityName || t('chat.unknownEntity')
    const labelKey = ACTION_LABELS[action.type]
    if (labelKey) return t(labelKey, { name })
    // Fallback: humanize the tool name
    return `${action.type.replaceAll('_', ' ')}: ${name}`
  }

  return (
    <div className="flex flex-col gap-2 mt-2">
      {actions.map((action, index) => {
        if (action.status === 'Suggestion') return null
        const style = chipStyle(action)
        const IconComponent = style.Icon

        return (
          <div
            key={`${action.type}-${action.entityId || index}`}
            className="animate-chip-in"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold border hover:scale-[1.02] transition-all duration-150 ${style.text} ${style.bg} ${style.border}`}
            >
              <IconComponent className="size-2.5" />
              {actionLabel(action)}
            </span>

            {action.status === 'Failed' && action.error && (
              <p className="text-xs text-red-400 mt-1 pl-1">{action.error}</p>
            )}

            {action.conflictWarning?.hasConflict && (
              <ConflictWarning warning={action.conflictWarning} />
            )}
          </div>
        )
      })}
    </div>
  )
}
