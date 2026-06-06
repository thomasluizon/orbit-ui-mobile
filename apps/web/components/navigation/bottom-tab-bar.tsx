'use client'

import { useTranslations } from 'next-intl'
import { Home, MessageCircle, CalendarDays, User, Plus, type LucideIcon } from 'lucide-react'

/** Mobile-style 4-tab bar (Home / Astra / Calendar / You) + centered Plus FAB.
 *  FAB hidden on Astra (has its own composer); rendered disabled on Profile. */
export type BottomTab = 'today' | 'chat' | 'calendar' | 'profile'

interface TabDef {
  id: BottomTab
  labelKey: string
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
  { id: 'today', labelKey: 'home', icon: Home },
  { id: 'chat', labelKey: 'astra', icon: MessageCircle, emphasize: true },
  { id: 'calendar', labelKey: 'calendar', icon: CalendarDays },
  { id: 'profile', labelKey: 'you', icon: User },
]

export function BottomTabBar({
  active,
  onTab,
  onFab,
  astraUnread = false,
  showFab = true,
  tabs = DEFAULT_TABS,
}: Readonly<BottomTabBarProps>) {
  const t = useTranslations('nav')
  const fabVisible = showFab && active !== 'chat'
  const fabDisabled = active !== 'today'

  return (
    <div className="relative shrink-0">
      {fabVisible && (
        <button
          type="button"
          onClick={fabDisabled ? undefined : onFab}
          aria-label={t('create')}
          aria-disabled={fabDisabled}
          disabled={fabDisabled}
          className={
            'absolute appearance-none border-0 flex items-center justify-center -translate-x-1/2 transition-[background-color,opacity,transform] duration-200 ease-out ' +
            (fabDisabled
              ? 'bg-[var(--bg-elev)] text-[var(--fg-3)]'
              : 'bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)] hover:scale-110 active:scale-95')
          }
          style={{
            left: '50%',
            top: -14,
            width: 56,
            height: 56,
            borderRadius: 999,
            boxShadow: fabDisabled
              ? '0 0 0 5px var(--bg), inset 0 0 0 1px var(--hairline)'
              : '0 0 0 5px var(--bg), 0 4px 14px rgba(0,0,0,0.35)',
            cursor: fabDisabled ? 'not-allowed' : 'pointer',
            zIndex: 2,
          }}
        >
          <Plus size={24} strokeWidth={1.7} color={fabDisabled ? 'var(--fg-3)' : 'var(--fg-on-primary)'} />
        </button>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: '1fr 1fr 80px 1fr 1fr',
          padding: '14px 0 16px',
        }}
      >
        {tabs.slice(0, 2).map((tab) => (
          <TabBtn
            key={tab.id}
            tab={tab}
            label={t(tab.labelKey)}
            active={active === tab.id}
            onClick={() => onTab?.(tab.id)}
            unread={tab.id === 'chat' && astraUnread}
          />
        ))}
        <div aria-hidden="true" />
        {tabs.slice(2, 4).map((tab) => (
          <TabBtn
            key={tab.id}
            tab={tab}
            label={t(tab.labelKey)}
            active={active === tab.id}
            onClick={() => onTab?.(tab.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface TabBtnProps {
  tab: TabDef
  label: string
  active: boolean
  onClick?: () => void
  unread?: boolean
}

function TabBtn({ tab, label, active, onClick, unread = false }: Readonly<TabBtnProps>) {
  const Icon = tab.icon
  const iconColor = tab.emphasize && active ? 'var(--primary)' : 'currentColor'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={
        'relative appearance-none border-0 bg-transparent cursor-pointer flex flex-col items-center transition-colors duration-150 ease-out ' +
        (active
          ? 'text-[var(--fg-1)]'
          : 'text-[var(--fg-3)] hover:text-[var(--fg-1)]')
      }
      style={{
        padding: '8px 0',
      }}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            top: -2,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 16,
            height: 2,
            background: 'var(--primary)',
            borderRadius: 1,
          }}
        />
      )}
      <span className="relative">
        <Icon size={24} strokeWidth={1.6} color={iconColor} />
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
    </button>
  )
}
