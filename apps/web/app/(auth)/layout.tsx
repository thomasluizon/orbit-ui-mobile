'use client'

import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { FlowShell } from '@/components/shell/flow-shell'

/** Auth layout: centered v8 shell for login and auth-callback pages. */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <FlowShell>
      <div
        className="relative flex min-h-full flex-col items-center overflow-x-hidden px-4 py-6"
        style={{ paddingTop: 'calc(24px + var(--safe-top))' }}
      >
        <RouteTransitionShell className="relative z-[1] my-auto flex w-full justify-center">
          {children}
        </RouteTransitionShell>
      </div>
    </FlowShell>
  )
}
