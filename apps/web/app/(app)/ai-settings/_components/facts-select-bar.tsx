'use client'

import { useTranslations } from 'next-intl'

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
      style={destructive ? { color: 'var(--status-bad)' } : undefined}
    >
      {children}
    </button>
  )
}

interface FactsSelectBarProps {
  factCount: number
  selectMode: boolean
  selectedCount: number
  allSelected: boolean
  bulkDeletePending: boolean
  onToggleSelectAll: () => void
  onBulkDelete: () => void
  onToggleSelectMode: () => void
}

export function FactsSelectBar({
  factCount,
  selectMode,
  selectedCount,
  allSelected,
  bulkDeletePending,
  onToggleSelectAll,
  onBulkDelete,
  onToggleSelectMode,
}: Readonly<FactsSelectBarProps>) {
  const t = useTranslations()

  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: '0 20px 10px' }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 500,
          color: selectMode ? 'var(--fg-1)' : 'var(--fg-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {selectMode
          ? `${selectedCount} ${t('profile.facts.select').toLowerCase()}`
          : `${factCount}`}
      </span>
      <div className="inline-flex items-center" style={{ gap: 8 }}>
        {selectMode && (
          <ChipActionButton onClick={onToggleSelectAll}>
            {allSelected
              ? t('profile.facts.deselectAll')
              : t('profile.facts.selectAll')}
          </ChipActionButton>
        )}
        {selectMode && selectedCount > 0 && (
          <ChipActionButton
            destructive
            disabled={bulkDeletePending}
            onClick={onBulkDelete}
          >
            {t('profile.facts.deleteSelected', { n: selectedCount })}
          </ChipActionButton>
        )}
        <ChipActionButton onClick={onToggleSelectMode}>
          {selectMode ? t('profile.facts.cancel') : t('profile.facts.select')}
        </ChipActionButton>
      </div>
    </div>
  )
}
