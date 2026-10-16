import { Text, View } from 'react-native'
import { Calendar, Eye, FileText, MessageCircle } from '@/components/ui/icons'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

const OUTCOMES = [
  { key: 'astra', Icon: MessageCircle },
  { key: 'calendar', Icon: Calendar },
  { key: 'retrospective', Icon: FileText },
  { key: 'noticing', Icon: Eye },
] as const

export function ProBenefits({ t, tokens, heading = false }: Readonly<{
  t: UpgradeTextFn
  tokens: Tokens
  heading?: boolean
}>) {
  return (
    <View style={{ gap: 16 }}>
      {heading ? <Text accessibilityRole="header" style={[styles.billingHeading, { color: tokens.fg1, fontFamily: 'Geist_500Medium', lineHeight: 26.4, letterSpacing: -0.22 }]}>{t('upgrade.included')}</Text> : null}
      <View accessibilityLabel={t(heading ? 'upgrade.included' : 'upgrade.outcomes.label')} style={styles.outcomes}>
        {OUTCOMES.map(({ key, Icon }) => <View key={key} style={styles.outcomeRow}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon size={20} strokeWidth={1.5} color={tokens.fg3} />
          </View>
          <Text style={[styles.outcomeBody, { color: tokens.fg2 }]}>{t(`upgrade.outcomes.${key}`)}</Text>
        </View>)}
      </View>
    </View>
  )
}
