import { useMemo, useState, useEffect, useCallback } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { shouldShowNativePushPrompt } from '@orbit/shared/utils'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const STORAGE_KEY = 'orbit_push_prompted'

/**
 * v8 push prompt: bottom edge banner with mono "Permissions" eyebrow, plain
 * title, italic body, italic Later / underlined Enable links.
 */
export function PushPrompt() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
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

  useEffect(() => {
    if (isDismissed === null) return

    const shouldShow = shouldShowNativePushPrompt({
      hasCompletedOnboarding: true,
      isDismissed,
      isEnabled,
      isRegistered,
      isSupported,
      permissionStatus,
      registrationStatus,
    })

    if (!shouldShow) {
       
      setShow(false)
      return
    }

    setShow(true)
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
  }, [
    fadeAnim,
    isDismissed,
    isEnabled,
    isRegistered,
    isSupported,
    permissionStatus,
    registrationStatus,
    slideAnim,
  ])

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
    AsyncStorage.setItem(STORAGE_KEY, '1')
  }, [fadeAnim, slideAnim])

  const handleEnable = useCallback(async () => {
    const success = await requestPermission()
    if (success) {
      dismiss()
    }
  }, [requestPermission, dismiss])

  if (!show) return null

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          backgroundColor: tokens.bgElev,
          borderTopColor: tokens.hairline,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>Permissions</Text>
        <Pressable onPress={dismiss} hitSlop={8}>
          <X size={14} color={tokens.fg3} strokeWidth={1.6} />
        </Pressable>
      </View>
      <Text style={styles.title}>{t('pushPrompt.title')}</Text>
      <Text style={styles.description}>{t('pushPrompt.description')}</Text>
      {showRetryHint && (
        <Text style={styles.retryText}>{t('pushPrompt.retryHint')}</Text>
      )}
      <View style={styles.buttons}>
        <Pressable onPress={dismiss} hitSlop={6}>
          <Text style={styles.laterText}>{t('pushPrompt.later')}</Text>
        </Pressable>
        <Pressable onPress={handleEnable} hitSlop={6}>
          <Text style={styles.enableText}>{t('pushPrompt.enable')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    wrapper: {
      position: 'absolute',
      bottom: 80,
      left: 0,
      right: 0,
      zIndex: 50,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderTopWidth: 1,
      gap: 8,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    eyebrow: {
      fontFamily: 'Geist',
      fontSize: 12,
      fontWeight: '600',
      color: tokens.fg3,
    },
    title: {
      fontFamily: 'Geist',
      fontSize: 16,
      color: tokens.fg1,
    },
    description: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontStyle: 'italic',
      lineHeight: 19,
      color: tokens.fg3,
    },
    retryText: {
      fontFamily: 'Geist',
      fontSize: 12,
      color: tokens.statusOverdue,
    },
    buttons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 22,
      paddingTop: 4,
    },
    laterText: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg3,
    },
    enableText: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg1,
      textDecorationLine: 'underline',
    },
  })
}
