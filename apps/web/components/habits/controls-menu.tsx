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

/** Anchored list-controls menu on the kit sheet panel chrome. */
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
      className="fixed z-[70]"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        minWidth: 220,
        background: 'var(--bg-sheet)',
        boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline)',
        borderRadius: 16,
        padding: 4,
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <MenuRow
        icon={isSelectMode ? <X size={14} /> : <CheckCircle size={14} />}
        label={isSelectMode ? t('common.cancel') : t('common.select')}
        onClick={() => {
          onToggleSelect()
          onClose()
        }}
      />
      <MenuRow
        icon={allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
        label={allCollapsed ? t('habits.expandAll') : t('habits.collapseAll')}
        onClick={() => {
          onToggleCollapse()
          onClose()
        }}
      />
      <MenuRow
        icon={<RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />}
        label={t('habits.refresh')}
        disabled={isFetching}
        onClick={() => {
          onRefresh()
          onClose()
        }}
      />
      <MenuRow
        icon={showCompleted ? <Check size={14} /> : <Eye size={14} />}
        label={t('habits.showCompleted')}
        onClick={() => {
          onToggleCompleted()
          onClose()
        }}
      />
    </div>,
    document.body,
  )
}

interface MenuRowProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}

function MenuRow({
  icon,
  label,
  onClick,
  disabled = false,
}: Readonly<MenuRowProps>) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="w-full appearance-none border-0 bg-transparent cursor-pointer flex items-center transition-colors hover:bg-[var(--bg-sunk)] disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      style={{
        padding: '10px 12px',
        gap: 12,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--fg-1)',
        textAlign: 'left',
        borderRadius: 8,
      }}
    >
      <span className="shrink-0 inline-flex" style={{ color: 'var(--fg-2)' }}>
        {icon}
      </span>
      {label}
    </button>
  )
}
