'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Bell } from '@/components/ui/icons'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { plural } from '@/lib/plural'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'

export function NotificationBell() {
  const router = useRouter()
  const pathname = usePathname()
  const { visibleUnreadCount: count } = useNotificationInbox()
  return <NotificationBellDisplay count={count} onClick={pathname === '/notifications' ? undefined : () => {
    setRouteTransitionIntent('forward')
    router.push('/notifications')
  }} />
}

export function NotificationBellDisplay({ count, onClick }: { count: number; onClick?: () => void }) {
  const t = useTranslations()
  const label = count > 0 ? plural(t('notifications.bellWithCount', { count }), count) : t('notifications.bell')
  const content = <>
      <Bell size={24} strokeWidth={1.8} aria-hidden="true" />
      {count > 0 ? <span aria-hidden="true" data-notification-count=""
        className="absolute right-0 top-0 h-5 min-w-5 rounded-full bg-[var(--fg-1)] text-center font-mono text-xs text-[var(--bg)]"
        style={{ paddingInline: 6, lineHeight: '20px', boxShadow: '0 0 0 3px var(--bg)' }}>
        {count > 9 ? '9+' : count}
      </span> : null}
  </>
  return onClick ? <button type="button" data-tour="tour-notification-bell" aria-label={label}
    style={{ transition: 'background-color var(--dur-hover-control) var(--ease-standard)' }}
    className="relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[var(--fg-2)] hover:bg-[var(--bg-hover)]"
    onClick={onClick}>{content}</button>
    : <span role="img" aria-label={label}
      className="relative grid size-11 shrink-0 place-items-center text-[var(--fg-2)]">{content}</span>
}
