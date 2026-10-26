import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { formatFigurePeriod } from '@orbit/shared/chat/figure-card-core'
import { CompactFigure } from './compact-figure'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { BlockFrame } from './read-block-frame'
import type { PeriodTotalCard as PeriodTotal } from '@orbit/shared/types/chat'

export function PeriodTotalCard({ card }: Readonly<{ card: PeriodTotal }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <BlockFrame state="resting" title={t(`chat.readBlock.metric.${card.metric}`)} wrapTitle titleContent={<CompactFigure value={new Intl.NumberFormat(i18n.language).format(card.value)} unit={t(`chat.readBlock.unit.${card.unit}`, { count: card.value })} />} count={null} items={[]}
    body={<View style={{ minWidth: 0, gap: 8 }}>
      <Text style={{ color: tokens.fg3, fontSize: 14 }}>{formatFigurePeriod(card.metrics.window, i18n.language, t)}</Text>
    </View>} />
}
