import { Text, TouchableOpacity, View } from 'react-native'
import { useTranslation } from 'react-i18next'
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
        <View style={[styles.progressTrack, { backgroundColor: tokens.bgSunk }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPct}%`,
                backgroundColor: progressFillColor,
              },
            ]}
          />
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            {progressText}
            {'  '}
            <Text style={styles.progressPercent}>
              ({t('goals.progressPercentage', { pct: progressPercentage })})
            </Text>
          </Text>
          {showEdit ? (
            <TouchableOpacity
              onPress={onEdit}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('goals.updateProgress')}
            >
              <Text style={styles.linkAction}>{t('goals.updateProgress')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  )
}
