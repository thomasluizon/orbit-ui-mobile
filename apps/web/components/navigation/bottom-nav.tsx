'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MessageCircle, CalendarDays, User, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/stores/ui-store'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  name: string
  path: string
  icon: LucideIcon
  dataTour?: string
}

interface BottomNavProps {
  onCreate?: () => void
}

export function BottomNav({ onCreate }: Readonly<BottomNavProps>) {
  const t = useTranslations()
  const pathname = usePathname()
  const goToTodayDate = useUIStore((s) => s.goToToday)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const navItems: NavItem[] = [
    { name: t('nav.habits'), path: '/', icon: Home },
    { name: t('nav.chat'), path: '/chat', icon: MessageCircle, dataTour: 'tour-chat-nav' },
    // FAB placeholder handled separately
    { name: t('nav.calendar'), path: '/calendar', icon: CalendarDays, dataTour: 'tour-calendar-nav' },
    { name: t('nav.profile'), path: '/profile', icon: User, dataTour: 'tour-profile-nav' },
  ]

  function isActive(path: string) {
    if (!path) return false
    return pathname === path || pathname === path + '/'
  }

  function handleNavClick(item: NavItem, event: React.MouseEvent) {
    if (!isActive(item.path)) {
      setRouteTransitionIntent('tab')
    }

    if (item.path === '/') {
      // Reset date to today and view to 'today' when clicking Home
      goToTodayDate()
      setActiveView('today')
      if (isActive(item.path)) {
        event.preventDefault()
      }
    }
  }

  return (
    <nav data-bottom-nav="" className="fixed bottom-0 left-0 right-0 z-50">
      <div className="nav-glass pb-[var(--safe-bottom)]">
        <div className="flex items-center justify-around h-20 max-w-[var(--app-max-w)] mx-auto px-[var(--app-px)] relative">
          {/* First two nav items */}
          {navItems.slice(0, 2).map((item) => (
            <NavLink
              key={item.name}
              item={item}
              active={isActive(item.path)}
              onClick={(e) => handleNavClick(item, e)}
            />
          ))}

          {/* Central FAB button */}
          <div className="flex flex-col items-center -mt-8">
            <button
              data-tour="tour-fab-button"
              aria-label={t('nav.createHabit')}
              className="touch-target relative flex size-14 items-center justify-center rounded-full bg-primary text-white ring-4 ring-background shadow-[var(--shadow-glow)] transition-[box-shadow,opacity,transform] duration-150 ease-out hover:shadow-[var(--shadow-glow-lg)] active:translate-y-[var(--orbit-elevated-press-y)] active:scale-[var(--orbit-elevated-press-scale)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 motion-reduce:active:translate-y-0 motion-reduce:active:scale-100 disabled:opacity-50"
              disabled={!onCreate}
              onClick={onCreate}
            >
              <Plus className="size-5 text-white" />
            </button>
          </div>

          {/* Last two nav items */}
          {navItems.slice(2).map((item) => (
            <NavLink
              key={item.name}
              item={item}
              active={isActive(item.path)}
              onClick={(e) => handleNavClick(item, e)}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}

function NavLink({
  item,
  active,
  onClick,
}: Readonly<{
  item: NavItem
  active: boolean
  onClick?: (e: React.MouseEvent) => void
}>) {
  const Icon = item.icon

  return (
    <Link
      href={item.path}
      data-tour={item.dataTour}
      aria-current={active ? 'page' : undefined}
      className={`touch-target relative flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-1.5 py-2 transition-[background-color,color,opacity,transform] duration-150 ease-out active:translate-y-[var(--orbit-press-y)] active:scale-[var(--orbit-press-scale)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:active:translate-y-0 motion-reduce:active:scale-100 ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-text-muted hover:bg-primary/5 hover:text-text-primary'
      }`}
      onClick={onClick}
    >
      <Icon
        className={`size-[22px] transition-transform duration-150 motion-reduce:transition-none ${
          active ? 'scale-[1.08] motion-reduce:scale-100' : ''
        }`}
      />
      <span className="text-[10px] font-medium leading-3">{item.name}</span>
      {/* Active indicator dot */}
      {active && (
        <span className="absolute bottom-1 h-0.5 w-4 rounded-full bg-primary transition-[opacity,transform] duration-200" />
      )}
    </Link>
  )
}
