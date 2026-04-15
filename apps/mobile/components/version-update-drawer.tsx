import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { startAndroidUpdate, useVersionCheck } from '@/hooks/use-version-check'
import type { ThemeContextValue } from '@/lib/theme-provider'
import { useAppTheme } from '@/lib/use-app-theme'

const SNOOZE_STORAGE_KEY = 'orbit:version-update-snoozed-until'
const SNOOZE_DURATION_MS = 1000 * 60 * 60 * 24 // 24h

function formatTemplate(template: string, version: string): string {
  return template.replace('{version}', version)
}

export function VersionUpdateDrawer() {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const {
    updateAvailable,
    forceUpdate,
    latestVersion,
    currentVersion,
    iosStoreUrl,
  } = useVersionCheck()

  const androidFlowStartedRef = useRef(false)
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

  // Android: hand off to the native Play Core flow as soon as we detect an update.
  // For force updates (priority >= 4) we trigger IMMEDIATE, which is a full-screen,
  // non-dismissible Google-provided UI. Otherwise FLEXIBLE, which lets the user keep
  // using the app while the update downloads.
  useEffect(() => {
    if (Platform.OS !== 'android') return
    if (!updateAvailable) return
    if (androidFlowStartedRef.current) return
    if (!forceUpdate) {
      const isSnoozed = snoozedUntil !== null && snoozedUntil > Date.now()
      if (!snoozeLoaded || isSnoozed || dismissedForSession) return
    }
    androidFlowStartedRef.current = true
    void startAndroidUpdate({ immediate: forceUpdate })
    if (!forceUpdate) {
      const until = Date.now() + SNOOZE_DURATION_MS
      setSnoozedUntil(until)
      AsyncStorage.setItem(SNOOZE_STORAGE_KEY, String(until)).catch(() => {})
    }
  }, [updateAvailable, forceUpdate, snoozeLoaded, snoozedUntil, dismissedForSession])

  // iOS path: custom sheet with a link to the App Store. Apple provides no
  // in-app update API, so this is the standard approach.
  const shouldShowIosSheet = useMemo(() => {
    if (Platform.OS !== 'ios') return false
    if (!updateAvailable) return false
    if (!snoozeLoaded) return false
    const isSnoozed = snoozedUntil !== null && snoozedUntil > Date.now()
    return !isSnoozed && !dismissedForSession
  }, [updateAvailable, snoozeLoaded, snoozedUntil, dismissedForSession])

  const handleIosUpdate = useCallback(() => {
    if (!iosStoreUrl) return
    void Linking.openURL(iosStoreUrl).catch(() => {})
    setDismissedForSession(true)
  }, [iosStoreUrl])

  const handleIosLater = useCallback(() => {
    const until = Date.now() + SNOOZE_DURATION_MS
    setSnoozedUntil(until)
    setDismissedForSession(true)
    AsyncStorage.setItem(SNOOZE_STORAGE_KEY, String(until)).catch(() => {})
  }, [])

  if (Platform.OS !== 'ios') return null

  return (
    <BottomSheetModal
      open={shouldShowIosSheet}
      onClose={handleIosLater}
      title={t('versionUpdate.title')}
      snapPoints={['45%']}
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
          onPress={handleIosUpdate}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonLabel}>{t('versionUpdate.updateCta')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleIosLater}
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
