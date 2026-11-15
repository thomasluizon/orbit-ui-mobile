import type { ReactNode, RefObject } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { OrbitLookTarget } from '@orbit/shared/contracts/brand'
import { SPACING } from '@orbit/shared/theme'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type MascotRef = RefObject<View | null>
type LookAt = OrbitLookTarget | null

/**
 * Orbit above the search question while no query exists. With a query the slot stays mounted and empty, so the field under it keeps its mount.
 * `offset` moves the block down into the centre of the free area.
 */
export function SearchOrbit({ resting, offset, mascotRef, lookAt, onLayout }: Readonly<{ resting: boolean; offset: number; mascotRef: MascotRef; lookAt: LookAt; onLayout: (event: LayoutChangeEvent) => void }>) {
  const mascotSize = useStateMascotSize()
  return (
    <View testID="search-orbit" ref={resting ? mascotRef : undefined} collapsable={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden onLayout={onLayout} style={[resting ? styles.orbit : null, { marginTop: offset }]}>
      {resting ? <OrbitMascot size={mascotSize} lookAt={lookAt} /> : null}
    </View>
  )
}

/** The search question with its field. The question is the heading of the screen and the label of the field. */
export function SearchQuestion({ onLayout, children }: Readonly<{ onLayout: (event: LayoutChangeEvent) => void; children: ReactNode }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View testID="search-question" onLayout={onLayout} style={[styles.question, { backgroundColor: tokens.bg }]}>
      <Text accessibilityRole="header" textBreakStrategy="balanced" style={[styles.heading, { color: tokens.fg1 }]}>{t('habits.search.question')}</Text>
      {children}
    </View>
  )
}

/** Orbit at 48 beside the one sentence about the result set. Orbit is Parado after a miss and on a load error. */
export function SearchOrbitLine({ mascotRef, lookAt, children }: Readonly<{ mascotRef: MascotRef; lookAt: LookAt; children: ReactNode }>) {
  return (
    <View testID="search-orbit-line" style={styles.line}>
      <View ref={mascotRef} collapsable={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.lineMascot}>
        <OrbitMascot size={48} lookAt={lookAt} />
      </View>
      <View style={styles.lineContent}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  orbit: { alignItems: 'center', paddingBottom: SPACING.s24 },
  question: { gap: 12, paddingBottom: SPACING.s16 },
  heading: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33, textAlign: 'center' },
  line: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.s4 },
  lineMascot: { width: 48, alignItems: 'center' },
  lineContent: { flex: 1, minWidth: 0 },
})
