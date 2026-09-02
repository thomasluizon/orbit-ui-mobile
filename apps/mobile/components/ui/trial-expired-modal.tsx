import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTrialExpired } from '@/hooks/use-profile'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { PillButton } from '@/components/ui/pill-button'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

const STORAGE_KEY = 'orbit_trial_expired_seen'

const PAUSED_FEATURES = [
  'trial.expired.astraCeiling',
  'trial.expired.calendarSync',
  'trial.expired.retrospective',
  'trial.expired.proactiveAstra',
] as const

export function TrialExpiredModal() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(createStyles, [])
  const { sheetRef, closeSheet } = useSheetHost()
  const trialExpired = useTrialExpired()
  const [dismissed, setDismissed] = useState(false)
  const [alreadySeen, setAlreadySeen] = useState(true)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      setAlreadySeen(value === '1')
    })
  }, [])

  const isOpen =
    pathname !== '/upgrade' && !dismissed && trialExpired && !alreadySeen

  const hide = useCallback(() => {
    setDismissed(true)
    void AsyncStorage.setItem(STORAGE_KEY, '1')
  }, [])

  if (!isOpen) return null

  return (
    <Sheet
      ref={sheetRef}
      open
      onClose={hide}
      title={t('trial.expired.heading')}
      actions={
        <View style={styles.actions}>
          <PillButton
            onClick={() =>
              closeSheet(() => {
                hide()
                router.push(buildUpgradeHref(pathname || '/'))
              })
            }
          >
            {t('trial.expired.subscribe')}
          </PillButton>
          <PillButton variant="ghost" onClick={() => closeSheet()}>
            {t('trial.expired.continueFree')}
          </PillButton>
        </View>
      }
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>
            {t('trial.expired.eyebrow')}
          </Text>
          <Text style={[styles.subtitle, { color: tokens.fg2 }]}>
            {t('trial.expired.subtitleQuiet')}
          </Text>
        </View>

        <SettingsGroup>
          {PAUSED_FEATURES.map((featureKey) => (
            <SettingsGroupRow
              key={featureKey}
              label={t(featureKey)}
              trailing={
                <Text style={[styles.paused, { color: tokens.fg3 }]}>
                  {t('trial.expired.paused')}
                </Text>
              }
            />
          ))}
        </SettingsGroup>
      </View>
    </Sheet>
  )
}

function createStyles() {
  return StyleSheet.create({
    content: {
      gap: 24,
    },
    intro: {
      gap: 8,
    },
    eyebrow: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      lineHeight: 16,
      textTransform: 'uppercase',
    },
    subtitle: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24,
    },
    paused: {
      fontFamily: 'RobotoMono_400Regular',
      fontSize: 12,
    },
    actions: {
      flex: 1,
      gap: 8,
    },
  })
}
