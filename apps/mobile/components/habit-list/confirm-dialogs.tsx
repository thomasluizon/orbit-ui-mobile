import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { plural } from '@/lib/plural'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

interface HabitListConfirmDialogsProps {
  t: (key: string, params?: Record<string, unknown>) => string
  showDeleteConfirm: boolean
  deleteHabitName: string
  deleteDescendantCount: number
  duplicateHabitName: string | null
  habitToSkip: NormalizedHabit | null
  parentPrompt: { id: string; name: string; mode: 'log' | 'skip' } | null
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onConfirmDuplicate: () => void
  onCancelDuplicate: () => void
  onConfirmSkip: () => void
  onCancelSkip: () => void
  onConfirmParent: () => void
  onCancelParent: () => void
}

export function HabitListConfirmDialogs({
  t,
  showDeleteConfirm,
  deleteHabitName,
  deleteDescendantCount,
  duplicateHabitName,
  habitToSkip,
  parentPrompt,
  onConfirmDelete,
  onCancelDelete,
  onConfirmDuplicate,
  onCancelDuplicate,
  onConfirmSkip,
  onCancelSkip,
  onConfirmParent,
  onCancelParent,
}: Readonly<HabitListConfirmDialogsProps>) {
  const postponing = habitToSkip?.frequencyUnit === null
  return (
    <>
      <ConfirmSheet
        open={habitToSkip !== null}
        inlineActions
        title={t(postponing ? 'habits.postponeConfirmTitle' : 'habits.skipConfirmTitle', {
          name: habitToSkip?.title ?? '',
        })}
        message={t(postponing
          ? 'habits.postponeConfirmMessage'
          : habitToSkip?.isFlexible
            ? habitToSkip.frequencyUnit === 'Month'
              ? 'habits.skipConfirmMessageFlexibleMonth'
              : 'habits.skipConfirmMessageFlexible'
            : 'habits.skipConfirmMessage')}
        confirmLabel={t(postponing ? 'habits.postponeConfirmButton' : 'habits.skipConfirmButton')}
        onCancel={onCancelSkip}
        onConfirm={onConfirmSkip}
      />
      <ConfirmSheet
        open={duplicateHabitName !== null}
        title={t('habits.duplicateConfirmTitle')}
        message={t('habits.duplicateConfirmMessage', { name: duplicateHabitName ?? '' })}
        confirmLabel={t('habits.duplicateConfirm')}
        onCancel={onCancelDuplicate}
        onConfirm={onConfirmDuplicate}
      />
      <ConfirmSheet
        key={parentPrompt?.id ?? 'parent-prompt'}
        open={parentPrompt !== null}
        title={t(parentPrompt?.mode === 'skip' ? 'habits.autoSkipParentTitle' : 'habits.autoLogParentTitle')}
        message={t(parentPrompt?.mode === 'skip' ? 'habits.autoSkipParentMessage' : 'habits.autoLogParentMessage', { name: parentPrompt?.name ?? '' })}
        confirmLabel={t(parentPrompt?.mode === 'skip' ? 'habits.autoSkipParentConfirm' : 'habits.autoLogParentConfirm')}
        cancelLabel={t('common.notNow')}
        onCancel={onCancelParent}
        onConfirm={onConfirmParent}
      />
      <ConfirmSheet
        open={showDeleteConfirm}
        title={t('habits.deleteConfirmTitle')}
        message={plural(
          t('habits.deleteListConfirmMessage', {
            name: deleteHabitName,
            count: deleteDescendantCount,
          }),
          deleteDescendantCount,
        )}
        confirmLabel={t('habits.deleteHabit')}
        destructive
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    </>
  )
}
