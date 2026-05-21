'use client'

import { Home, Sparkles, CalendarDays, User, Plus, type LucideIcon } from 'lucide-react'

/** Mobile-style 4-tab bar (Home / Astra / Calendar / You) + centered Plus FAB with U-notch.
 *  FAB hidden on Astra and Profile tabs. */
export type BottomTab = 'today' | 'chat' | 'calendar' | 'profile'

interface TabDef {
  id: BottomTab
  label: string
  icon: LucideIcon
  emphasize?: boolean
}

interface BottomTabBarProps {
  active: BottomTab
  onTab?: (id: BottomTab) => void
  onFab?: () => void
  astraUnread?: boolean
  showFab?: boolean
  tabs?: TabDef[]
}

const DEFAULT_TABS: TabDef[] = [
  { id: 'today', label: 'Home', icon: Home },
  { id: 'chat', label: 'Astra', icon: Sparkles, emphasize: true },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'profile', label: 'You', icon: User },
]

export function BottomTabBar({
  active,
  onTab,
  onFab,
  astraUnread = false,
  showFab = true,
  tabs = DEFAULT_TABS,
}: Readonly<BottomTabBarProps>) {
  const fabVisible = showFab && active !== 'chat' && active !== 'profile'

  return (
    <div
      className="relative shrink-0"
      style={{
        background: 'var(--bg)',
        borderTop: '1px solid var(--hairline)',
      }}
    >
      {fabVisible && (
        <button
          type="button"
          onClick={onFab}
          aria-label="Create"
          className="absolute appearance-none border-0 cursor-pointer flex items-center justify-center"
          style={{
            left: '50%',
            top: -28,
            transform: 'translateX(-50%)',
            width: 56,
            height: 56,
            borderRadius: 999,
            background: 'var(--primary)',
            color: 'var(--fg-on-primary)',
            boxShadow:
              '0 0 0 5px var(--bg), 0 4px 14px rgba(0,0,0,0.35)',
            zIndex: 2,
          }}
        >
          <Plus size={24} strokeWidth={1.7} color="var(--fg-on-primary)" />
        </button>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: '1fr 1fr 80px 1fr 1fr',
          padding: '8px 0 10px',
        }}
      >
        {tabs.slice(0, 2).map((t) => (
          <TabBtn
            key={t.id}
            tab={t}
            active={active === t.id}
            onClick={() => onTab?.(t.id)}
            unread={t.id === 'chat' && astraUnread}
          />
        ))}
        <div aria-hidden="true" />
        {tabs.slice(2, 4).map((t) => (
          <TabBtn
            key={t.id}
            tab={t}
            active={active === t.id}
            onClick={() => onTab?.(t.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface TabBtnProps {
  tab: TabDef
  active: boolean
  onClick?: () => void
  unread?: boolean
}

function TabBtn({ tab, active, onClick, unread = false }: Readonly<TabBtnProps>) {
  const Icon = tab.icon
  const iconColor = tab.emphasize && active ? 'var(--primary)' : 'currentColor'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="relative appearance-none border-0 bg-transparent cursor-pointer flex flex-col items-center"
      style={{
        padding: '4px 0 0',
        gap: 5,
        color: active ? 'var(--fg-1)' : 'var(--fg-3)',
      }}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            top: -1,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 14,
            height: 2,
            background: 'var(--primary)',
            borderRadius: 1,
          }}
        />
      )}
      <span className="relative">
        <Icon size={22} strokeWidth={1.5} color={iconColor} />
        {unread && (
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
      <span
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 11,
          fontWeight: active ? 500 : 400,
          letterSpacing: '0.01em',
        }}
      >
        {tab.label}
      </span>
    </button>
  )
}
