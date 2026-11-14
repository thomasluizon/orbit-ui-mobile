'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { SMALL_PILL_VISIBLE_MIN, SPACING, motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Bell } from '@/components/ui/icons'
import { IconButton } from '@/components/ui/icon-button'
import { useFlag } from '@/hooks/use-flag'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { plural } from '@/lib/plural'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'

type CountPlacement = 'inline' | 'corner'

const COUNT_ROLL = { duration: motionDurations.slow / 1000, ease: [...motionEasings.standard] as [number, number, number, number] }

/** How the count shows a change: `roll` rolls the new figure in once, `still` swaps it under reduced motion, and null is the surface with the guided flows off. */
type CountMotion = 'roll' | 'still' | null

/** True from the first change of the count, so the count the bell opens with never rolls. */
function useCountChanged(count: number): boolean {
  const [first] = useState(count)
  const [changed, setChanged] = useState(false)
  if (!changed && count !== first) setChanged(true)
  return changed
}

function NotificationBellCount({ count, corner, countMotion }: Readonly<{ count: number; corner: boolean; countMotion: CountMotion }>) {
  if (count <= 0) return null
  const shown = count > 9 ? '9+' : count
  return <span aria-hidden="true" data-notification-count="" data-count-motion={countMotion ?? undefined}
    className={`pointer-events-none min-h-[20px] min-w-[20px] shrink-0 bg-[var(--fg-1)] text-center font-mono text-[12px] tabular-nums text-[var(--bg)] ${countMotion === 'roll' ? 'overflow-hidden' : ''} ${corner ? 'absolute right-0 top-0' : ''}`}
    style={{ borderRadius: 8, paddingInline: SPACING.s4, lineHeight: '20px', boxShadow: corner ? '0 0 0 3px var(--bg)' : undefined }}>
    {countMotion === 'roll'
      ? <motion.span key={shown} data-count-roll="" className="block" initial={{ y: motionLayerTiming.routeShift, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={COUNT_ROLL}>{shown}</motion.span>
      : shown}
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
  const guided = useFlag('orbit_guided_flows')
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const changed = useCountChanged(count)
  const countMotion: CountMotion = guided && changed ? (reducedMotion ? 'still' : 'roll') : null
  const label = count > 0 ? plural(t('notifications.bellWithCount', { count }), count) : t('notifications.bell')
  const corner = countPlacement === 'corner'
  const layout = corner ? 'inline-flex items-center justify-center rounded-full font-medium text-[var(--fg-3)]' : 'min-h-[48px] inline-flex rounded-full text-[var(--fg-2)] min-w-[48px] items-center justify-center gap-[4px] px-2 py-1'
  const content = <>
      <Bell size={corner ? 20 : 24} strokeWidth={corner ? 2 : 1.8} aria-hidden="true" />
      <NotificationBellCount count={count} corner={corner || Boolean(onClick)} countMotion={countMotion} />
  </>
  if (onClick) return <IconButton label={label} onClick={onClick}><span className="contents">{content}</span></IconButton>
  return <span role="img" aria-label={label}
      className={`relative shrink-0 ${layout}`} style={corner ? { width: SMALL_PILL_VISIBLE_MIN, height: SMALL_PILL_VISIBLE_MIN } : undefined}>{content}</span>
}
