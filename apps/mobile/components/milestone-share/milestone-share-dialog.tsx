import { useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { PADDING, SPACING } from '@orbit/shared/theme'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { MILESTONE_SHARE_CARD_WIDTH } from './milestone-share-card'

const PANEL_MAX_WIDTH = 420

/** The card keeps its logical width for the image. The preview scales it down to the width of the dialog. */
function MilestoneCardPreview({ children }: Readonly<{ children: ReactNode }>) {
  const [frameWidth, setFrameWidth] = useState(0)
  const [cardHeight, setCardHeight] = useState(0)
  const scale = frameWidth > 0 ? Math.min(1, frameWidth / MILESTONE_SHARE_CARD_WIDTH) : 1
  return (
    <View
      testID="milestone-card-preview"
      onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}
      style={[styles.previewFrame, cardHeight > 0 ? { height: cardHeight * scale } : null]}
    >
      <View
        testID="milestone-card-scale"
        onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
        style={{ width: MILESTONE_SHARE_CARD_WIDTH, transform: [{ scale }], transformOrigin: 'top center' }}
      >
        {children}
      </View>
    </View>
  )
}

interface MilestoneShareDialogProps {
  card: ReactNode
  actions: ReactNode
  onDismiss: () => void
}

/** The milestone share prompt under `orbit_guided_flows`: a centred dialog with Orbit in Feliz, with no hop, above the card. */
export function MilestoneShareDialog({ card, actions, onDismiss }: Readonly<MilestoneShareDialogProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const insets = useSafeAreaInsets()
  const title = t('milestoneShare.title')
  const body = t('milestoneShare.body')

  return (
    <Modal transparent visible animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onDismiss}>
      <OrbitOverlayLayer>
        <View testID="milestone-share-dialog-centre" style={[styles.centre, { paddingTop: SPACING.s16 + insets.top, paddingBottom: SPACING.s16 + insets.bottom }]}>
          <Pressable accessible={false} importantForAccessibility="no" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.scrim }]} onPress={onDismiss} testID="milestone-share-dialog-scrim" />
          <View
            testID="milestone-share-dialog"
            role="dialog"
            accessibilityViewIsModal
            accessibilityLabel={title}
            accessibilityHint={body}
            style={[styles.panel, { backgroundColor: tokens.bgElev }]}
          >
            <ScrollView style={styles.scroller} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <OrbitMascot size={96} state="feliz" />
              </View>
              <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
              <MilestoneCardPreview>{card}</MilestoneCardPreview>
              <Text style={[styles.body, { color: tokens.fg2 }]}>{body}</Text>
            </ScrollView>
            <View testID="milestone-share-dialog-actions" style={styles.actions}>{actions}</View>
          </View>
        </View>
      </OrbitOverlayLayer>
    </Modal>
  )
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.s16 },
  panel: { width: '100%', maxWidth: PANEL_MAX_WIDTH, maxHeight: '100%', borderRadius: 20, padding: PADDING.cardInset, gap: SPACING.s24, elevation: 8 },
  scroller: { flexGrow: 0, flexShrink: 1 },
  content: { alignItems: 'center', gap: SPACING.s24 },
  title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, lineHeight: 26, letterSpacing: -0.44, textAlign: 'center' },
  previewFrame: { width: '100%', alignItems: 'center', overflow: 'hidden' },
  body: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  actions: { gap: SPACING.s12 },
})
