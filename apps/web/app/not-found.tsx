import { getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/ui/empty-state'

export default async function NotFound() {
  const t = await getTranslations()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--bg)] px-6">
      <EmptyState
        title={t('notFoundPage.title')}
        description={t('notFoundPage.description')}
        action={{ label: t('common.goHome'), href: '/' }}
      />
    </main>
  )
}
