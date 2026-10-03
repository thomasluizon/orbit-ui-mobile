'use client'

import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import type { ComponentProps } from 'react'
import { NotificationBell } from './notification-bell'

export function DestinationHeaderRow({ children, gap = 8, className = '', ...attributes }: Readonly<Omit<ComponentProps<'div'>, 'style'> & { gap?: number }>) {
  return <div {...attributes} className={`flex min-h-[48px] items-center justify-end px-[16px] ${className}`} style={{ gap }}>{children}</div>
}

export function RootNotificationHeader() {
  const wide = useIsWideDesktop()
  return wide ? null : <DestinationHeaderRow data-root-notification-header="" className="lg:hidden"><NotificationBell /></DestinationHeaderRow>
}
