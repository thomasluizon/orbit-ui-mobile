import { Text, View } from 'react-native'
import { CheckCircle, Clock, List, RotateCcw } from '@/components/ui/icons'
import {
  WIDGET_FEATURES,
  WIDGET_STEP_KEYS,
  type WidgetFeatureIconKey,
} from '@orbit/shared/utils/advanced-settings'
import { Sheet } from '@/components/ui/sheet'
import { styles, type Tokens } from '@/app/advanced-styles'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

function WidgetFeatureIcon({
  iconKey,
  color,
}: Readonly<{ iconKey: WidgetFeatureIconKey; color: string }>) {
  const iconProps = { size: 16, strokeWidth: 1.8, color }
  if (iconKey === 'checkCircle') return <CheckCircle {...iconProps} />
  if (iconKey === 'clock') return <Clock {...iconProps} />
  if (iconKey === 'list') return <List {...iconProps} />
  return <RotateCcw {...iconProps} />
}

export function WidgetInfoSheet({
  open,
  onClose,
  t,
  tokens,
}: Readonly<{
  open: boolean
  onClose: () => void
  t: TranslationFn
  tokens: Tokens
}>) {
  if (!open) return null

  return (
    <Sheet open onClose={onClose} title={t('profile.widgetTitle')} key="widget-info">
      <View style={styles.widgetSheetContent}>
        <Text style={[styles.widgetHeading, { color: tokens.fg1 }]}>
          {t('profile.widgetHow.title')}
        </Text>
        <View style={styles.widgetList}>
          {WIDGET_STEP_KEYS.map((stepKey, index) => (
            <View key={stepKey} style={styles.widgetStepRow}>
              <Text style={[styles.widgetStepNumber, { color: tokens.fg2 }]}>{`${index + 1}.`}</Text>
              <Text style={[styles.widgetItemText, { color: tokens.fg2 }]}>{t(stepKey)}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.widgetHeading, { color: tokens.fg1 }]}>
          {t('profile.widgetHow.featuresTitle')}
        </Text>
        <View style={styles.widgetList}>
          {WIDGET_FEATURES.map((feature) => (
            <View key={feature.textKey} style={styles.widgetFeatureRow}>
              <WidgetFeatureIcon iconKey={feature.iconKey} color={tokens.primary} />
              <Text style={[styles.widgetItemText, { color: tokens.fg2 }]}>{t(feature.textKey)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  )
}
