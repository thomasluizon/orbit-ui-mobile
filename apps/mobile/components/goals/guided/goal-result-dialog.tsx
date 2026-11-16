import { useTranslation } from 'react-i18next'
import { formatLocaleDate } from '@orbit/shared/utils'
import { ResultDialog } from '@/components/ui/result-dialog'

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }

const SENTENCES = {
  created: { dated: 'result.goal.created', undated: 'result.goal.createdNoDeadline' },
  updated: { dated: 'result.goal.updated', undated: 'result.goal.updatedNoDeadline' },
} as const

interface GoalResultDialogProps {
  title: string
  deadline: string
  change: keyof typeof SENTENCES
  opensGoal: boolean
  onPrimary: () => void
  onCreateAnother?: () => void
  onClose: () => void
}

/** The result dialog of a saved goal. The sentence states the goal and its deadline, or that it has none. */
export function GoalResultDialog({ title, deadline, change, opensGoal, onPrimary, onCreateAnother, onClose }: Readonly<GoalResultDialogProps>) {
  const { t, i18n } = useTranslation()
  const sentence = t(SENTENCES[change][deadline ? 'dated' : 'undated'], { title, date: deadline ? formatLocaleDate(deadline, i18n.language, DATE_FORMAT) : '' })
  return (
    <ResultDialog
      title={t('result.title')}
      sentence={sentence}
      primaryLabel={t(opensGoal ? 'result.goal.open' : 'habits.flow.continue')}
      onPrimary={onPrimary}
      secondaryLabel={onCreateAnother ? t('result.goal.another') : undefined}
      onSecondary={onCreateAnother}
      onClose={onClose}
    />
  )
}
