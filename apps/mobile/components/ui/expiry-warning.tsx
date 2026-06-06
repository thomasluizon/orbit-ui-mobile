import { useMemo, useState, useEffect, useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const WARN_AT_MINUTES = 5

/**
 * v8 expiry warning edge banner: hairline-divided strip with mono countdown
 * and "Refresh" / "Log in" link. Preserves the auth-store driven session
 * expiry watcher.
 */
export function ExpiryWarning() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
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

  return (
    <View style={styles.wrapper} accessibilityRole="alert">
      <View style={styles.banner}>
        <Text style={styles.text}>
          {isExpired ? (
            t('auth.sessionExpired')
          ) : (
            <>
              {t('auth.sessionExpiring', { minutes: '' }).replace(
                /\s*\.\s*$/,
                '',
              )}{' '}
              <Text style={styles.monoCount}>
                {`${minutesLeft ?? 0} min`}
              </Text>
            </>
          )}
        </Text>
        <Pressable onPress={handleLogin} hitSlop={6}>
          <Text style={styles.actionText}>
            {isExpired ? t('auth.login') : t('auth.refresh')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    wrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9998,
      paddingTop: 50,
      backgroundColor: tokens.bg,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: tokens.hairline,
      paddingHorizontal: 14,
      paddingVertical: 8,
      gap: 12,
    },
    text: {
      flex: 1,
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg2,
    },
    monoCount: {
      fontFamily: 'GeistMono',
      color: tokens.fg1,
    },
    actionText: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg1,
      textDecorationLine: 'underline',
      paddingVertical: 4,
    },
  })
}
