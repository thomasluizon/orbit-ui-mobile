'use client'

import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { NotificationBell } from './notification-bell'

export function RootNotificationHeader({ inset = 16 }: Readonly<{ inset?: number }>) {
  const wide = useIsWideDesktop()
  return wide ? null : <div data-root-notification-header="" className="flex min-h-[48px] items-center justify-end lg:hidden" style={{ paddingInline: inset }}><NotificationBell /></div>
}
