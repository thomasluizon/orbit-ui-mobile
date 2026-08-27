'use client'

import type { ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import { Home, CalendarDays, User, Plus, type IconProps } from '@/components/ui/icons'
import { Fab } from '@/components/ui/fab'
import { AstraMark } from '@/components/ui/astra-avatar'

/** Kit 4-tab bar (Home / Astra / Calendar / You) + centered 60px Plus FAB.
 *  FAB hidden on Astra (has its own composer); rendered disabled off Today. */
export type BottomTab = 'today' | 'chat' | 'calendar' | 'profile'

type IconComponent = ComponentType<IconProps>

interface TabDef {
  id: BottomTab
  labelKey: string
  icon: IconComponent
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
  { id: 'chat', labelKey: 'astra', icon: AstraMark },
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
  const fabVisible = showFab && active === 'today'

  return (
    <div className="relative shrink-0">
      {fabVisible && (
        <div
          data-tour="tour-fab-button"
          className="absolute -translate-x-1/2"
          style={{ left: '50%', top: -30, zIndex: 2 }}
        >
          <Fab label={t('create')} onClick={onFab}>
            <Plus size={28} strokeWidth={2.2} color="var(--fg-on-primary)" />
          </Fab>
        </div>
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
        'appearance-none border-0 bg-transparent cursor-pointer flex flex-col items-center transition-colors duration-[160ms] ease-[var(--ease-standard)] active:opacity-70 ' +
        (active
          ? 'text-[var(--primary)]'
          : 'text-[var(--fg-4)] hover:text-[var(--fg-2)]')
      }
      style={{
        padding: '10px 0 12px',
        gap: 4,
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
              right: -4,
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
          fontFamily: 'var(--font-sans)',
          // react-doctor-disable-next-line no-tiny-text -- the TabBar label is locked at 11px by DESIGN.md:135; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
          fontSize: 11,
          fontWeight: active ? 500 : 400,
        }}
      >
        {label}
      </span>
    </button>
  )
}
