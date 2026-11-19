'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ResultDialog } from '@/components/ui/result-dialog'

/** The close of a successful import: the count the server returned, and Hoje as the filled action. */
export function CalendarImportResult({ count, onClose }: Readonly<{ count: number | null; onClose: () => void }>) {
  const t = useTranslations()
  const router = useRouter()
  if (count === null) return null
  return <ResultDialog title={t('result.title')} sentence={t('result.calendar.imported', { count })} primaryLabel={t('result.seeToday')}
    onPrimary={() => { onClose(); router.push('/') }} onClose={onClose} />
}
