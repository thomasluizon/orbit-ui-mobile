'use client'

import { useId, type ComponentType } from 'react'
import {
  ChevronRight,
  PanelLeft,
  PanelLeftClose,
  Plus,
  type LucideProps,
} from 'lucide-react'

export interface SidebarNavItem {
  id: string
  label: string
  icon: ComponentType<LucideProps>
  onSelect: () => void
}

export interface SidebarLeaf {
  id: string
  label: string
  active: boolean
  onSelect: () => void
}

export interface SidebarSection {
  id: string
  label: string
  icon: ComponentType<LucideProps>
  active: boolean
  onSelect: () => void
  /** Present only for the expandable Hábitos parent; absent makes the row a leaf. */
  children?: readonly SidebarLeaf[]
  expanded?: boolean
}

interface AppSidebarProps {
  sections: readonly SidebarSection[]
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
 * route + `activeView` into `sections` (each a leaf or the expandable Hábitos
 * parent with leaf children) and supplies the create handler. Collapses to an
 * icon rail; width snaps (layout is never animated) while labels fade. Active
 * rows are a full primary-tinted pill, never a side-stripe. The outer column
 * stretches to the full content height so its right seam runs the entire page,
 * while an inner `sticky` viewport-tall wrapper keeps the nav pinned in view.
 */
export function AppSidebar({
  sections,
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
      className="z-30 hidden shrink-0 self-stretch md:block"
      style={{
        width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
        boxShadow: 'inset -1px 0 0 var(--hairline)',
      }}
    >
      <div
        className="sticky top-0 flex max-h-dvh flex-col"
        style={{
          height: '100dvh',
          paddingTop: 'calc(var(--safe-top) + 14px)',
          paddingBottom: 'calc(var(--safe-bottom) + 14px)',
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
            className="select-none"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--fg-1)',
            }}
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
            paddingInline: collapsed ? 0 : 14,
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
        {sections.map((section) => (
          <SidebarSectionRow key={section.id} section={section} collapsed={collapsed} />
        ))}
      </nav>
      </div>
    </aside>
  )
}

function SidebarSectionRow({
  section,
  collapsed,
}: Readonly<{ section: SidebarSection; collapsed: boolean }>) {
  const Icon = section.icon
  const hasChildren = !!section.children && section.children.length > 0
  const expanded = hasChildren && !collapsed && !!section.expanded
  const subListId = useId()
  const childrenOwnActiveHighlight = hasChildren && !collapsed
  const parentActive = childrenOwnActiveHighlight ? false : section.active

  return (
    <div className="flex flex-col" style={{ gap: 2 }}>
      <button
        type="button"
        onClick={section.onSelect}
        aria-current={parentActive ? 'page' : undefined}
        aria-expanded={hasChildren && !collapsed ? expanded : undefined}
        aria-controls={hasChildren && !collapsed ? subListId : undefined}
        title={collapsed ? section.label : undefined}
        className={
          'flex items-center rounded-[12px] transition-[background-color,color] duration-[160ms] ease-[var(--ease-standard)] ' +
          (parentActive
            ? 'text-[var(--primary)]'
            : 'text-[var(--fg-3)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]')
        }
        style={{
          minHeight: 44,
          gap: collapsed ? 0 : 12,
          paddingInline: collapsed ? 0 : 12,
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: parentActive ? 'var(--selection-bg)' : undefined,
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          fontWeight: parentActive ? 500 : 400,
        }}
      >
        <Icon
          size={22}
          strokeWidth={parentActive ? 2.2 : 1.8}
          color={parentActive ? 'var(--primary)' : 'currentColor'}
        />
        {!collapsed && <span className="flex-1 truncate text-left">{section.label}</span>}
        {!collapsed && hasChildren && (
          <ChevronRight
            size={16}
            strokeWidth={1.8}
            color="var(--fg-4)"
            className="shrink-0 transition-transform duration-[160ms] ease-[var(--ease-standard)]"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            aria-hidden
          />
        )}
      </button>

      {hasChildren && !collapsed && expanded && (
        <ul id={subListId} className="flex flex-col" style={{ gap: 2, paddingTop: 2 }}>
          {section.children!.map((child) => (
            <li key={child.id} style={{ paddingLeft: 34 }}>
              <button
                type="button"
                onClick={child.onSelect}
                aria-current={child.active ? 'page' : undefined}
                className={
                  'flex w-full items-center rounded-[10px] transition-[background-color,color] duration-[160ms] ease-[var(--ease-standard)] ' +
                  (child.active
                    ? 'text-[var(--primary)]'
                    : 'text-[var(--fg-3)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]')
                }
                style={{
                  minHeight: 40,
                  paddingInline: 12,
                  background: child.active ? 'var(--selection-bg)' : undefined,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  fontWeight: child.active ? 500 : 400,
                }}
              >
                <span className="truncate text-left">{child.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
