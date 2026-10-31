import { SPACING } from '@orbit/shared/theme'

import { ActionRow } from '@/components/ui/action-row'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { nativeBuildVersion } from 'expo-application'
import { captureAndroidUpdateSheetShown } from '@/lib/posthog'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import {
  startAndroidUpdate,
  useAndroidFlexibleUpdate,
  useVersionCheck,
} from '@/hooks/use-version-check'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const SNOOZE_STORAGE_KEY = 'orbit:version-update-snoozed-until'
const SNOOZE_DURATION_MS = 1000 * 60 * 60 * 24

interface UpdateSnooze {
  until: number
  versionCode: string | null
}

function parseUpdateSnooze(value: string | null): UpdateSnooze | null {
  if (!value) return null
  if (Platform.OS !== 'android') {
    const until = Number.parseInt(value, 10)
    return Number.isFinite(until) ? { until, versionCode: null } : null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null ||
      !('until' in parsed) || typeof parsed.until !== 'number' || !Number.isFinite(parsed.until) ||
      !('versionCode' in parsed) || typeof parsed.versionCode !== 'string') return null
    return { until: parsed.until, versionCode: parsed.versionCode }
  } catch {
    return null
  }
}

function useUpdateSnooze(offeredVersion: string | null) {
  const versionCode = Platform.OS === 'android' ? offeredVersion : null
  const [snooze, setSnooze] = useState<UpdateSnooze | null>(null)
  const [snoozeLoaded, setSnoozeLoaded] = useState(false)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>()
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(SNOOZE_STORAGE_KEY).then((value) => {
      if (cancelled) return
      setSnooze(parseUpdateSnooze(value))
      setSnoozeLoaded(true)
    }).catch(() => {
      if (!cancelled) setSnoozeLoaded(true)
    })
    return () => { cancelled = true }
  }, [])
  const dismissUpdate = useCallback(() => setDismissedVersion(versionCode), [versionCode])
  const snoozeUpdate = useCallback(() => {
    const next = { until: Date.now() + SNOOZE_DURATION_MS, versionCode }
    setSnooze(next)
    setDismissedVersion(versionCode)
    const stored = Platform.OS === 'android' ? JSON.stringify(next) : String(next.until)
    AsyncStorage.setItem(SNOOZE_STORAGE_KEY, stored).catch(() => {})
  }, [versionCode])
  return {
    snoozeLoaded,
    isSnoozed: snooze !== null && snooze.versionCode === versionCode && snooze.until > nowMs,
    dismissedForSession: dismissedVersion !== undefined && dismissedVersion === versionCode,
    dismissUpdate,
    snoozeUpdate,
  }
}

interface VersionUpdateSheetProps {
  open: boolean
  title: string
  description: string
  actionLabel: string
  styles: ReturnType<typeof createStyles>
  onAction: () => void
  onLater: () => void
}

function VersionUpdateSheet({
  open,
  title,
  description,
  actionLabel,
  styles,
  onAction,
  onLater,
}: Readonly<VersionUpdateSheetProps>) {
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  if (!open) return null

  return (
    <Sheet ref={sheetRef} open onClose={onLater} title={title} actions={
      <View style={styles.buttons}><ActionRow>
        <PillButton size="sm" variant="ghost" onClick={() => closeSheet()}>{t('versionUpdate.laterCta')}</PillButton>
        <PillButton size="sm" onClick={() => closeSheet(onAction)}>{actionLabel}</PillButton>
      </ActionRow></View>
    }>
      <Text style={styles.description}>{description}</Text>
    </Sheet>
  )
}

export function VersionUpdateDrawer() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const {
    updateAvailable,
    androidDownloaded,
    forceUpdate,
    iosStoreUrl,
    latestVersion,
    androidCheck,
  } = useVersionCheck()

  const androidImmediateStartedRef = useRef(false)
  const [androidRequested, setAndroidRequested] = useState(false)
  const [androidRestartDismissed, setAndroidRestartDismissed] = useState(false)
  const { snoozeLoaded, isSnoozed, dismissedForSession, dismissUpdate, snoozeUpdate } = useUpdateSnooze(latestVersion)

  const androidFlexibleActive =
    Platform.OS === 'android' &&
    androidRequested &&
    updateAvailable &&
    !forceUpdate

  const restoreAndroidAction = useCallback(() => setAndroidRequested(false), [])
  const { downloaded: androidUpdateReady, install: installAndroidUpdate } =
    useAndroidFlexibleUpdate(androidFlexibleActive, restoreAndroidAction)

  useEffect(() => {
    if (Platform.OS !== 'android' || !updateAvailable || !forceUpdate) return
    if (androidImmediateStartedRef.current) return
    androidImmediateStartedRef.current = true
    void startAndroidUpdate({ immediate: true })
  }, [updateAvailable, forceUpdate])

  const shouldShowIosSheet =
    Platform.OS === 'ios' &&
    updateAvailable &&
    !!iosStoreUrl &&
    snoozeLoaded &&
    !isSnoozed &&
    !dismissedForSession

  const handleIosUpdate = useCallback(() => {
    if (!iosStoreUrl) return
    void Linking.openURL(iosStoreUrl).catch(() => {})
    dismissUpdate()
  }, [iosStoreUrl, dismissUpdate])

  const handleAndroidLater = () => setAndroidRestartDismissed(true)
  const androidReady = androidDownloaded || androidUpdateReady
  const androidSoftOpen = updateAvailable && !forceUpdate && snoozeLoaded && !isSnoozed && !dismissedForSession && !androidRequested
  const androidSheet = androidReady ? (androidRestartDismissed ? null : 'ready') : (androidSoftOpen ? 'available' : null)
  const offeredCode = androidCheck && 'versionCode' in androidCheck.other ? androidCheck.other.versionCode : null
  useEffect(() => {
    if (Platform.OS !== 'android' || !androidSheet) return
    captureAndroidUpdateSheetShown({
      sheet: androidSheet, available_version_code: offeredCode, installed_version_code: Number(nativeBuildVersion),
    })
  }, [androidSheet, offeredCode])

  if (Platform.OS === 'android') {
    return <AndroidVersionUpdateSheet ready={androidReady} restartDismissed={androidRestartDismissed}
      softOpen={androidSoftOpen}
      styles={styles} install={installAndroidUpdate} request={() => setAndroidRequested(true)}
      later={snoozeUpdate} restartLater={handleAndroidLater} />
  }

  if (Platform.OS !== 'ios') return null

  return (
    <VersionUpdateSheet
      open={shouldShowIosSheet}
      title={t('versionUpdate.title')}
      description={t('versionUpdate.description')}
      actionLabel={t('versionUpdate.updateCta')}
      styles={styles}
      onAction={handleIosUpdate}
      onLater={snoozeUpdate}
    />
  )
}

function AndroidVersionUpdateSheet({ ready, softOpen, restartDismissed, styles, install, request, later, restartLater }: Readonly<{
  ready: boolean; softOpen: boolean; restartDismissed: boolean
  styles: ReturnType<typeof createStyles>
  install: () => void; request: () => void; later: () => void; restartLater: () => void
}>) {
  const { t } = useTranslation()
  return <VersionUpdateSheet open={ready ? !restartDismissed : softOpen}
    title={t(ready ? 'versionUpdate.readyTitle' : 'versionUpdate.title')}
    description={t(ready ? 'versionUpdate.readyDescription' : 'versionUpdate.description')}
    actionLabel={t(ready ? 'versionUpdate.restartCta' : 'versionUpdate.updateCta')}
    styles={styles} onAction={ready ? install : request} onLater={ready ? restartLater : later} />
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    description: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24.8,
      color: tokens.fg2,
    },
    buttons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingTop: SPACING.s8,
    },
  })
}
