'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search } from '@/components/ui/icons'

export function SearchHeaderAction() {
  const router = useRouter()
  const t = useTranslations()
  return <button type="button" aria-label={t('habits.search.title')} onClick={() => router.push('/search')} className="grid size-11 place-items-center rounded-full text-[var(--fg-3)] hover:bg-[var(--bg-hover)] focus-visible:outline-2"><Search size={20} aria-hidden /></button>
}
