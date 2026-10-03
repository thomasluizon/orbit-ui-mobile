'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Bell } from '@/components/ui/icons'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { plural } from '@/lib/plural'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'

export function NotificationBell() {
  const router = useRouter()
  const pathname = usePathname()
  const { visibleUnreadCount: count } = useNotificationInbox()
  return <NotificationBellDisplay count={count} onClick={pathname === '/notifications' ? undefined : () => requestHabitCreateNavigation(() => {
    setRouteTransitionIntent('forward')
    router.push('/notifications')
  })} />
}

export function NotificationBellDisplay({ count, onClick }: { count: number; onClick?: () => void }) {
  const t = useTranslations()
  const label = count > 0 ? plural(t('notifications.bellWithCount', { count }), count) : t('notifications.bell')
  const content = <>
      <Bell size={24} strokeWidth={1.8} aria-hidden="true" />
      {count > 0 ? <span aria-hidden="true" data-notification-count=""
        className="absolute right-0 top-0 min-h-[20px] min-w-[20px] bg-[var(--fg-1)] text-center font-mono text-xs text-[var(--bg)]"
        style={{ borderRadius: 8, paddingInline: 4, lineHeight: '1.667em', boxShadow: '0 0 0 3px var(--bg)' }}>
        {count > 9 ? '9+' : count}
      </span> : null}
  </>
  return onClick ? <button type="button" aria-label={label}
    style={{ transition: 'background-color var(--dur-hover-control) var(--ease-standard)' }}
    className="relative grid min-h-[48px] w-[48px] shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[var(--bg-field)] text-[var(--fg-2)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
    onClick={onClick}>{content}</button>
    : <span role="img" aria-label={label}
      className="relative grid min-h-[48px] w-[48px] shrink-0 place-items-center text-[var(--fg-2)]">{content}</span>
}
