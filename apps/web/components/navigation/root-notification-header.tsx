'use client'

import type { ComponentProps } from 'react'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { NotificationBell } from './notification-bell'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'

export function DestinationHeaderRow({ children, gap = 8, className = '', ...attributes }: Readonly<Omit<ComponentProps<'div'>, 'style'> & { gap?: number }>) {
  return <div {...attributes} className={`flex min-h-[48px] items-center justify-end px-4 pb-6 ${className}`} style={{ gap, minHeight: TOUCH_TARGET_MIN + SPACING.s24 }}>{children}</div>
}

export function HeaderAppearanceActions() {
  return <div data-header-appearance-actions="" className="flex min-h-12 items-center gap-2 lg:hidden"><ThemeToggle /><NotificationBell /></div>
}

export function RootNotificationHeader() {
  const wide = useIsWideDesktop()
  if (wide) return null
  return <DestinationHeaderRow data-root-notification-header="" className="lg:hidden"><HeaderAppearanceActions /></DestinationHeaderRow>
}
