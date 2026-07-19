'use client'

import {
  X,
  CheckCircle,
  Eye,
  Check,
  RefreshCw,
  ChevronsDownUp,
  ChevronsUpDown,
  MoreHorizontal,
} from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { Popover } from '@/components/ui/popover'

export interface ControlsMenuProps {
  isSelectMode: boolean
  showCompleted: boolean
  isFetching: boolean
  allCollapsed: boolean
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
}

/** List-controls menu anchored on the utility-row trigger. Built on Popover so it
 *  inherits focus-in, roving Arrow/Home/End, focus restore, and stack-gated ESC. */
export function ControlsMenu({
  isSelectMode,
  showCompleted,
  isFetching,
  allCollapsed,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
}: Readonly<ControlsMenuProps>) {
  const t = useTranslations()

  return (
    <Popover
      placement="bottom-end"
      className="min-w-[220px]"
      role="menu"
      trigger={
        <button
          type="button"
          aria-label={t('habits.actions.more')}
          className="icon-btn shrink-0"
          style={{ width: 36, height: 36 }}
        >
          <MoreHorizontal size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
      }
    >
      {(close) => (
        <>
          <MenuRow
            icon={isSelectMode ? <X size={16} strokeWidth={1.8} /> : <CheckCircle size={16} strokeWidth={1.8} />}
            label={isSelectMode ? t('common.cancel') : t('common.select')}
            onClick={() => {
              onToggleSelect()
              close()
            }}
          />
          <MenuRow
            icon={allCollapsed ? <ChevronsUpDown size={16} strokeWidth={1.8} /> : <ChevronsDownUp size={16} strokeWidth={1.8} />}
            label={allCollapsed ? t('habits.expandAll') : t('habits.collapseAll')}
            onClick={() => {
              onToggleCollapse()
              close()
            }}
          />
          <MenuRow
            icon={<RefreshCw size={16} strokeWidth={1.8} className={isFetching ? 'animate-spin' : ''} />}
            label={t('habits.refresh')}
            disabled={isFetching}
            onClick={() => {
              onRefresh()
              close()
            }}
          />
          <MenuRow
            icon={showCompleted ? <Check size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
            label={t('habits.showCompleted')}
            onClick={() => {
              onToggleCompleted()
              close()
            }}
          />
        </>
      )}
    </Popover>
  )
}

const MENU_ROW_STYLE = {
  padding: '10px 12px',
  gap: 12,
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--fg-1)',
  textAlign: 'left',
  borderRadius: 8,
} as const

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
      style={MENU_ROW_STYLE}
    >
      <span className="shrink-0 inline-flex" style={{ color: 'var(--fg-2)' }}>
        {icon}
      </span>
      {label}
    </button>
  )
}
