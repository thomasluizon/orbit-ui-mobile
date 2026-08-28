'use client'

import { useRef, useState } from 'react'
import { MoreHorizontal } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { Menu } from '@/components/ui/menu'

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
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const items = [
    { id: 'select', label: isSelectMode ? t('common.cancel') : t('common.select') },
    { id: 'collapse', label: allCollapsed ? t('habits.expandAll') : t('habits.collapseAll') },
    { id: 'refresh', label: t('habits.refresh'), disabled: isFetching },
    {
      id: 'completed',
      label: showCompleted ? t('habits.hideCompleted') : t('habits.showCompleted'),
    },
  ]

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={t('habits.actions.more')}
        aria-expanded={open}
        className="icon-btn shrink-0"
        style={{ width: 36, height: 36 }}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
      </button>
      <Menu
        open={open}
        anchorRef={anchorRef}
        title={t('habits.actions.more')}
        items={items}
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          if (id === 'select') onToggleSelect()
          else if (id === 'collapse') onToggleCollapse()
          else if (id === 'refresh') onRefresh()
          else if (id === 'completed') onToggleCompleted()
        }}
      />
    </>
  )
}
