import { Text, View } from 'react-native'
import { AstraGlyph } from '@/components/ui/astra-glyph'
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
        <InfoCard icon={<AstraGlyph size={24} color={tokens.fg3} />}>
          <Text style={{ color: tokens.fg1 }}>{t('retrospective.astraEyebrow')}</Text>
          <Text style={{ color: tokens.fg2 }}>{t('retrospective.empty')}</Text>
        </InfoCard>
      </View>
      <View style={styles.generateBtnWrap}>
        <PillButton
          onClick={onGenerate}
          disabled={!isOnline}



        >
          {t('retrospective.generate')}
        </PillButton>
      </View>
    </View>
  )
}
