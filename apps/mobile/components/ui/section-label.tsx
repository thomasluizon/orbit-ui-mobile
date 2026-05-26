import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SectionLabelProps {
  children: ReactNode
  /** Top padding in px (default 24). */
  top?: number
  /** Bottom padding in px (default 12). */
  bottom?: number
  /** Optional trailing slot rendered on the right side of the row. */
  trailing?: ReactNode
}

/** v8 plain, flush-left 13px/600 muted section label with an optional trailing slot. */
export function SectionLabel({
  children,
  top = 24,
  bottom = 12,
  trailing,
}: Readonly<SectionLabelProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.row,
        { paddingTop: top, paddingBottom: bottom },
      ]}
    >
      <Text style={[styles.label, { color: tokens.fg3 }]}>{children}</Text>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontWeight: '600',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})
