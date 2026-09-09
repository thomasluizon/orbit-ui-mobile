'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search } from '@/components/ui/icons'
import { Button } from '@/components/ui/pill-button'

export function SearchHeaderAction() {
  const router = useRouter()
  const t = useTranslations()
  return <Button variant="ghost" size="sm" iconOnly label={t('habits.search.title')} onClick={() => router.push('/search')}><Search size={20} aria-hidden /></Button>
}
