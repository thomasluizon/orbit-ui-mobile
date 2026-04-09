import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { useVersionCheck } from '@/hooks/use-version-check'
import type { ThemeContextValue } from '@/lib/theme-provider'
import { useAppTheme } from '@/lib/use-app-theme'

const SNOOZE_STORAGE_KEY = 'orbit:version-update-snoozed-until'
const SNOOZE_DURATION_MS = 1000 * 60 * 60 * 24 // 24h

function formatTemplate(template: string, version: string): string {
  return template.replace('{version}', version)
}

async function openPlayStore(packageName: string): Promise<void> {
  const marketUrl = `market://details?id=${packageName}`
  const httpsUrl = `https://play.google.com/store/apps/details?id=${packageName}`
  try {
    const canOpenMarket = await Linking.canOpenURL(marketUrl)
    await Linking.openURL(canOpenMarket ? marketUrl : httpsUrl)
  } catch {
    try {
      await Linking.openURL(httpsUrl)
    } catch {
      // Swallow -- user can dismiss and try again.
    }
  }
}

export function VersionUpdateDrawer() {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { updateAvailable, latestVersion, currentVersion } = useVersionCheck()
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null)
  const [snoozeLoaded, setSnoozeLoaded] = useState(false)
  const [dismissedForSession, setDismissedForSession] = useState(false)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(SNOOZE_STORAGE_KEY)
      .then((value) => {
        if (cancelled) return
        const parsed = value ? Number.parseInt(value, 10) : NaN
        setSnoozedUntil(Number.isFinite(parsed) ? parsed : null)
        setSnoozeLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setSnoozeLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const packageName = Constants.expoConfig?.android?.package ?? null
  const isSnoozed = snoozedUntil !== null && snoozedUntil > Date.now()
  const shouldShow =
    Platform.OS === 'android' &&
    updateAvailable &&
    snoozeLoaded &&
    !isSnoozed &&
    !dismissedForSession &&
    !!packageName

  const handleUpdate = useCallback(() => {
    if (!packageName) return
    void openPlayStore(packageName)
    setDismissedForSession(true)
  }, [packageName])

  const handleLater = useCallback(() => {
    const until = Date.now() + SNOOZE_DURATION_MS
    setSnoozedUntil(until)
    setDismissedForSession(true)
    AsyncStorage.setItem(SNOOZE_STORAGE_KEY, String(until)).catch(() => {})
  }, [])

  return (
    <BottomSheetModal
      open={shouldShow}
      onClose={handleLater}
      title={t('versionUpdate.title')}
      snapPoints={['40%']}
    >
      <View style={styles.container}>
        <Text style={styles.description}>{t('versionUpdate.description')}</Text>

        {currentVersion ? (
          <Text style={styles.metaLine}>
            {formatTemplate(t('versionUpdate.currentLabel'), currentVersion)}
          </Text>
        ) : null}
        {latestVersion ? (
          <Text style={styles.metaLine}>
            {formatTemplate(t('versionUpdate.latestLabel'), latestVersion)}
          </Text>
        ) : null}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleUpdate}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonLabel}>{t('versionUpdate.updateCta')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleLater}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryButtonLabel}>{t('versionUpdate.laterCta')}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  )
}

type ThemeColors = ThemeContextValue['colors']

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 24,
      paddingBottom: 32,
      gap: 12,
    },
    description: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
    },
    metaLine: {
      fontSize: 13,
      color: colors.textMuted,
    },
    primaryButton: {
      marginTop: 16,
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryButtonLabel: {
      color: colors.textInverse,
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButton: {
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryButtonLabel: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '600',
    },
  })
}
