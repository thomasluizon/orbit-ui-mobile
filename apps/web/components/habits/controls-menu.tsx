'use client'

import { createPortal } from 'react-dom'
import {
  X,
  CheckCircle,
  Eye,
  Check,
  RefreshCw,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

export interface ControlsMenuProps {
  menuPanelRef: React.RefObject<HTMLDivElement | null>
  position: { top: number; left: number }
  isSelectMode: boolean
  showCompleted: boolean
  isFetching: boolean
  allCollapsed: boolean
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
  onClose: () => void
}

export function ControlsMenu({
  menuPanelRef,
  position,
  isSelectMode,
  showCompleted,
  isFetching,
  allCollapsed,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
  onClose,
}: ControlsMenuProps) {
  const t = useTranslations()

  return createPortal(
    <div
      ref={menuPanelRef}
      role="menu"
      tabIndex={0}
      className="habit-actions-menu fixed z-[70] min-w-[13.75rem] rounded-[var(--radius-lg)] p-1.5"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <button
        className="w-full min-h-10 flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-elevated/60"
        onClick={() => {
          onToggleSelect()
          onClose()
        }}
      >
        {isSelectMode ? (
          <X className="size-4 text-text-muted" />
        ) : (
          <CheckCircle className="size-4 text-text-muted" />
        )}
        {isSelectMode ? t('common.cancel') : t('common.select')}
      </button>
      <button
        className="w-full min-h-10 flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-elevated/60"
        onClick={() => {
          onToggleCollapse()
          onClose()
        }}
      >
        {allCollapsed ? (
          <ChevronsUpDown className="size-4 text-text-muted" />
        ) : (
          <ChevronsDownUp className="size-4 text-text-muted" />
        )}
        {allCollapsed
          ? t('habits.expandAll')
          : t('habits.collapseAll')}
      </button>
      <button
        className="w-full min-h-10 flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-elevated/60"
        disabled={isFetching}
        onClick={() => {
          onRefresh()
          onClose()
        }}
      >
        <RefreshCw className={`size-4 text-text-muted${isFetching ? ' animate-spin' : ''}`} />
        {t('habits.refresh')}
      </button>
      <button
        className="w-full min-h-10 flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-elevated/60"
        onClick={() => {
          onToggleCompleted()
          onClose()
        }}
      >
        {showCompleted ? (
          <Check className="size-4 text-text-muted" />
        ) : (
          <Eye className="size-4 text-text-muted" />
        )}
        {t('habits.showCompleted')}
      </button>
    </div>,
    document.body,
  )
}
