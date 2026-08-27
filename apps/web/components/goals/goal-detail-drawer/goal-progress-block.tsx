'use client'

import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { GoalProgressRing } from './goal-progress-ring'

interface GoalProgressBlockProps {
  progressPercentage: number
  progressFillColor: string
  progressText: string
  showEdit: boolean
  onEdit: () => void
}

/** Progress section of the goal drawer: section label, progress ring, and the
 *  update-progress CTA shown for active goals while the form is closed. */
export function GoalProgressBlock({
  progressPercentage,
  progressFillColor,
  progressText,
  showEdit,
  onEdit,
}: Readonly<GoalProgressBlockProps>) {
  const t = useTranslations()

  return (
    <>
      <SectionLabel>{t('goals.progress')}</SectionLabel>
      <div style={{ padding: '2px 20px 16px' }}>
        <GoalProgressRing
          progressPercentage={progressPercentage}
          percentLabel={t('goals.progressPercentage', {
            pct: Math.round(progressPercentage),
          })}
          progressOfLabel={progressText}
          color={progressFillColor}
        />
        {showEdit && (
          <div className="flex justify-center">
            <PillButton



              onClick={onEdit}
            >
              {t('goals.updateProgress')}
            </PillButton>
          </div>
        )}
      </div>
    </>
  )
}
