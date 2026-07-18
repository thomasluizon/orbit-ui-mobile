import { getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/ui/empty-state'

export default async function PublicProfileNotFound() {
  const t = await getTranslations('profile.publicProfile.notFound')

  return (
    <div className="flex items-center justify-center" style={{ minHeight: '70dvh' }}>
      <EmptyState
        title={t('title')}
        description={t('body')}
        action={{ label: t('cta'), href: '/login' }}
      />
    </div>
  )
}
