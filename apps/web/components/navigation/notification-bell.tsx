'use client'

import { SPACING } from '@orbit/shared/theme'


import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Bell } from '@/components/ui/icons'
import { IconButton } from '@/components/ui/icon-button'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { plural } from '@/lib/plural'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'

type CountPlacement = 'inline' | 'corner'

function NotificationBellCount({ count, corner }: Readonly<{ count: number; corner: boolean }>) {
  if (count <= 0) return null
  return <span aria-hidden="true" data-notification-count=""
    className={`pointer-events-none min-h-[20px] min-w-[20px] shrink-0 bg-[var(--fg-1)] text-center font-mono text-xs tabular-nums text-[var(--bg)] ${corner ? 'absolute right-0 top-0' : ''}`}
    style={{ borderRadius: 8, paddingInline: SPACING.s4, lineHeight: corner ? '1.667em' : 20 / 12, boxShadow: corner ? '0 0 0 3px var(--bg)' : undefined }}>
    {count > 9 ? '9+' : count}
  </span>
}

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
  const layout = corner ? 'grid w-[48px] place-items-center rounded-[12px] text-[var(--fg-3)]' : 'inline-flex rounded-full text-[var(--fg-2)] min-w-[48px] items-center justify-center gap-[4px] px-2 py-1'
  const content = <>
      <Bell size={corner ? 20 : 24} strokeWidth={corner ? 2 : 1.8} aria-hidden="true" />
      <NotificationBellCount count={count} corner={corner || Boolean(onClick)} />
  </>
  if (onClick) return <IconButton label={label} onClick={onClick}><span className="contents">{content}</span></IconButton>
  return <span role="img" aria-label={label}
      className={`relative min-h-[48px] shrink-0 ${layout}`}>{content}</span>
}
