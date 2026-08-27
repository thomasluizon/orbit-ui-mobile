'use client'

import { Sheet } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'

interface HabitListConfirmDialogsProps {
  t: (key: string, params?: Record<string, string | number | Date>) => string
  showDeleteConfirm: boolean
  onDeleteOpenChange: (open: boolean) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

/** The irreversible habit deletion confirmation owned by HabitList. */
export function HabitListConfirmDialogs({
  t,
  showDeleteConfirm,
  onDeleteOpenChange,
  onConfirmDelete,
  onCancelDelete,
}: Readonly<HabitListConfirmDialogsProps>) {
  if (!showDeleteConfirm) return null

  return (
    <Sheet
      open
      title={t('habits.deleteConfirmTitle')}
      onClose={() => onDeleteOpenChange(false)}
      actions={(
        <>
          <PillButton variant="ghost" onClick={onCancelDelete}>
            {t('common.cancel')}
          </PillButton>
          <PillButton variant="destructive" onClick={onConfirmDelete}>
            {t('common.delete')}
          </PillButton>
        </>
      )}
    >
      <p className="text-sm text-[var(--fg-2)]">{t('habits.deleteConfirmMessage')}</p>
    </Sheet>
  )
}
