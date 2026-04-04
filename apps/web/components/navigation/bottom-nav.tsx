'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MessageCircle, CalendarDays, User, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  name: string
  path: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { name: 'Today', path: '/', icon: Home },
  { name: 'Chat', path: '/chat', icon: MessageCircle },
  // FAB placeholder handled separately
  { name: 'Calendar', path: '/calendar', icon: CalendarDays },
  { name: 'Profile', path: '/profile', icon: User },
]

interface BottomNavProps {
  onCreate?: () => void
}

export function BottomNav({ onCreate }: BottomNavProps) {
  const pathname = usePathname()

  function isActive(path: string) {
    if (!path) return false
    return pathname === path || pathname === path + '/'
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      <div className="nav-glass border-t border-border-muted pb-[var(--safe-bottom)]">
        <div className="flex items-center justify-around h-20 max-w-[var(--app-max-w)] mx-auto px-[var(--app-px)] relative">
          {/* First two nav items */}
          {navItems.slice(0, 2).map((item) => (
            <NavLink key={item.name} item={item} active={isActive(item.path)} />
          ))}

          {/* Central FAB button */}
          <div className="flex flex-col items-center -mt-8">
            <button
              aria-label="Create habit"
              className="bg-primary rounded-full size-14 flex items-center justify-center ring-4 ring-background shadow-[var(--shadow-glow)] hover:shadow-[var(--shadow-glow-lg)] hover:scale-105 active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
              onClick={onCreate}
            >
              <Plus className="size-5 text-white" />
            </button>
          </div>

          {/* Last two nav items */}
          {navItems.slice(2).map((item) => (
            <NavLink key={item.name} item={item} active={isActive(item.path)} />
          ))}
        </div>
      </div>
    </nav>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon

  return (
    <Link
      href={item.path}
      className={`relative flex flex-col items-center gap-1 py-2 min-w-[48px] transition-all duration-150 ${
        active ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      <Icon
        className={`size-[22px] transition-transform duration-150 ${
          active ? 'scale-110' : ''
        }`}
      />
      <span className="text-[10px] font-medium">{item.name}</span>
      {/* Active indicator dot */}
      {active && (
        <span className="absolute -bottom-0.5 w-4 h-0.5 rounded-full bg-primary transition-all duration-200" />
      )}
    </Link>
  )
}
