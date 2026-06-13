import { useMemo, useState, useEffect, useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { createTokensV2, shadowsV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const WARN_AT_MINUTES = 5

function mixHexOver(baseHex: string, tintHex: string, alpha: number): string {
  const channels = (hex: string) => {
    const normalized = hex.replace('#', '')
    return [
      Number.parseInt(normalized.slice(0, 2), 16),
      Number.parseInt(normalized.slice(2, 4), 16),
      Number.parseInt(normalized.slice(4, 6), 16),
    ]
  }
  const base = channels(baseHex)
  const tint = channels(tintHex)
  const toHexByte = (channel: number) => channel.toString(16).padStart(2, '0')
  return `#${base
    .map((value, index) => toHexByte(Math.round(value * (1 - alpha) + tint[index]! * alpha)))
    .join('')}`
}

function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Session expiry warning: floating amber-tinted card with a tabular countdown
 * and "Refresh" / "Log in" action. Preserves the auth-store driven session
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
            <Text style={styles.urgent}>{t('auth.sessionExpired')}</Text>
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
        <Pressable onPress={handleLogin} hitSlop={6} style={styles.actionPress}>
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
      paddingHorizontal: 10,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: rgbaFromHex(tokens.statusOverdue, 0.28),
      backgroundColor: mixHexOver(tokens.bg, tokens.statusOverdue, 0.1),
      paddingHorizontal: 14,
      paddingVertical: 10,
      ...shadowsV2.shadow2,
    },
    text: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg2,
    },
    urgent: {
      color: tokens.statusOverdueText,
    },
    monoCount: {
      fontFamily: 'Roboto_400Regular',
      fontVariant: ['tabular-nums'],
      color: tokens.statusOverdueText,
    },
    actionPress: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    actionText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
      textDecorationLine: 'underline',
    },
  })
}
