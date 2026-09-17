import { useMemo, useState, useEffect, useCallback } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { refreshSession, useAuthStore } from '@/stores/auth-store'
import { useLogout } from '@/hooks/use-logout'
import { createTokensV2, shadowsV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const WARN_AT_MINUTES = 5

type RefreshState = 'ready' | 'refreshing' | 'network-error' | 'rejected'

function stripTrailingPeriod(text: string): string {
  const trimmed = text.trimEnd()
  return (trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed).trimEnd()
}

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
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const expiresAt = useAuthStore((s) => s.expiresAt)
  const handleLogout = useLogout()
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)
  const [isExpired, setIsExpired] = useState(false)
  const [refreshState, setRefreshState] = useState<RefreshState>('ready')

  const [prevExpiresAt, setPrevExpiresAt] = useState(expiresAt)
  if (expiresAt !== prevExpiresAt) {
    setPrevExpiresAt(expiresAt)
    if (expiresAt || refreshState !== 'rejected') {
      setRefreshState('ready')
    }
    if (!expiresAt) {
      setMinutesLeft(null)
      setIsExpired(false)
    }
  }

  useEffect(() => {
    if (!expiresAt) return

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

  const isTerminal = refreshState === 'rejected'

  const handleAction = useCallback(async () => {
    if (!isExpired || isTerminal) {
      await handleLogout()
      return
    }

    if (refreshState === 'refreshing') return

    setRefreshState('refreshing')
    const outcome = await refreshSession({ clearOnFailure: false })

    switch (outcome.status) {
      case 'refreshed':
        setRefreshState('ready')
        return
      case 'network-error':
        setRefreshState('network-error')
        return
      case 'superseded':
        return
      case 'unauthorized':
        setRefreshState('rejected')
        await handleLogout()
    }
  }, [handleLogout, isExpired, isTerminal, refreshState])

  if (minutesLeft === null && !isExpired && !isTerminal) return null

  const expiredMessage = isTerminal
    ? t('auth.sessionSignedOut')
    : refreshState === 'network-error'
      ? t('auth.sessionRefreshFailed')
      : t('auth.sessionExpired')

  return (
    <View style={styles.wrapper} accessibilityRole="alert">
      <View style={styles.banner}>
        <Text style={styles.text}>
          {isExpired || isTerminal ? (
            <Text style={styles.urgent}>{expiredMessage}</Text>
          ) : (
            <>
              {stripTrailingPeriod(t('auth.sessionExpiring', { minutes: '' }))}{' '}
              <Text style={styles.monoCount}>
                {`${minutesLeft ?? 0} min`}
              </Text>
            </>
          )}
        </Text>
        <Pressable
          onPress={() => void handleAction()}
          disabled={refreshState === 'refreshing'}
          hitSlop={6}
          style={styles.actionPress}
          accessibilityRole="button"
          accessibilityState={{
            busy: refreshState === 'refreshing',
            disabled: refreshState === 'refreshing',
          }}
        >
          {refreshState === 'refreshing' ? (
            <ActivityIndicator size={14} color={tokens.fg1} />
          ) : null}
          <Text style={styles.actionText}>
            {isTerminal ? t('auth.login') : t('auth.refresh')}
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
      fontFamily: 'Geist_400Regular',
      fontSize: 13,
      color: tokens.fg2,
    },
    urgent: {
      color: tokens.statusOverdueText,
    },
    monoCount: {
      fontFamily: 'GeistMono_400Regular',
      fontVariant: ['tabular-nums'],
      color: tokens.statusOverdueText,
    },
    actionPress: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    actionText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 13,
      color: tokens.fg1,
      textDecorationLine: 'underline',
    },
  })
}
