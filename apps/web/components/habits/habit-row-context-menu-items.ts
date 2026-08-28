import type { HabitCardTranslationAdapter } from '@orbit/shared/utils'

export interface HabitRowContextAction {
  id: string
  label: string
  onRun: () => void
  destructive?: boolean
}

interface BuildHabitRowContextMenuItemsParams {
  selectMode: boolean
  isDone: boolean
  canLog: boolean
  onLog?: () => void
  onSkip?: () => void
  onDetail?: () => void
  onEdit?: () => void
  onDuplicate?: () => void
  onAddSubHabit?: () => void
  onDelete?: () => void
  t: HabitCardTranslationAdapter
}

/** Builds the desktop right-click context-menu items for a habit row from the
 *  available action handlers and row state; omits any action whose handler is absent
 *  and returns an empty list in select mode. */
export function buildHabitRowContextMenuItems({
  selectMode,
  isDone,
  canLog,
  onLog,
  onSkip,
  onDetail,
  onEdit,
  onDuplicate,
  onAddSubHabit,
  onDelete,
  t,
}: BuildHabitRowContextMenuItemsParams): HabitRowContextAction[] {
  if (selectMode) return []
  return [
    onLog && !isDone && canLog
      ? { id: 'log', label: t('contextMenu.log'), onRun: onLog }
      : null,
    onSkip ? { id: 'skip', label: t('contextMenu.skip'), onRun: onSkip } : null,
    onDetail
      ? { id: 'viewDetails', label: t('contextMenu.viewDetails'), onRun: onDetail }
      : null,
    onEdit ? { id: 'edit', label: t('contextMenu.edit'), onRun: onEdit } : null,
    onDuplicate
      ? { id: 'duplicate', label: t('contextMenu.duplicate'), onRun: onDuplicate }
      : null,
    onAddSubHabit
      ? { id: 'addSubHabit', label: t('contextMenu.addSubHabit'), onRun: onAddSubHabit }
      : null,
    onDelete
      ? { id: 'delete', label: t('contextMenu.delete'), onRun: onDelete, destructive: true }
      : null,
  ].filter((item): item is HabitRowContextAction => item !== null)
}
