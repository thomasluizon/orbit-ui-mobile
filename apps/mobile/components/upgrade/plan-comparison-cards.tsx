import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {
  BarChart3,
  Check,
  ChevronDown,
  Flame,
  MessageSquare,
  Palette,
  ShieldCheck,
} from 'lucide-react-native'
import { UPGRADE_FEATURE_CATEGORIES } from '@orbit/shared/utils/upgrade'
import type {
  UpgradeFeatureMatrixRow,
  UpgradeIconKey,
} from '@orbit/shared/utils/upgrade'
import { Badge } from '@/components/ui/badge'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

const iconByKey: Record<UpgradeIconKey, typeof Flame> = {
  flame: Flame,
  messageSquare: MessageSquare,
  palette: Palette,
  shieldCheck: ShieldCheck,
  barChart3: BarChart3,
}

function FreeCell({
  row,
  t,
  tokens,
}: Readonly<{ row: UpgradeFeatureMatrixRow; t: UpgradeTextFn; tokens: Tokens }>) {
  if (row.type === 'text') {
    return (
      <Text style={[styles.matrixCellText, { color: tokens.fg2 }]}>
        {t(`upgrade.features.${row.key}.free`)}
      </Text>
    )
  }
  if (row.free) {
    return (
      <View accessible accessibilityLabel={t('upgrade.matrix.included')}>
        <Check size={15} strokeWidth={2.4} color={tokens.primary} />
      </View>
    )
  }
  return (
    <Text style={[styles.matrixCellText, { color: tokens.fg4, fontSize: 11 }]}>
      {t('upgrade.matrix.notIncluded')}
    </Text>
  )
}

function ProCell({
  row,
  t,
  tokens,
}: Readonly<{ row: UpgradeFeatureMatrixRow; t: UpgradeTextFn; tokens: Tokens }>) {
  if (row.type === 'text') {
    return (
      <Text style={[styles.matrixCellText, { color: tokens.fg1, fontFamily: 'Rubik_500Medium' }]}>
        {t(`upgrade.features.${row.key}.pro`)}
      </Text>
    )
  }
  if (row.pro === 'yearly') {
    return (
      <View style={styles.matrixYearlyCell} accessible accessibilityLabel={t('upgrade.matrix.yearlyTag')}>
        <Check size={15} strokeWidth={2.4} color={tokens.primary} />
        <Badge tone="soft">{t('upgrade.matrix.yearlyTag')}</Badge>
      </View>
    )
  }
  if (row.pro) {
    return (
      <View accessible accessibilityLabel={t('upgrade.matrix.included')}>
        <Check size={15} strokeWidth={2.4} color={tokens.primary} />
      </View>
    )
  }
  return (
    <Text style={[styles.matrixCellText, { color: tokens.fg4, fontSize: 11 }]}>
      {t('upgrade.matrix.notIncluded')}
    </Text>
  )
}

export function PlanComparisonCards({
  t,
  tokens,
}: Readonly<{ t: UpgradeTextFn; tokens: Tokens }>) {
  const [expanded, setExpanded] = useState(false)
  const chevronRotation = useSharedValue(0)
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value * 180}deg` }],
  }))

  function toggleExpanded() {
    const next = !expanded
    chevronRotation.value = withTiming(next ? 1 : 0, {
      duration: 220,
      easing: Easing.bezier(0.2, 0, 0, 1),
    })
    setExpanded(next)
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggleExpanded}
        style={[styles.accordionToggle, { borderTopColor: tokens.hairline }]}
      >
        <Text style={[styles.accordionTitle, { color: tokens.fg1 }]}>
          {t('upgrade.matrix.title')}
        </Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={20} strokeWidth={1.8} color={tokens.fg3} />
        </Animated.View>
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}
          style={styles.matrixPad}
        >
          <View style={[styles.matrixHeaderRow, { borderBottomColor: tokens.hairline }]}>
            <View style={styles.matrixHeadSpacer} />
            <Text style={[styles.matrixHeadFree, { color: tokens.fg2 }]}>{t('upgrade.free')}</Text>
            <Text style={[styles.matrixHeadPro, { color: tokens.primarySoft }]}>{t('common.proBadge')}</Text>
          </View>
          {UPGRADE_FEATURE_CATEGORIES.map((category) => {
            const Icon = iconByKey[category.iconKey]
            return (
              <View key={category.category}>
                <View style={styles.matrixCategoryRow}>
                  <Icon size={14} strokeWidth={1.8} color={tokens.fg3} />
                  <Text style={[styles.matrixCategoryText, { color: tokens.fg3 }]}>
                    {t(`upgrade.categories.${category.category}`)}
                  </Text>
                </View>
                {category.features.map((row) => (
                  <View key={row.key} style={[styles.matrixRow, { borderTopColor: tokens.hairline }]}>
                    <Text style={[styles.matrixLabel, { color: tokens.fg1 }]}>
                      {t(`upgrade.features.${row.key}.label`)}
                    </Text>
                    <View style={styles.matrixCellFree}>
                      <FreeCell row={row} t={t} tokens={tokens} />
                    </View>
                    <View style={styles.matrixCellPro}>
                      <ProCell row={row} t={t} tokens={tokens} />
                    </View>
                  </View>
                ))}
              </View>
            )
          })}
        </Animated.View>
      ) : null}
    </View>
  )
}
