import { useMemo, useState, useEffect, useCallback } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the dialog transform/opacity on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Crown } from '@/components/ui/icons'
import { useTrialExpired } from '@/hooks/use-profile'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, shadowsV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { toAnimatedEasing, useResolvedMotionPreset } from '@/lib/motion'
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
 * AsyncStorage seen-once gating and animates in and out with the shared dialog
 * motion preset.
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
  const dialogMotion = useResolvedMotionPreset('dialog')
  const progress = useMemo(() => new Animated.Value(0), [])
  const trialExpired = useTrialExpired()
  const [dismissed, setDismissed] = useState(false)
  const [alreadySeen, setAlreadySeen] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      setAlreadySeen(value === '1')
    })
  }, [])

  const isOpen =
    pathname !== '/upgrade' && !dismissed && trialExpired && !alreadySeen

  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) setVisible(true)
  }

  useEffect(() => {
    if (isOpen) {
      Animated.timing(progress, {
        toValue: 1,
        duration: dialogMotion.enterDuration,
        easing: toAnimatedEasing(dialogMotion.enterEasing),
        useNativeDriver: true,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: dialogMotion.exitDuration,
      easing: toAnimatedEasing(dialogMotion.exitEasing),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setVisible(false)
    })
  }, [
    dialogMotion.enterDuration,
    dialogMotion.enterEasing,
    dialogMotion.exitDuration,
    dialogMotion.exitEasing,
    isOpen,
    progress,
  ])

  const dismiss = useCallback(() => {
    setDismissed(true)
    void AsyncStorage.setItem(STORAGE_KEY, '1')
  }, [])

  if (!visible) return null

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [dialogMotion.shift, 0],
  })
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [dialogMotion.scaleFrom, dialogMotion.scaleTo],
  })

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Animated.View
          style={[
            styles.dialog,
            { opacity: progress, transform: [{ translateY }, { scale }] },
          ]}
        >
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
              {PAUSED_FEATURES.map((feature, index) => (
                <View
                  key={feature}
                  style={[
                    styles.featureRow,
                    index === PAUSED_FEATURES.length - 1 ? styles.featureRowLast : null,
                  ]}
                >
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
        </Animated.View>
      </View>
    </Modal>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: tokens.scrim,
    },
    dialog: {
      width: '100%',
      maxWidth: 340,
      maxHeight: '86%',
      backgroundColor: tokens.bgSheet,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingTop: 28,
      ...shadowsV2.shadow3,
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
      backgroundColor: tintFromPrimary(tokens, 0.16),
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
      fontSize: 15,
      lineHeight: 22.5,
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
    featureRowLast: {
      borderBottomWidth: 0,
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
