import type { ReactNode } from 'react'
import { useGuidedSignIn } from './guided-sign-in'

/** The page frame of the sign-in routes. The guided sign-in owns the main landmark, so the frame is a plain block while it shows. */
export function AuthPageFrame({ children }: Readonly<{ children: ReactNode }>) {
  const Frame = useGuidedSignIn() ? 'div' : 'main'
  return <Frame data-desktop-reload-safe="" data-auth-page-frame="" className="flex min-h-dvh w-full flex-col items-center justify-center bg-[var(--bg)] text-[var(--fg-1)]"
    style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)', paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}>
    {children}
  </Frame>
}
