'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  const t = useTranslations()
  const router = useRouter()

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)]">
      <EmptyState
        title={t('notFoundPage.title')}
        description={t('notFoundPage.description')}
        action={{ label: t('notFoundPage.home'), onClick: () => router.push('/') }}
      />
    </main>
  )
}
