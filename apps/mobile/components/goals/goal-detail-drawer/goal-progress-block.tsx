import { Text, View } from 'react-native'
import { Plus } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import type { AppTokens, createStyles } from './styles'

type GoalDetailStyles = ReturnType<typeof createStyles>

interface GoalProgressBlockProps {
  progressPct: number
  progressFillColor: string
  progressText: string
  progressPercentage: number
  showEdit: boolean
  onEdit: () => void
  styles: GoalDetailStyles
  tokens: AppTokens
}

export function GoalProgressBlock({
  progressPct,
  progressFillColor,
  progressText,
  progressPercentage,
  showEdit,
  onEdit,
  styles,
  tokens,
}: Readonly<GoalProgressBlockProps>) {
  const { t } = useTranslation()

  return (
    <View>
      <SectionLabel top={4} bottom={8}>
        {t('goals.progress')}
      </SectionLabel>
      <View style={styles.progressBlock}>
        <Text style={styles.heroPercent}>{`${progressPercentage}%`}</Text>
        <ProgressBar
          progress={progressPct / 100}
          label={t('goals.progressPercentage', { pct: progressPercentage })}
          color={progressFillColor}
        />
        <Text style={styles.progressMeta}>{progressText}</Text>
        {showEdit ? (
          <PillButton
            fullWidth
            style={styles.progressCta}
            onPress={onEdit}
            accessibilityLabel={t('goals.updateProgress')}
            leading={
              <Plus size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />
            }
          >
            {t('goals.updateProgress')}
          </PillButton>
        ) : null}
      </View>
    </View>
  )
}
