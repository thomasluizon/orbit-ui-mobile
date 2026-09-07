'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'

export function PublicSessionBootstrap({ hasSessionCookie }: Readonly<{ hasSessionCookie: boolean }>) {
  const pathname = usePathname()
  useEffect(() => {
    if (pathname === '/about' && hasSessionCookie) void useAuthStore.getState().checkSession()
  }, [pathname, hasSessionCookie])
  return null
}
