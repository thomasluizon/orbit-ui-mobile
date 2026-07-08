import type { HabitCardTranslationAdapter } from '@orbit/shared/utils'
import type { ContextMenuItem } from '@/components/ui/context-menu'

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
}: BuildHabitRowContextMenuItemsParams): ContextMenuItem[] {
  if (selectMode) return []
  return [
    onLog && !isDone && canLog
      ? { key: 'log', label: t('contextMenu.log'), onSelect: onLog }
      : null,
    onSkip ? { key: 'skip', label: t('contextMenu.skip'), onSelect: onSkip } : null,
    onDetail
      ? { key: 'viewDetails', label: t('contextMenu.viewDetails'), onSelect: onDetail }
      : null,
    onEdit ? { key: 'edit', label: t('contextMenu.edit'), onSelect: onEdit } : null,
    onDuplicate
      ? { key: 'duplicate', label: t('contextMenu.duplicate'), onSelect: onDuplicate }
      : null,
    onAddSubHabit
      ? { key: 'addSubHabit', label: t('contextMenu.addSubHabit'), onSelect: onAddSubHabit }
      : null,
    onDelete
      ? { key: 'delete', label: t('contextMenu.delete'), onSelect: onDelete, danger: true }
      : null,
  ].filter((item): item is ContextMenuItem => item !== null)
}
