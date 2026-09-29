'use client'

import { NotFoundContent } from '@/components/ui/not-found-content'
import { useAuthStore } from '@/stores/auth-store'

export default function AppNotFound() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  if (!isAuthenticated) {
    return <main className="min-h-dvh bg-[var(--bg)]"><NotFoundContent /></main>
  }
  return <NotFoundContent inShell />
}
