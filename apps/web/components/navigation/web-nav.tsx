'use client'

import { Home, Sparkles, CalendarDays, User, Plus, type LucideIcon } from 'lucide-react'
import { BottomTabBar, type BottomTab } from './bottom-tab-bar'

/** Responsive nav. Renders BottomTabBar on <768px, vertical sidebar on >=768px. */
interface WebNavProps {
  active: BottomTab
  onTab?: (id: BottomTab) => void
  onFab?: () => void
  astraUnread?: boolean
  showFab?: boolean
}

interface SidebarItem {
  id: BottomTab
  label: string
  icon: LucideIcon
  emphasize?: boolean
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'today', label: 'Home', icon: Home },
  { id: 'chat', label: 'Astra', icon: Sparkles, emphasize: true },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'profile', label: 'You', icon: User },
]

export function WebNav(props: Readonly<WebNavProps>) {
  return (
    <>
      <div className="md:hidden">
        <BottomTabBar {...props} />
      </div>
      <div className="hidden md:block">
        <SidebarNav {...props} />
      </div>
    </>
  )
}

function SidebarNav({
  active,
  onTab,
  onFab,
  astraUnread = false,
  showFab = true,
}: Readonly<WebNavProps>) {
  const fabVisible = showFab && active !== 'chat' && active !== 'profile'

  return (
    <aside
      className="flex flex-col shrink-0 h-full"
      style={{
        width: 220,
        background: 'var(--bg)',
        borderRight: '1px solid var(--hairline)',
        padding: '20px 12px',
        gap: 4,
      }}
    >
      {SIDEBAR_ITEMS.map((item) => {
        const isActive = item.id === active
        const Icon = item.icon
        const iconColor = item.emphasize && isActive ? 'var(--primary)' : 'currentColor'
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab?.(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className="appearance-none border-0 cursor-pointer relative flex items-center text-left"
            style={{
              padding: '10px 12px',
              gap: 12,
              borderRadius: 8,
              background: isActive ? 'var(--bg-elev)' : 'transparent',
              color: isActive ? 'var(--fg-1)' : 'var(--fg-3)',
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
            }}
          >
            <span className="relative inline-flex items-center justify-center" style={{ width: 22, height: 22 }}>
              <Icon size={20} strokeWidth={1.5} color={iconColor} />
              {item.id === 'chat' && astraUnread && (
                <span
                  aria-hidden="true"
                  className="absolute rounded-full"
                  style={{
                    top: -2,
                    right: -3,
                    width: 6,
                    height: 6,
                    background: 'var(--primary)',
                    boxShadow: '0 0 0 2px var(--bg)',
                  }}
                />
              )}
            </span>
            <span>{item.label}</span>
          </button>
        )
      })}
      {fabVisible && (
        <button
          type="button"
          onClick={onFab}
          aria-label="Create"
          className="appearance-none border-0 cursor-pointer flex items-center justify-center mt-auto"
          style={{
            height: 44,
            borderRadius: 8,
            background: 'var(--primary)',
            color: 'var(--fg-on-primary)',
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontWeight: 600,
            gap: 8,
          }}
        >
          <Plus size={18} strokeWidth={1.7} color="var(--fg-on-primary)" />
          New
        </button>
      )}
    </aside>
  )
}
