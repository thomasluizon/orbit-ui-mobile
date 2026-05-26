'use client'

import { RouteTransitionShell } from '@/components/motion/route-transition-shell'

/** Auth layout: centered v8 shell for login and auth-callback pages. */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        padding: '24px 16px',
        paddingTop: 'calc(24px + var(--safe-top))',
      }}
    >
      <RouteTransitionShell className="w-full flex justify-center">
        {children}
      </RouteTransitionShell>
    </div>
  )
}
