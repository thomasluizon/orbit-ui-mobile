'use client'

import { GradientTop } from '@/components/ui/gradient-top'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'

/** Auth layout: centered v8 shell for login and auth-callback pages. */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden"
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        padding: '24px 16px',
        paddingTop: 'calc(24px + var(--safe-top))',
      }}
    >
      <GradientTop height={320} />
      <RouteTransitionShell className="relative z-[1] w-full flex justify-center">
        {children}
      </RouteTransitionShell>
    </div>
  )
}
