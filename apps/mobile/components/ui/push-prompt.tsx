import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BellRing, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'orbit_push_prompted'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PushPrompt() {
  const { t } = useTranslation()
  const { colors, shadows } = useAppTheme()
  const {
    isEnabled,
    isSupported,
    permissionStatus,
    requestPermission,
  } = usePushNotifications()
  const [show, setShow] = useState(false)
  const autoRequestedRef = useRef(false)
  const [fadeAnim] = useState(() => new Animated.Value(0))
  const [slideAnim] = useState(() => new Animated.Value(20))
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])

  useEffect(() => {
    if (!isSupported || permissionStatus === null || permissionStatus === 'denied' || isEnabled) {
      setShow(false)
      return
    }

    if (
      permissionStatus === 'undetermined' &&
      !autoRequestedRef.current
    ) {
      autoRequestedRef.current = true
      const doRequest = () =>
        requestPermission().finally(() => {
          AsyncStorage.setItem(STORAGE_KEY, '1')
        })
      if (Platform.OS === 'android') {
        setTimeout(doRequest, 200)
      } else {
        doRequest()
      }
      return
    }

    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === '1') return

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
    })
  }, [
    fadeAnim,
    isEnabled,
    isSupported,
    permissionStatus,
    requestPermission,
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
    AsyncStorage.setItem(STORAGE_KEY, '1')
  }, [fadeAnim, slideAnim])

  const handleEnable = useCallback(async () => {
    try {
      await requestPermission()
    } catch {
      // Permission request failed silently
    }
    dismiss()
  }, [requestPermission, dismiss])

  if (!show) return null

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <BellRing size={20} color={colors.primary} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{t('pushPrompt.title')}</Text>
          <Text style={styles.description}>{t('pushPrompt.description')}</Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.enableBtn}
              activeOpacity={0.8}
              onPress={handleEnable}
            >
              <Text style={styles.enableBtnText}>{t('pushPrompt.enable')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.laterBtn}
              activeOpacity={0.7}
              onPress={dismiss}
            >
              <Text style={styles.laterBtnText}>{t('pushPrompt.later')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          activeOpacity={0.7}
          onPress={dismiss}
        >
          <X size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  shadows: ReturnType<typeof useAppTheme>['shadows'],
) {
  return StyleSheet.create({
    wrapper: {
      position: 'absolute',
      bottom: 96,
      left: 16,
      right: 16,
      zIndex: 50,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: colors.surfaceOverlay,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.lg,
      padding: 16,
      ...shadows.lg,
      elevation: 8,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary_10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textContainer: {
      flex: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    description: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    buttons: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    enableBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    enableBtnText: {
      color: colors.white,
      fontSize: 12,
      fontWeight: '700',
    },
    laterBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.full,
    },
    laterBtnText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    closeBtn: {
      padding: 4,
    },
  })
}
