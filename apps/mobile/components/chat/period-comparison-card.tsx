import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { comparisonPresentation } from '@orbit/shared/chat/figure-card-core'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { BlockFrame } from './read-block-frame'
import { CompactFigure, FigureList } from './compact-figure'
import type { PeriodComparisonCard as PeriodComparison } from '@orbit/shared/types/chat'

export function PeriodComparisonCard({ card }: Readonly<{ card: PeriodComparison }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const presentation = comparisonPresentation(card, i18n.language, t)
  return <BlockFrame state="resting" title={presentation.verdict} wrapTitle count={null} items={[]}
    body={<FigureList>
      <Text style={{ fontSize: 14, color: tokens.fg2 }}>{t(`chat.readBlock.metric.${card.metric}`)}</Text>
      {presentation.bars.map(bar => <View key={bar.id} style={{ minWidth: 0, gap: 4 }}>
        <Text style={{ fontSize: 12, color: tokens.fg3 }}>{bar.label}</Text>
        <CompactFigure value={new Intl.NumberFormat(i18n.language).format(bar.value)} unit={t(`chat.readBlock.unit.${card.unit}`, { count: bar.value })} />
        <View accessible={false} style={{ height: 8, width: '100%', overflow: 'hidden', borderRadius: 8, backgroundColor: tokens.trackEmpty }}><View testID={`comparison-bar-${bar.id}`} style={{ height: 8, width: `${bar.width}%`, borderRadius: 8, backgroundColor: tokens.fg2 }} /></View>
      </View>)}
    </FigureList>} />
}
