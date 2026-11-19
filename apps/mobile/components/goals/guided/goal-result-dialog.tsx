import { useTranslation } from 'react-i18next'
import { formatLocaleDate, GOAL_RESULT_DATE_FORMAT, goalResultSentenceKey } from '@orbit/shared/utils'
import { ResultDialog } from '@/components/ui/result-dialog'

interface GoalResultDialogProps {
  title: string
  deadline: string
  change: 'created' | 'updated'
  opensGoal: boolean
  onPrimary: () => void
  onCreateAnother?: () => void
  onClose: () => void
}

/** The result dialog of a saved goal. The sentence states the goal and its deadline, or that it has none. */
export function GoalResultDialog({ title, deadline, change, opensGoal, onPrimary, onCreateAnother, onClose }: Readonly<GoalResultDialogProps>) {
  const { t, i18n } = useTranslation()
  const sentence = t(goalResultSentenceKey(change, deadline), { title, date: deadline ? formatLocaleDate(deadline, i18n.language, GOAL_RESULT_DATE_FORMAT) : '' })
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
