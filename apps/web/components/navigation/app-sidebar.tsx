'use client'

import { useId, type ComponentType } from 'react'
import {
  ChevronRight,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Settings,
  type LucideProps,
} from '@/components/ui/icons'
import { AppLogo } from '@/components/ui/app-logo'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { resolveSidebarSectionRowPresentation } from '@/components/navigation/app-sidebar-presentation'

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

/** The grounded account chip at the sidebar's foot: who is signed in + their plan,
 *  and the entry point to the profile/settings surface. */
export interface SidebarAccount {
  name: string
  planLabel: string
  onOpen: () => void
  ariaLabel: string
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
  /** Accessible name for the <nav> landmark, distinct from the aside's brand label. */
  navLabel: string
  /** Absent until the profile has loaded. */
  account?: SidebarAccount
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
  navLabel,
  account,
}: Readonly<AppSidebarProps>) {
  return (
    <aside
      data-sidebar=""
      data-collapsed={collapsed ? '' : undefined}
      aria-label={brandLabel}
      className="z-30 hidden shrink-0 self-stretch md:block"
      style={{
        width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
      }}
    >
      <div
        className="sticky top-0 flex max-h-dvh flex-col"
        style={{
          height: '100dvh',
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
          <span className="flex select-none items-center" style={{ gap: 8 }}>
            <AppLogo size={26} />
            <span
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

      <nav
        aria-label={navLabel}
        className="thin-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto"
        style={{ paddingInline: collapsed ? 14 : 16, paddingTop: 12, paddingBottom: 6 }}
      >
        {sections.map((section) => (
          <SidebarSectionRow key={section.id} section={section} collapsed={collapsed} />
        ))}
      </nav>

      <div
        className="flex flex-col"
        style={{
          paddingInline: collapsed ? 13 : 16,
          paddingTop: 12,
          paddingBottom: 4,
          gap: 10,
        }}
      >
        <div className="flex" style={{ justifyContent: 'center' }}>
          {collapsed ? (
            <PillButton
              variant="primary"
              size="xs"
              onClick={onCreate}
              ariaLabel={createLabel}
              title={createLabel}
              leading={<Plus size={20} strokeWidth={2.2} />}
            />
          ) : (
            <PillButton
              variant="primary"
              size="xs"
              onClick={onCreate}
              leading={<Plus size={18} strokeWidth={2.2} />}
            >
              {createLabel}
            </PillButton>
          )}
        </div>
        {account &&
          (collapsed ? (
            <button
              type="button"
              onClick={account.onOpen}
              aria-label={account.ariaLabel}
              className="flex justify-center rounded-full transition-[transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.96]"
            >
              <UserAvatar name={account.name} size={34} />
            </button>
          ) : (
            <button
              type="button"
              onClick={account.onOpen}
              aria-label={account.ariaLabel}
              className="flex w-full items-center rounded-[14px] transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)]"
              style={{ gap: 10, padding: 8, boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
            >
              <UserAvatar name={account.name} size={34} />
              <span className="flex min-w-0 flex-1 flex-col items-start" style={{ gap: 1 }}>
                <span
                  className="w-full truncate text-left"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}
                >
                  {account.name}
                </span>
                <span
                  className="w-full truncate text-left"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-3)' }}
                >
                  {account.planLabel}
                </span>
              </span>
              <Settings size={18} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
            </button>
          ))}
      </div>
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
  const {
    className: sectionButtonClassName,
    style: sectionButtonStyle,
    iconStrokeWidth,
    iconColor,
  } = resolveSidebarSectionRowPresentation({ collapsed, parentActive })

  return (
    <div className="flex flex-col" style={{ gap: 2 }}>
      <button
        type="button"
        onClick={section.onSelect}
        aria-current={parentActive ? 'page' : undefined}
        aria-expanded={hasChildren && !collapsed ? expanded : undefined}
        aria-controls={hasChildren && !collapsed ? subListId : undefined}
        title={collapsed ? section.label : undefined}
        data-tooltip={collapsed ? section.label : undefined}
        data-testid={`nav-section-${section.id}`}
        className={sectionButtonClassName}
        style={sectionButtonStyle}
      >
        <Icon size={22} strokeWidth={iconStrokeWidth} color={iconColor} />
        {!collapsed && (
          <span className="sidebar-label-fade flex-1 truncate text-left">{section.label}</span>
        )}
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
                  minHeight: 44,
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
