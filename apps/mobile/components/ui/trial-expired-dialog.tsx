import { useEffect, useRef } from 'react'
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PADDING } from '@orbit/shared/theme'
import { ActionRow } from '@/components/ui/action-row'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { PillButton } from '@/components/ui/pill-button'
import { SettingsGroup } from '@/components/ui/settings-group'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const PANEL_MAX_WIDTH = 420

/** The trial expired notice as a centred dialog: Orbit in Parado, the heading, the paused features and the two actions. Orbit is never Feliz here. */
export function TrialExpiredDialog({ pausedFeatures, savingsPercent, onSeePlans, onContinueFree, onClose }: Readonly<{
  pausedFeatures: readonly string[]
  /** The yearly saving of the plans read. Absent until the read answers. */
  savingsPercent: number | undefined
  onSeePlans: () => void
  onContinueFree: () => void
  /** Android back and a scrim press. */
  onClose: () => void
}>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const primaryRef = useRef<View>(null)

  useEffect(() => {
    const target = findNodeHandle(primaryRef.current)
    if (target !== null) AccessibilityInfo.setAccessibilityFocus(target)
  }, [])

  return (
    <Modal transparent visible animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onClose}>
      <OrbitOverlayLayer>
        <View style={styles.centre} testID="trial-expired-centre">
          <Pressable accessible={false} importantForAccessibility="no" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.scrim }]} onPress={onClose} testID="trial-expired-scrim" />
          <View
            testID="trial-expired-dialog"
            accessibilityViewIsModal
            accessibilityLabel={t('trial.expired.heading')}
            accessibilityHint={t('trial.expired.subtitleQuiet')}
            style={[styles.panel, { backgroundColor: tokens.bgElev }]}
          >
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <OrbitMascot size={96} state="parado" />
            </View>
            <View style={styles.intro}>
              <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>{t('trial.expired.eyebrow')}</Text>
              <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg1 }]}>{t('trial.expired.heading')}</Text>
              <Text style={[styles.subtitle, { color: tokens.fg2 }]}>{t('trial.expired.subtitleQuiet')}</Text>
              {savingsPercent === undefined ? null : (
                <Text testID="trial-expired-savings" style={[styles.savings, { color: tokens.fg3 }]}>{t('trial.expired.savings', { percent: savingsPercent })}</Text>
              )}
            </View>
            <View style={styles.fullWidth}>
              <SettingsGroup>
                {pausedFeatures.map((featureKey) => (
                  <ListRow readOnly textMode="label" key={featureKey} title={t(featureKey)} description={t('trial.expired.paused')} />
                ))}
              </SettingsGroup>
            </View>
            <ActionRow align="center">
              <View style={styles.fullWidth}><PillButton buttonRef={primaryRef} onClick={onSeePlans}>{t('trial.expired.subscribe')}</PillButton></View>
              <PillButton variant="ghost" size="sm" onClick={onContinueFree}>{t('trial.expired.continueFree')}</PillButton>
            </ActionRow>
          </View>
        </View>
      </OrbitOverlayLayer>
    </Modal>
  )
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: PANEL_MAX_WIDTH, alignItems: 'center', gap: 24, borderRadius: 20, padding: PADDING.cardInset, elevation: 8 },
  intro: { gap: 8, alignItems: 'center' },
  eyebrow: { fontFamily: 'GeistMono_500Medium', fontSize: 12, letterSpacing: 0.96, lineHeight: 16, textTransform: 'uppercase', textAlign: 'center' },
  heading: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33, textAlign: 'center' },
  subtitle: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  savings: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'], textAlign: 'center' },
  fullWidth: { width: '100%' },
})
