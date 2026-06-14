'use client'

import { ListChecks, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { FactsPagination } from './facts-pagination'

function ChipActionButton({
  onClick,
  disabled = false,
  destructive = false,
  children,
}: Readonly<{
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  children: React.ReactNode
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="chip disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        fontSize: 12,
        padding: '7px 12px',
        ...(destructive ? { color: 'var(--status-bad)' } : null),
      }}
    >
      {children}
    </button>
  )
}

interface FactsSelectBarProps {
  selectMode: boolean
  selectedCount: number
  allSelected: boolean
  bulkDeletePending: boolean
  showPagination: boolean
  page: number
  totalPages: number
  onPreviousPage: () => void
  onNextPage: () => void
  onToggleSelectAll: () => void
  onBulkDelete: () => void
  onToggleSelectMode: () => void
}

export function FactsSelectBar({
  selectMode,
  selectedCount,
  allSelected,
  bulkDeletePending,
  showPagination,
  page,
  totalPages,
  onPreviousPage,
  onNextPage,
  onToggleSelectAll,
  onBulkDelete,
  onToggleSelectMode,
}: Readonly<FactsSelectBarProps>) {
  const t = useTranslations()

  if (!selectMode) {
    return (
      <span className="inline-flex items-center" style={{ gap: 4 }}>
        {showPagination && (
          <FactsPagination
            page={page}
            totalPages={totalPages}
            onPrevious={onPreviousPage}
            onNext={onNextPage}
          />
        )}
        <button
          type="button"
          onClick={onToggleSelectMode}
          aria-label={t('profile.facts.select')}
          className="icon-btn"
          style={{ width: 32, height: 32, color: 'var(--fg-3)' }}
        >
          <ListChecks size={18} strokeWidth={1.8} />
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center" style={{ gap: 6 }}>
      <ChipActionButton onClick={onToggleSelectAll}>
        {allSelected
          ? t('profile.facts.deselectAll')
          : t('profile.facts.selectAll')}
      </ChipActionButton>
      {selectedCount > 0 && (
        <ChipActionButton
          destructive
          disabled={bulkDeletePending}
          onClick={onBulkDelete}
        >
          <Trash2 size={14} strokeWidth={1.8} />
          {selectedCount}
        </ChipActionButton>
      )}
      <button
        type="button"
        onClick={onToggleSelectMode}
        aria-label={t('profile.facts.cancel')}
        className="icon-btn"
        style={{ width: 32, height: 32, color: 'var(--fg-3)' }}
      >
        <X size={18} strokeWidth={1.8} />
      </button>
    </span>
  )
}
