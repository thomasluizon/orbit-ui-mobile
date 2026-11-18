import { useEffect, useRef, type ReactNode } from 'react'
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ResultDialogProps } from '@orbit/shared/contracts/flow'
import { PADDING } from '@orbit/shared/theme'
import { ActionRow } from '@/components/ui/action-row'
import { OrbitHop } from '@/components/ui/orbit-hop'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

const PANEL_MAX_WIDTH = 420

interface ResultDialogFrameProps {
  label: string
  hint?: string
  testID?: string
  onClose: () => void
  children: ReactNode
}

/** The centred panel of the result dialog over the scrim, at every width. The result dialog and its read failure share it. */
export function ResultDialogFrame({ label, hint, testID = 'result-dialog', onClose, children }: Readonly<ResultDialogFrameProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  return (
    <Modal transparent visible animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onClose}>
      <OrbitOverlayLayer>
        <View style={styles.centre} testID="result-dialog-centre">
          <Pressable accessible={false} importantForAccessibility="no" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.scrim }]} onPress={onClose} testID="result-dialog-scrim" />
          <View testID={testID} accessibilityViewIsModal accessibilityLabel={label} accessibilityHint={hint} style={[styles.panel, { backgroundColor: tokens.bgElev }]}>
            {children}
          </View>
        </View>
      </OrbitOverlayLayer>
    </Modal>
  )
}

/** The result dialog: centred at every width, Orbit at 128, one sentence, a filled action and a ghost action. It asks nothing. */
export function ResultDialog({ title, sentence, primaryLabel, onPrimary, secondaryLabel, onSecondary, onClose, orbitState = 'feliz' }: Readonly<ResultDialogProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const primaryRef = useRef<View>(null)

  useEffect(() => {
    const target = findNodeHandle(primaryRef.current)
    if (target !== null) AccessibilityInfo.setAccessibilityFocus(target)
  }, [])

  return (
    <ResultDialogFrame label={title} hint={sentence} onClose={onClose}>
      <OrbitHop testID="result-dialog-orbit" active={orbitState === 'feliz'}><OrbitMascot size={128} state={orbitState} /></OrbitHop>
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      <Text style={[styles.sentence, { color: tokens.fg2 }]}>{sentence}</Text>
      <ActionRow align="center">
        <View style={styles.fullWidth}><PillButton buttonRef={primaryRef} onClick={onPrimary}>{primaryLabel}</PillButton></View>
        {secondaryLabel && onSecondary ? <PillButton variant="ghost" size="sm" onClick={onSecondary}>{secondaryLabel}</PillButton> : null}
      </ActionRow>
    </ResultDialogFrame>
  )
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: PANEL_MAX_WIDTH, alignItems: 'center', gap: 24, borderRadius: 20, padding: PADDING.cardInset, elevation: 8 },
  title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33, textAlign: 'center' },
  sentence: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 26, textAlign: 'center' },
  fullWidth: { width: '100%' },
})
