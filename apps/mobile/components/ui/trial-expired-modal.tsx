import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTrialExpired } from '@/hooks/use-profile'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const STORAGE_KEY = 'orbit_trial_expired_seen'

const FEATURES = [
  'trial.expired.subHabits',
  'trial.expired.aiChat',
  'trial.expired.unlimitedHabits',
  'trial.expired.aiSummary',
  'trial.expired.allColors',
]

/**
 * v8 trial-expired modal: full-screen quiet sheet -- "Welcome back to free."
 * Lists Pro features as "Paused" rows. Preserves AsyncStorage gating.
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
            <Text style={styles.eyebrow}>{t('trial.expired.title')}</Text>
            <Text style={styles.heading}>
              {t('subscription.trialEnded')}
            </Text>
            <Text style={styles.subtitle}>
              {t('trial.expired.subscribe')}
            </Text>

            <View style={styles.featureList}>
              {FEATURES.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <Text style={styles.featureText}>{t(feature)}</Text>
                  <Text style={styles.featurePaused}>
                    {t('common.failed', { defaultValue: 'Paused' })}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [
                styles.subscribeBtn,
                {
                  backgroundColor: pressed
                    ? tokens.primaryPressed
                    : tokens.primary,
                },
              ]}
              onPress={() => {
                dismiss()
                router.push(buildUpgradeHref(pathname || '/'))
              }}
            >
              <Text style={[styles.subscribeBtnText, { color: tokens.fgOnPrimary }]}>
                {t('trial.expired.subscribe')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.continueBtn}
              onPress={dismiss}
            >
              <Text style={styles.continueBtnText}>
                {t('trial.expired.continueFree')}
              </Text>
            </Pressable>
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
      backgroundColor: tokens.bg,
      justifyContent: 'flex-end',
    },
    dialog: {
      width: '100%',
      backgroundColor: tokens.bg,
      paddingTop: 32,
    },
    scrollContent: {
      paddingHorizontal: 28,
      paddingBottom: 16,
      gap: 14,
    },
    eyebrow: {
      fontFamily: 'Geist',
      fontSize: 12,
      fontWeight: '600',
      color: tokens.fg3,
    },
    heading: {
      fontFamily: 'Geist',
      fontSize: 28,
      fontWeight: '600',
      letterSpacing: -0.7,
      lineHeight: 32,
      color: tokens.fg1,
    },
    subtitle: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontStyle: 'italic',
      lineHeight: 22,
      color: tokens.fg2,
    },
    featureList: {
      marginTop: 14,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    featureText: {
      fontFamily: 'Geist',
      fontSize: 15,
      color: tokens.fg1,
    },
    featurePaused: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontStyle: 'italic',
      color: tokens.fg3,
    },
    footer: {
      paddingHorizontal: 28,
      paddingTop: 18,
      paddingBottom: 22,
      gap: 10,
    },
    subscribeBtn: {
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subscribeBtnText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
    },
    continueBtn: {
      paddingVertical: 6,
      alignItems: 'center',
    },
    continueBtnText: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
