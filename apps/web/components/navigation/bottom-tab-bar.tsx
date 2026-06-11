'use client'

import { useTranslations } from 'next-intl'
import { Home, MessageCircle, CalendarDays, User, Plus, type LucideIcon } from 'lucide-react'

/** Kit 4-tab bar (Home / Astra / Calendar / You) + centered 60px Plus FAB.
 *  FAB hidden on Astra (has its own composer); rendered disabled off Today. */
export type BottomTab = 'today' | 'chat' | 'calendar' | 'profile'

interface TabDef {
  id: BottomTab
  labelKey: string
  icon: LucideIcon
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
  { id: 'chat', labelKey: 'astra', icon: MessageCircle },
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
          data-tour="tour-fab-button"
          onClick={fabDisabled ? undefined : onFab}
          aria-label={t('create')}
          aria-disabled={fabDisabled}
          disabled={fabDisabled}
          className={
            'absolute appearance-none border-0 flex items-center justify-center -translate-x-1/2 transition-[background-color,transform] duration-[160ms] ease-[var(--ease-standard)] ' +
            (fabDisabled
              ? 'bg-[var(--bg-sheet)] text-[var(--fg-3)]'
              : 'bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)] active:scale-95')
          }
          style={{
            left: '50%',
            top: -30,
            width: 60,
            height: 60,
            borderRadius: 999,
            boxShadow: fabDisabled
              ? '0 0 0 6px var(--bg), inset 0 0 0 1px var(--hairline)'
              : '0 0 0 6px var(--bg), var(--primary-glow)',
            cursor: fabDisabled ? 'not-allowed' : 'pointer',
            zIndex: 2,
          }}
        >
          <Plus size={28} strokeWidth={2.2} color={fabDisabled ? 'var(--fg-3)' : 'var(--fg-on-primary)'} />
        </button>
      )}
      <div
        className="grid"
        style={{ gridTemplateColumns: '1fr 1fr 84px 1fr 1fr' }}
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

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={
        'appearance-none border-0 bg-transparent cursor-pointer flex flex-col items-center transition-colors duration-[160ms] ease-[var(--ease-standard)] ' +
        (active
          ? 'text-[var(--primary)]'
          : 'text-[var(--fg-4)] hover:text-[var(--fg-2)]')
      }
      style={{
        padding: '14px 0 16px',
      }}
    >
      <span className="relative">
        <Icon size={24} strokeWidth={active ? 2.2 : 1.8} color="currentColor" />
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
