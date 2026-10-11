'use client'

import type { ComponentProps } from 'react'
import { NotificationBell } from './notification-bell'

export function DestinationHeaderRow({ children, gap = 8, className = '', ...attributes }: Readonly<Omit<ComponentProps<'div'>, 'style'> & { gap?: number }>) {
  return <div {...attributes} className={`flex min-h-[48px] items-center justify-end px-[16px] ${className}`} style={{ gap }}>{children}</div>
}

export function RootNotificationHeader() {
  return <DestinationHeaderRow data-root-notification-header="" className="lg:hidden"><NotificationBell /></DestinationHeaderRow>
}
