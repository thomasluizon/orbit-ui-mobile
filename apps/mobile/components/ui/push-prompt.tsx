import { useMemo, useState, useEffect, useCallback } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the prompt fade/slide on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Bell, X } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { shouldShowNativePushPrompt } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { createTokensV2, shadowsV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const STORAGE_KEY = 'orbit_push_prompted'

/**
 * Push prompt per the PushPrompt artboard: a bottom sheet in its own Modal
 * (dimmed backdrop, docked over the tab bar) with a primary-tinted bell disc,
 * Rubik 20/500 title, fg-2 body, and stacked primary/ghost pill actions.
 * Permission flow unchanged.
 */
export function PushPrompt() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const {
    isEnabled,
    isRegistered,
    isSupported,
    permissionStatus,
    registrationStatus,
    requestPermission,
  } = usePushNotifications()
  const [show, setShow] = useState(false)
  const [isDismissed, setIsDismissed] = useState<boolean | null>(null)
  const [fadeAnim] = useState(() => new Animated.Value(0))
  const [slideAnim] = useState(() => new Animated.Value(20))
  const showRetryHint =
    registrationStatus === 'sync-failed' || registrationStatus === 'token-missing'

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        setIsDismissed(value === '1')
      })
      .catch(() => {
        setIsDismissed(false)
      })
  }, [])

  const shouldShow =
    isDismissed !== null &&
    shouldShowNativePushPrompt({
      hasCompletedOnboarding: true,
      isDismissed,
      isEnabled,
      isRegistered,
      isSupported,
      permissionStatus,
      registrationStatus,
    })

  const [prevShouldShow, setPrevShouldShow] = useState(shouldShow)
  if (shouldShow !== prevShouldShow) {
    setPrevShouldShow(shouldShow)
    setShow(shouldShow)
  }

  useEffect(() => {
    if (!shouldShow) return

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start()
  }, [fadeAnim, shouldShow, slideAnim])

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 20,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShow(false)
    })
    setIsDismissed(true)
    void AsyncStorage.setItem(STORAGE_KEY, '1')
  }, [fadeAnim, slideAnim])

  const handleEnable = useCallback(async () => {
    const success = await requestPermission()
    if (success) {
      dismiss()
    }
  }, [requestPermission, dismiss])

  if (!show) return null

  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      animationType="none"
      onRequestClose={dismiss}
    >
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.wrapper,
          { paddingBottom: 20 + insets.bottom },
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
      <View style={styles.headerRow}>
        <View style={styles.bellDisc}>
          <Bell size={22} color={tokens.primarySoft} strokeWidth={1.8} />
        </View>
        <Pressable
          onPress={dismiss}
          hitSlop={8}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
        >
          <X size={18} color={tokens.fg3} strokeWidth={1.8} />
        </Pressable>
      </View>
      <Text style={styles.title}>{t('pushPrompt.title')}</Text>
      <Text style={styles.description}>{t('pushPrompt.description')}</Text>
      {showRetryHint && (
        <Text style={styles.retryText}>{t('pushPrompt.retryHint')}</Text>
      )}
      <View style={styles.buttons}>
        <PillButton fullWidth onPress={() => void handleEnable()}>
          {t('pushPrompt.enable')}
        </PillButton>
        <PillButton variant="ghost" fullWidth onPress={dismiss}>
          {t('pushPrompt.later')}
        </PillButton>
      </View>
      </Animated.View>
    </Modal>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
    wrapper: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 22,
      paddingTop: 20,
      gap: 8,
      backgroundColor: tokens.bgSheet,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: tokens.hairline,
      ...shadowsV2.shadow3,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    bellDisc: {
      width: 44,
      height: 44,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tintFromPrimary(tokens, 0.15),
    },
    closeButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -8,
      marginTop: -4,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 20,
      color: tokens.fg1,
    },
    description: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: tokens.fg2,
    },
    retryText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.statusOverdueText,
    },
    buttons: {
      flexDirection: 'column',
      gap: 10,
      paddingTop: 10,
    },
  })
}
