'use client'

import type { ReactNode } from 'react'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { Shell412 } from './shell-412'
import { ShellWide } from './shell-wide'

interface FlowShellProps {
  action?: ReactNode
  children: ReactNode
  notice?: ReactNode
}

export function FlowShell({ action, children, notice }: Readonly<FlowShellProps>) {
  const wide = useIsWideDesktop()

  if (wide) {
    return (
      <ShellWide nav={false} action={action} notice={notice}>
        {children}
      </ShellWide>
    )
  }

  return (
    <Shell412 nav={false} action={action} notice={notice}>
      {children}
    </Shell412>
  )
}
