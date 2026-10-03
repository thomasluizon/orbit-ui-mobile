import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { FreezeBankProps } from '@orbit/shared/contracts/display'
import { Info, Snowflake } from '@/components/ui/icons'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function StreakLegend({ words }: Readonly<Pick<FreezeBankProps, 'words'>>) {
  const { t } = useTranslation()
  const theme = useAppTheme()
  const tokens = createTokensV2(theme.currentScheme, theme.currentTheme)
  const [hovered, setHovered] = useState(false)
  const [open, setOpen] = useState(false)
  const { sheetRef } = useSheetHost()
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={words.legendLabel} accessibilityState={{ expanded: open }}
        onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onPress={() => setOpen(true)} style={({ pressed }) => [styles.entry, { backgroundColor: (pressed || hovered) ? tokens.bgHoverOpaque : 'transparent' }]}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Info size={24} strokeWidth={1.5} color={tokens.fg2} /></View>
      </Pressable>
      {open ? <Sheet ref={sheetRef} open title={t('progressScreen.streak.legendTitle')} accessibleTitle={words.legendLabel} onClose={() => setOpen(false)}>
        <View style={styles.legend}>
          {(['active', 'frozen', 'missed'] as const).map((state) => (
            <View key={state} style={styles.row}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {state === 'frozen' ? <Snowflake size={16} strokeWidth={1.5} color={tokens.statusFrozen} />
                  : <View style={[styles.mark, state === 'active' ? { backgroundColor: tokens.fg1 } : { borderWidth: 1, borderColor: tokens.statusEmpty }]} />}
              </View>
              <Text style={[styles.label, { color: tokens.fg2 }]}>{words[state]}</Text>
            </View>
          ))}
        </View>
      </Sheet> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  entry: { alignSelf: 'flex-start', minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: 12 },
  legend: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  mark: { width: 12, height: 12, borderRadius: 8 },
  label: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
})
