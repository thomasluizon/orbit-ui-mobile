'use client'

import { createPortal } from 'react-dom'
import {
  X,
  CheckCircle,
  MinusCircle,
  PlusCircle,
  Forward,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'

export interface BulkActionBarProps {
  selectedCount: number
  allSelected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onBulkLog: () => void
  onBulkSkip: () => void
  onBulkDelete: () => void
  onCancel: () => void
}

export function BulkActionBar({
  selectedCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onBulkLog,
  onBulkSkip,
  onBulkDelete,
  onCancel,
}: BulkActionBarProps) {
  const t = useTranslations()

  return createPortal(
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-var(--app-px)*2)] max-w-[calc(var(--app-max-w)-var(--app-px)*2)] bg-surface-overlay border border-border-muted rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] backdrop-blur-xl px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium shrink-0">
          {plural(t('common.selected', { n: selectedCount }), selectedCount)}
        </span>
        <div className="flex items-center gap-1">
          <button
            className="p-2 text-text-secondary hover:text-text-primary transition-colors rounded-xl hover:bg-surface-elevated"
            aria-label={
              allSelected
                ? t('common.deselectAll')
                : t('common.selectAll')
            }
            onClick={() =>
              allSelected ? onDeselectAll() : onSelectAll()
            }
          >
            {allSelected ? (
              <MinusCircle className="size-5" />
            ) : (
              <PlusCircle className="size-5" />
            )}
          </button>
          <button
            className="p-2 text-primary hover:text-primary/80 transition-colors rounded-xl hover:bg-primary/10"
            aria-label={t('habits.logHabit')}
            onClick={onBulkLog}
          >
            <CheckCircle className="size-5" />
          </button>
          <button
            className="p-2 text-amber-400 hover:text-amber-300 transition-colors rounded-xl hover:bg-amber-500/10"
            aria-label={t('habits.skipHabit')}
            onClick={onBulkSkip}
          >
            <Forward className="size-5" />
          </button>
          <button
            className="p-2 text-red-400 hover:text-red-300 transition-colors rounded-xl hover:bg-red-500/10"
            aria-label={t('common.delete')}
            onClick={onBulkDelete}
          >
            <Trash2 className="size-5" />
          </button>
          <div className="w-px h-5 bg-border mx-0.5" />
          <button
            className="p-2 text-text-secondary hover:text-text-primary transition-colors rounded-xl hover:bg-surface-elevated"
            aria-label={t('common.cancel')}
            onClick={onCancel}
          >
            <X className="size-5" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
