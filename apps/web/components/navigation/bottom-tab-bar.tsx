'use client'

import type { ComponentType } from 'react'
import {
  CalendarDays,
  ChartLine,
  Home,
  User,
  type IconProps,
} from '@/components/ui/icons'

export type BottomTab = 'hoje' | 'calendario' | 'progresso' | 'perfil'

interface BottomTabDefinition {
  id: BottomTab
  label: string
  icon: ComponentType<IconProps>
}

interface BottomTabBarProps {
  active: BottomTab | null
  labels: Record<BottomTab, string>
  navLabel: string
  onTab: (id: BottomTab) => void
}

export function BottomTabBar({
  active,
  labels,
  navLabel,
  onTab,
}: Readonly<BottomTabBarProps>) {
  const tabs: readonly BottomTabDefinition[] = [
    { id: 'hoje', label: labels.hoje, icon: Home },
    { id: 'calendario', label: labels.calendario, icon: CalendarDays },
    { id: 'progresso', label: labels.progresso, icon: ChartLine },
    { id: 'perfil', label: labels.perfil, icon: User },
  ]

  return (
    <nav aria-label={navLabel} className="grid h-14 grid-cols-4 bg-[var(--bg)]">
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          active={active === tab.id}
          onClick={() => onTab(tab.id)}
        />
      ))}
    </nav>
  )
}

function TabButton({
  tab,
  active,
  onClick,
}: Readonly<{
  tab: BottomTabDefinition
  active: boolean
  onClick: () => void
}>) {
  const Icon = tab.icon

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={tab.label}
      aria-current={active ? 'page' : undefined}
      className="flex h-11 min-w-0 flex-col items-center justify-center gap-1 self-center bg-transparent transition-[background-color,color,transform] duration-150 hover:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]"
    >
      <Icon
        size={24}
        strokeWidth={active ? 2 : 1.5}
        color={active ? 'var(--primary)' : 'var(--fg-4)'}
        aria-hidden="true"
      />
      <span
        className="max-w-full truncate text-[12px] font-medium"
        style={{ color: active ? 'var(--primary-soft)' : 'var(--fg-3)' }}
      >
        {tab.label}
      </span>
    </button>
  )
}
