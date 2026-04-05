import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { colors, radius, shadows } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WARN_AT_MINUTES = 5

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpiryWarning() {
  const { t } = useTranslation()
  const router = useRouter()
  const expiresAt = useAuthStore((s) => s.expiresAt)
  const logout = useAuthStore((s) => s.logout)
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    if (!expiresAt) {
      setMinutesLeft(null)
      setIsExpired(false)
      return
    }

    const sessionExpiresAt = expiresAt

    function check() {
      const remaining = sessionExpiresAt - Date.now()
      const mins = Math.floor(remaining / 60000)

      if (remaining <= 0) {
        setIsExpired(true)
        setMinutesLeft(0)
      } else if (mins <= WARN_AT_MINUTES) {
        setMinutesLeft(mins)
        setIsExpired(false)
      } else {
        setMinutesLeft(null)
        setIsExpired(false)
      }
    }

    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const handleLogin = useCallback(async () => {
    await logout()
    router.replace('/login')
  }, [logout, router])

  if (minutesLeft === null && !isExpired) return null

  const isExpiredState = isExpired
  const accentColor = isExpiredState ? colors.red400 : colors.amber400
  const bgColor = isExpiredState ? colors.red500_10 : 'rgba(245,158,11,0.10)'
  const borderColor = isExpiredState ? colors.red500_30 : 'rgba(245,158,11,0.20)'

  return (
    <View
      style={styles.wrapper}
      accessibilityRole="alert"
    >
      <View
        style={[
          styles.banner,
          { backgroundColor: bgColor, borderColor },
        ]}
      >
        <AlertTriangle size={16} color={accentColor} />
        <Text style={[styles.text, { color: accentColor }]}>
          {isExpiredState
            ? t('auth.sessionExpired')
            : t('auth.sessionExpiring', { minutes: minutesLeft ?? 0 })}
        </Text>
        <TouchableOpacity activeOpacity={0.7} onPress={handleLogin}>
          <Text style={[styles.actionText, { color: accentColor }]}>
            {isExpiredState ? t('auth.login') : t('auth.refresh')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9998,
    paddingHorizontal: 16,
    paddingTop: 50, // account for safe area
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadows.lg,
    elevation: 8,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
})
