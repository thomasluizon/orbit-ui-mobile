import { Text, View } from 'react-native'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useTranslation } from 'react-i18next'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { styles, type Tokens } from '@/app/retrospective-styles'

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
        <InfoCard icon={<AstraGlyph size={24} color={tokens.fg3} />}>
          <Text style={{ color: tokens.fg1 }}>{t('retrospective.astraEyebrow')}</Text>
          <Text style={{ color: tokens.fg2 }}>{t('retrospective.noData')}</Text>
        </InfoCard>
      </View>
      <View style={styles.generateBtnWrap}>
        <PillButton
          onClick={onGenerate}
          disabled={!isOnline}



        >
          {t('retrospective.regenerate')}
        </PillButton>
      </View>
    </View>
  )
}
