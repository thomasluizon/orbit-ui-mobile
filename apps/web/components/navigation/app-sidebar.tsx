'use client'

import type { ComponentType } from 'react'
import { PanelLeft, PanelLeftClose, Plus, type LucideProps } from 'lucide-react'

export interface SidebarNavItem {
  id: string
  label: string
  icon: ComponentType<LucideProps>
  onSelect: () => void
}

interface AppSidebarProps {
  items: readonly SidebarNavItem[]
  activeId: string
  collapsed: boolean
  onToggleCollapsed: () => void
  collapseLabel: string
  expandLabel: string
  onCreate: () => void
  createLabel: string
  brandLabel: string
}

/**
 * Desktop left navigation rail (≥768px). Presentational: the container wires
 * route + `activeView` into `items`/`activeId` and supplies the create handler.
 * Collapses to an icon rail; width snaps (layout is never animated) while labels
 * fade. Active item is a full primary-tinted pill, never a side-stripe.
 */
export function AppSidebar({
  items,
  activeId,
  collapsed,
  onToggleCollapsed,
  collapseLabel,
  expandLabel,
  onCreate,
  createLabel,
  brandLabel,
}: Readonly<AppSidebarProps>) {
  return (
    <aside
      data-sidebar=""
      data-collapsed={collapsed ? '' : undefined}
      aria-label={brandLabel}
      className="sticky top-0 z-30 hidden h-dvh shrink-0 flex-col md:flex"
      style={{
        width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
        paddingTop: 'calc(var(--safe-top) + 14px)',
        paddingBottom: 'calc(var(--safe-bottom) + 14px)',
        boxShadow: 'inset -1px 0 0 var(--hairline)',
      }}
    >
      <div
        className="flex items-center"
        style={{
          height: 56,
          paddingInline: collapsed ? 0 : 18,
          justifyContent: collapsed ? 'center' : 'space-between',
        }}
      >
        {!collapsed && (
          <span
            className="t-display select-none"
            style={{ fontSize: 22, letterSpacing: '-0.01em' }}
          >
            {brandLabel}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? expandLabel : collapseLabel}
          title={collapsed ? expandLabel : collapseLabel}
          className="icon-btn"
        >
          {collapsed ? (
            <PanelLeft size={20} strokeWidth={1.8} color="var(--fg-3)" />
          ) : (
            <PanelLeftClose size={20} strokeWidth={1.8} color="var(--fg-3)" />
          )}
        </button>
      </div>

      <div style={{ paddingInline: collapsed ? 14 : 16, paddingBlock: 10 }}>
        <button
          type="button"
          onClick={onCreate}
          aria-label={createLabel}
          title={collapsed ? createLabel : undefined}
          className="flex w-full items-center justify-center gap-2 font-medium text-[var(--fg-on-primary)] transition-[background-color,transform] duration-[160ms] ease-[var(--ease-standard)] hover:bg-[var(--primary-pressed)] active:scale-[0.96]"
          style={{
            height: 48,
            borderRadius: 999,
            background: 'var(--primary)',
            boxShadow: 'var(--primary-glow)',
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
          }}
        >
          <Plus size={20} strokeWidth={2.2} color="var(--fg-on-primary)" />
          {!collapsed && <span>{createLabel}</span>}
        </button>
      </div>

      <nav
        aria-label={brandLabel}
        className="thin-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto"
        style={{ paddingInline: collapsed ? 14 : 16, paddingBlock: 6 }}
      >
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onSelect}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={
                'flex items-center rounded-[12px] transition-[background-color,color] duration-[160ms] ease-[var(--ease-standard)] ' +
                (isActive
                  ? 'text-[var(--primary-soft)]'
                  : 'text-[var(--fg-3)] hover:text-[var(--fg-1)] hover:bg-[var(--bg-elev)]')
              }
              style={{
                minHeight: 44,
                gap: collapsed ? 0 : 12,
                paddingInline: collapsed ? 0 : 12,
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: isActive ? 'var(--selection-bg)' : undefined,
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                fontWeight: isActive ? 500 : 400,
              }}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.2 : 1.8}
                color={isActive ? 'var(--primary)' : 'currentColor'}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
