import { useMemo, useState, useEffect, useCallback } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Crown } from 'lucide-react-native'
import { useTrialExpired } from '@/hooks/use-profile'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const STORAGE_KEY = 'orbit_trial_expired_seen'

const PAUSED_FEATURES = [
  'trial.expired.subHabits',
  'trial.expired.aiChat',
  'trial.expired.goals',
  'trial.expired.aiSummary',
  'trial.expired.allColors',
] as const

/**
 * Trial-expired dialog: centered card with a crown hero, paused Pro feature
 * rows, and pill CTAs to subscribe or continue on free. Preserves the
 * AsyncStorage seen-once gating.
 */
export function TrialExpiredModal() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const trialExpired = useTrialExpired()
  const [dismissed, setDismissed] = useState(false)
  const [alreadySeen, setAlreadySeen] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      setAlreadySeen(value === '1')
    })
  }, [])

  const isOpen =
    pathname !== '/upgrade' && !dismissed && trialExpired && !alreadySeen

  const dismiss = useCallback(() => {
    setDismissed(true)
    AsyncStorage.setItem(STORAGE_KEY, '1')
  }, [])

  if (!isOpen) return null

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.heroDisc}>
              <Crown size={30} strokeWidth={1.8} color={tokens.primarySoft} />
            </View>
            <Text style={styles.heading}>{t('trial.expired.heading')}</Text>
            <Text style={styles.subtitle}>{t('trial.expired.subtitleQuiet')}</Text>

            <View style={styles.featureList}>
              {PAUSED_FEATURES.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <Text style={styles.featureText}>{t(feature)}</Text>
                  <Text style={styles.featurePaused}>
                    {t('trial.expired.paused')}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <PillButton
              fullWidth
              onPress={() => {
                dismiss()
                router.push(buildUpgradeHref(pathname || '/'))
              }}
            >
              {t('trial.expired.subscribe')}
            </PillButton>
            <PillButton variant="ghost" fullWidth onPress={dismiss}>
              {t('trial.expired.continueFree')}
            </PillButton>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    dialog: {
      width: '100%',
      maxWidth: 340,
      maxHeight: '86%',
      backgroundColor: tokens.bgSheet,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairline,
      paddingTop: 28,
      shadowColor: '#000000',
      shadowOpacity: 0.55,
      shadowOffset: { width: 0, height: 24 },
      shadowRadius: 60,
      elevation: 12,
    },
    scrollContent: {
      paddingHorizontal: 22,
      paddingBottom: 4,
      gap: 14,
    },
    heroDisc: {
      width: 64,
      height: 64,
      borderRadius: 999,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tintFromPrimary(tokens, 0.15),
    },
    heading: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 22,
      letterSpacing: -0.22,
      lineHeight: 28,
      textAlign: 'center',
      color: tokens.fg1,
    },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      color: tokens.fg2,
    },
    featureList: {
      marginTop: 6,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    featureText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg1,
      flexShrink: 1,
    },
    featurePaused: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 11,
      letterSpacing: 0.44,
      textTransform: 'uppercase',
      color: tokens.fg3,
    },
    footer: {
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 18,
      gap: 10,
    },
  })
}
