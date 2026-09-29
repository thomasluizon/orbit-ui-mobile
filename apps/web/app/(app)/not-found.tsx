'use client'

import { NotFoundContent } from '@/components/ui/not-found-content'
import { isPublicPath } from '@/lib/public-paths'
import { useAuthStore } from '@/stores/auth-store'
import { usePathname } from 'next/navigation'

export default function AppNotFound() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const pathname = usePathname()
  if (!isAuthenticated && isPublicPath(pathname)) {
    return <main className="min-h-dvh bg-[var(--bg)]"><NotFoundContent /></main>
  }
  return <NotFoundContent inShell />
}
