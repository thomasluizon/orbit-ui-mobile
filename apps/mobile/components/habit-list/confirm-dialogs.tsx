import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface HabitListConfirmDialogsProps {
  t: (key: string, params?: Record<string, unknown>) => string
  showDeleteConfirm: boolean
  onDeleteOpenChange: (open: boolean) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  showDuplicateConfirm: boolean
  onDuplicateOpenChange: (open: boolean) => void
  duplicateName: string
  onConfirmDuplicate: () => void
  onCancelDuplicate: () => void
  showSkipConfirm: boolean
  onSkipOpenChange: (open: boolean) => void
  isPostponeAction: boolean
  skipConfirmMessage: string
  onConfirmSkip: () => void
  onCancelSkip: () => void
  showForceLogConfirm: boolean
  onForceLogOpenChange: (open: boolean) => void
  onConfirmForceLog: () => void
  onCancelForceLog: () => void
  showAutoLogParent: boolean
  onAutoLogParentOpenChange: (open: boolean) => void
  autoLogParentName: string
  onConfirmAutoLogParent: () => void
  onCancelAutoLogParent: () => void
}

/** The cluster of habit-list confirmation dialogs (delete / duplicate / skip /
 *  force-log / auto-log-parent). Driven entirely by open-flag props and handlers
 *  owned by the parent HabitList. */
export function HabitListConfirmDialogs({
  t,
  showDeleteConfirm,
  onDeleteOpenChange,
  onConfirmDelete,
  onCancelDelete,
  showDuplicateConfirm,
  onDuplicateOpenChange,
  duplicateName,
  onConfirmDuplicate,
  onCancelDuplicate,
  showSkipConfirm,
  onSkipOpenChange,
  isPostponeAction,
  skipConfirmMessage,
  onConfirmSkip,
  onCancelSkip,
  showForceLogConfirm,
  onForceLogOpenChange,
  onConfirmForceLog,
  onCancelForceLog,
  showAutoLogParent,
  onAutoLogParentOpenChange,
  autoLogParentName,
  onConfirmAutoLogParent,
  onCancelAutoLogParent,
}: HabitListConfirmDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={onDeleteOpenChange}
        title={t('habits.deleteConfirmTitle')}
        description={t('habits.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        variant="danger"
      />

      <ConfirmDialog
        open={showDuplicateConfirm}
        onOpenChange={onDuplicateOpenChange}
        title={t('habits.duplicateConfirmTitle')}
        description={t('habits.duplicateConfirmMessage', {
          name: duplicateName,
        })}
        confirmLabel={t('habits.duplicateConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirmDuplicate}
        onCancel={onCancelDuplicate}
        variant="success"
      />

      <ConfirmDialog
        open={showSkipConfirm}
        onOpenChange={onSkipOpenChange}
        title={t(
          isPostponeAction
            ? 'habits.postponeConfirmTitle'
            : 'habits.skipConfirmTitle',
        )}
        description={skipConfirmMessage}
        confirmLabel={t(
          isPostponeAction
            ? 'habits.postponeConfirmButton'
            : 'habits.skipConfirmButton',
        )}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirmSkip}
        onCancel={onCancelSkip}
        variant="warning"
      />

      <ConfirmDialog
        open={showForceLogConfirm}
        onOpenChange={onForceLogOpenChange}
        title={t('habits.forceLogTitle')}
        description={t('habits.forceLogMessage')}
        confirmLabel={t('habits.forceLogConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirmForceLog}
        onCancel={onCancelForceLog}
        variant="warning"
      />

      <ConfirmDialog
        open={showAutoLogParent}
        onOpenChange={onAutoLogParentOpenChange}
        title={t('habits.autoLogParentTitle')}
        description={t('habits.autoLogParentMessage', {
          name: autoLogParentName,
        })}
        confirmLabel={t('habits.autoLogParentConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirmAutoLogParent}
        onCancel={onCancelAutoLogParent}
        variant="success"
      />
    </>
  )
}
