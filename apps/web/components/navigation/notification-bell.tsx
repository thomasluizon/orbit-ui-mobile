'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Bell } from '@/components/ui/icons'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { plural } from '@/lib/plural'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'

type CountPlacement = 'inline' | 'corner'

export function NotificationBell({ countPlacement = 'inline' }: { countPlacement?: CountPlacement }) {
  const router = useRouter()
  const pathname = usePathname()
  const { visibleUnreadCount: count } = useNotificationInbox()
  return <NotificationBellDisplay countPlacement={countPlacement} count={count} onClick={pathname === '/notifications' ? undefined : () => requestHabitCreateNavigation(() => {
    setRouteTransitionIntent('forward')
    router.push('/notifications')
  })} />
}

export function NotificationBellDisplay({ count, onClick, countPlacement = 'inline' }: { count: number; onClick?: () => void; countPlacement?: CountPlacement }) {
  const t = useTranslations()
  const label = count > 0 ? plural(t('notifications.bellWithCount', { count }), count) : t('notifications.bell')
  const corner = countPlacement === 'corner'
  const layout = corner ? 'grid w-[48px] place-items-center' : 'inline-flex min-w-[48px] items-center justify-center gap-[4px] px-[8px] py-[4px]'
  const content = <>
      <Bell size={24} strokeWidth={1.8} aria-hidden="true" />
      {count > 0 ? <span aria-hidden="true" data-notification-count=""
        className={`pointer-events-none min-h-[20px] min-w-[20px] shrink-0 bg-[var(--fg-1)] text-center font-mono text-xs tabular-nums text-[var(--bg)] ${corner ? 'absolute right-0 top-0' : ''}`}
        style={{ borderRadius: 8, paddingInline: 4, lineHeight: '1.667em', boxShadow: corner ? '0 0 0 3px var(--bg)' : undefined }}>
        {count > 9 ? '9+' : count}
      </span> : null}
  </>
  return onClick ? <button type="button" aria-label={label}
    style={{ transition: 'background-color var(--dur-hover-control) var(--ease-standard)' }}
    className={`relative min-h-[48px] shrink-0 cursor-pointer rounded-full border-0 bg-transparent text-[var(--fg-2)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] ${layout}`}
    onClick={onClick}>{content}</button>
    : <span role="img" aria-label={label}
      className={`relative min-h-[48px] shrink-0 text-[var(--fg-2)] ${layout}`}>{content}</span>
}
