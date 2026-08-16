import { View } from 'react-native'
import { Orbit } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { styles, type Tokens } from './retrospective-styles'

interface RetrospectiveNoDataStateProps {
  tokens: Tokens
  isOnline: boolean
  onGenerate: () => void
}

export function RetrospectiveNoDataState({
  tokens,
  isOnline,
  onGenerate,
}: Readonly<RetrospectiveNoDataStateProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.generateBlock}>
      <View style={styles.generateCardWrap}>
        <InfoCard
          icon={Orbit}
          title={t('retrospective.astraEyebrow')}
          desc={t('retrospective.noData')}
        />
      </View>
      <View style={styles.generateBtnWrap}>
        <PillButton
          onPress={onGenerate}
          disabled={!isOnline}
          fullWidth
          accessibilityLabel={t('retrospective.regenerate')}
          leading={
            <Orbit size={16} color={tokens.fgOnPrimary} strokeWidth={1.8} />
          }
        >
          {t('retrospective.regenerate')}
        </PillButton>
      </View>
    </View>
  )
}
