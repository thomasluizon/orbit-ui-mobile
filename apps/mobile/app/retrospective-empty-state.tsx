import { View } from 'react-native'
import { Orbit } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { styles, type Tokens } from './retrospective-styles'

interface RetrospectiveEmptyStateProps {
  tokens: Tokens
  isOnline: boolean
  onGenerate: () => void
}

export function RetrospectiveEmptyState({
  tokens,
  isOnline,
  onGenerate,
}: Readonly<RetrospectiveEmptyStateProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.generateBlock}>
      <View style={styles.generateCardWrap}>
        <InfoCard
          icon={Orbit}
          title={t('retrospective.astraEyebrow')}
          desc={t('retrospective.empty')}
        />
      </View>
      <View style={styles.generateBtnWrap}>
        <PillButton
          onPress={onGenerate}
          disabled={!isOnline}
          fullWidth
          accessibilityLabel={t('retrospective.generate')}
          leading={
            <Orbit size={16} color={tokens.fgOnPrimary} strokeWidth={1.8} />
          }
        >
          {t('retrospective.generate')}
        </PillButton>
      </View>
    </View>
  )
}
