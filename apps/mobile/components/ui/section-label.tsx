import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SectionLabelProps {
  children: ReactNode
  /** Top padding in px (default 24). */
  top?: number
  /** Bottom padding in px (default 14). */
  bottom?: number
  /** Optional trailing slot rendered on the right side of the row. */
  trailing?: ReactNode
  /** Set false to drop the horizontal gutter inside an already-padded container. */
  inset?: boolean
}

/** Kit SectionTitle: Rubik 20/500 fg-1 with 24/20/14 padding and an optional trailing slot. */
export function SectionLabel({
  children,
  top = 24,
  bottom = 14,
  trailing,
  inset = true,
}: Readonly<SectionLabelProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.row,
        !inset && styles.flush,
        { paddingTop: top, paddingBottom: bottom },
      ]}
    >
      <Text style={[styles.label, { color: tokens.fg1 }]}>{children}</Text>
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
  flush: {
    paddingHorizontal: 0,
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 20,
    letterSpacing: -0.2,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})
