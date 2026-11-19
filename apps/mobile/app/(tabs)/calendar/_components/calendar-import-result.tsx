import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { ResultDialog } from '@/components/ui/result-dialog'

/** The close of a successful import: the count the server returned, and Hoje as the filled action. */
export function CalendarImportResult({ count, onClose }: Readonly<{ count: number | null; onClose: () => void }>) {
  const { t } = useTranslation()
  const router = useRouter()
  if (count === null) return null
  return <ResultDialog title={t('result.title')} sentence={t('result.calendar.imported', { count })} primaryLabel={t('result.seeToday')}
    onPrimary={() => { onClose(); router.push('/(tabs)') }} onClose={onClose} />
}
