import { useTranslation } from 'react-i18next'
import { Text } from 'react-native'
import { formatReadWindow } from '@orbit/shared/chat/read-block-core'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { BlockFrame } from './read-block-frame'
import type { PeriodComparisonCard as PeriodComparison } from '@orbit/shared/types/chat'

export function PeriodComparisonCard({ card }: Readonly<{ card: PeriodComparison }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const locale = i18n.language
  const number = new Intl.NumberFormat(locale)
  const delta = new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' }).format(card.absoluteDelta)
  const relative = card.baselineValue !== 0 && card.relativeDelta != null ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(card.relativeDelta) : null
  const figure = (value: string) => <Text style={{ color: tokens.fg1, fontSize: 16, fontVariant: ['tabular-nums'] }}>{value}</Text>
  return <BlockFrame state="resting" title={t(`chat.readBlock.metric.${card.metric}`)} wrapTitle count={null}
    items={[
      { id: 'current', wrapLabel: true, label: formatReadWindow(card.current.window, locale), control: figure(number.format(card.currentValue)) },
      { id: 'baseline', wrapLabel: true, label: formatReadWindow(card.baseline.window, locale), control: figure(number.format(card.baselineValue)) },
      { id: 'delta', wrapLabel: true, label: t('chat.readBlock.delta'), control: figure(`${delta}${relative ? ` (${relative})` : ''}`) },
    ]}
    body={<Text style={{ color: tokens.fg3, fontSize: 14 }}>{t(`chat.readBlock.unit.${card.unit}`, { count: card.currentValue })}</Text>} />
}
