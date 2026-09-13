import { useMemo, useState } from 'react'
import { Linking, StyleSheet, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { Profile } from '@orbit/shared/types/profile'
import { useShellNoticeSlot } from '@orbit/shared/hooks'
import { buildWeekStartOptions } from '@orbit/shared/utils'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import {
  BellRing,
  Calendar,
  Clock,
  CreditCard,
  Download,
  Languages,
  Lock,
  LogOut,
  MessageSquare,
  Moon,
  RotateCcw,
  Satellite,
  User,
  UserX,
  type Icon,
} from '@/components/ui/icons'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ProfileSettingsFrame } from '@/components/profile/profile-settings-frame'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { ListRow } from '@/components/ui/list-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { Toast } from '@/components/ui/app-toast'
import { useLogout } from '@/hooks/use-logout'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { createTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { usePreferenceControls } from '@/app/use-preference-controls'
import { MarketingConsentSection } from '@/components/marketing-consent/marketing-consent-section'
import {
  PreferencePickerSheet,
  PushNotificationSection,
  type PreferencePicker,
} from '@/components/profile/preferences-sections'
import { useSheetHost } from '@/components/ui/sheet'
import { DeleteAccountModal } from './delete-account-modal'
import { EditNameSheet } from './edit-name-sheet'
import { FreshStartModal } from './fresh-start-modal'
import { useDataExport } from './use-data-export'

interface ProfileSettingsContentProps {
  profile: Profile | undefined
  isLoading: boolean
}

type Translate = ReturnType<typeof useTranslation>['t']
type Router = ReturnType<typeof useRouter>
type Tokens = ReturnType<typeof createTokensV2>

interface RowContext {
  profile: Profile | undefined
  router: Router
  t: Translate
  tokens: Tokens
}

const icon = (IconComponent: Icon, color: string) => (
  <IconComponent size={24} strokeWidth={1.8} color={color} />
)

function buildYouRows(
  { profile, router, t, tokens }: RowContext,
  exportError: string,
  isExporting: boolean,
  onEditName: () => void,
  onExport: () => void,
  onOpenTimeZone: () => void,
) {
  const planLabel = profile?.isTrialActive
    ? t('profile.subscription.trial')
    : profile?.hasProAccess
      ? t('profile.subscription.pro')
      : t('profile.subscription.free')
  const timeZoneLabel = profile?.timeZone
    ? t('profile.settingsRows.timezoneValue', { timeZone: profile.timeZone })
    : t('profile.settingsRows.timezone')

  return [
    /* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */
    <ListRow key="account" icon={icon(User, tokens.fg1)} title={profile?.name ?? t('profile.editName.title')} accessibilityLabel={t('profile.settingsRows.editName', { name: profile?.name ?? '', email: profile?.email ?? '' })} description={profile?.email} onClick={onEditName} />,
    <ListRow key="language" icon={icon(Languages, tokens.fg1)} title={t('profile.language.title')} onClick={() => router.push('/preferences')} />,
    /* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */
    <ListRow key="timezone" icon={icon(Clock, tokens.fg1)} title={t('profile.settingsRows.timezone')} accessibilityLabel={timeZoneLabel} value={profile?.timeZone ?? undefined} onClick={onOpenTimeZone} />,
    /* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */
    <ListRow key="week-start" icon={icon(Calendar, tokens.fg1)} title={t('settings.weekStartDay.title')} onClick={() => router.push('/preferences')} />,
    <ListRow key="theme" icon={icon(Moon, tokens.fg1)} title={t('preferences.themeMode')} onClick={() => router.push('/preferences')} />,
    <ListRow key="plan" icon={icon(CreditCard, tokens.fg1)} title={t('profile.subscription.plan')} value={planLabel} onClick={() => router.push(buildUpgradeHref('/profile'))} />,
    /* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */
    <ListRow key="export" icon={icon(Download, tokens.fg1)} title={t('dataExport.button')} value={isExporting ? t('dataExport.preparing') : undefined} description={exportError || undefined} chevron={false} onClick={onExport} />,
  ]
}

function buildAstraRows({ profile, router, t, tokens }: RowContext) {
  return [
    /* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */
    <ListRow key="allowance" icon={icon(Satellite, tokens.fg1)} title={t('profile.settingsRows.dailyAllowance')} value={`${profile?.aiMessagesUsed ?? 0}/${profile?.aiMessagesLimit ?? 0}`} onClick={() => router.push(buildUpgradeHref('/profile'))} />,
    <ListRow key="proactive" icon={icon(BellRing, tokens.fg1)} title={t('profile.proactiveAstra.title')} onClick={() => router.push('/ai-settings')} />,
    <ListRow key="summary" icon={icon(MessageSquare, tokens.fg1)} title={t('profile.aiSummary.title')} onClick={() => router.push('/ai-settings')} />,
    /* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */
    <ListRow key="api-keys" icon={icon(Lock, tokens.fg1)} title={t('profile.settingsRows.apiKeysMcp')} onClick={() => router.push('/advanced')} />,
  ]
}

async function togglePush(push: ReturnType<typeof usePushNotifications>) {
  if (push.isEnabled) {
    await push.disablePushNotifications()
    return
  }
  if (push.permissionStatus === 'denied') {
    await Linking.openSettings().catch(() => {})
    return
  }
  await push.requestPermission()
}

function buildNotificationRows(
  t: Translate,
  tokens: Tokens,
  push: ReturnType<typeof usePushNotifications>,
) {
  return [
    <MarketingConsentSection key="product-email" showSectionLabel={false} contained />,
    <PushNotificationSection
      key="push"
      tokens={tokens}
      t={t}
      showSectionLabel={false}
      contained
      deviceLabel={t('profile.settingsRows.currentDevice')}
      deviceDescription={t('profile.settingsRows.pushDeviceLimit')}
      pushSupported={push.isSupported}
      pushEnabled={push.isEnabled}
      pushRegistered={push.isRegistered}
      pushLoading={push.isLoading}
      permissionStatus={push.permissionStatus}
      registrationStatus={push.registrationStatus}
      onToggle={() => void togglePush(push)}
      onOpenSettings={() => void Linking.openSettings().catch(() => {})}
    />,
    <Text
      key="habit-notifications"
      style={[styles.notificationGuidance, { color: tokens.fg3 }]}
    >
      {t('profile.settingsRows.remindersNote')}
    </Text>,
  ]
}

const styles = StyleSheet.create({
  notificationGuidance: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21.7,
    paddingHorizontal: 4,
  },
})

interface TimeZonePickerProps {
  controls: ReturnType<typeof usePreferenceControls>
  profile: Profile | undefined
  t: Translate
  tokens: Tokens
}

function TimeZonePicker({ controls, profile, t, tokens }: Readonly<TimeZonePickerProps>) {
  const { sheetRef, closeSheet } = useSheetHost()
  const weekStartOptions = buildWeekStartOptions(t)
  const themeModeOptions = [
    { value: 'dark' as const, label: t('preferences.themeModeDark') },
    { value: 'light' as const, label: t('preferences.themeModeLight') },
  ]
  const pickerTitles: Record<PreferencePicker, string> = {
    language: t('profile.language.title'),
    theme: t('preferences.themeMode'),
    timeZone: t('profile.settingsRows.timezone'),
    weekStart: t('settings.weekStartDay.title'),
  }

  return (
    <PreferencePickerSheet
      tokens={tokens}
      activePicker={controls.activePicker}
      pickerTitles={pickerTitles}
      pickerDescriptions={{
        language: t('profile.language.description'),
        weekStart: t('settings.weekStartDay.description'),
      }}
      timeZoneSearchLabel={t('profile.timezonePicker.search')}
      timeZoneNoResultsLabel={t('profile.timezonePicker.noResults')}
      timeZoneShowMoreLabel={t('profile.timezonePicker.showMore')}
      selectedLanguage={controls.selectedLanguage}
      currentTheme={controls.currentTheme}
      timeZone={profile?.timeZone}
      weekStartDay={profile?.weekStartDay}
      themeModeOptions={themeModeOptions}
      weekStartOptions={weekStartOptions}
      sheetRef={sheetRef}
      closePicker={closeSheet}
      onHidden={() => controls.setActivePicker(null)}
      onLanguageChange={(locale) => void controls.handleLanguageChange(locale)}
      onThemeModeChange={controls.handleThemeModeChange}
      onTimeZoneChange={(timeZone) => controls.timeZoneMutation.mutate(timeZone)}
      onWeekStartChange={(day) => controls.weekStartMutation.mutate(day)}
    />
  )
}

function buildMoreRows({ profile, router, t, tokens }: RowContext) {
  return PROFILE_NAV_ITEMS.map((item) => (
    <ListRow
      key={item.id}
      icon={<ProfileNavIcon iconKey={item.iconKey} color={tokens.fg1} />}
      title={t(item.titleKey)}
      description={t(item.hintKey)}
      trailing={item.proBadge ? <ProBadge alwaysVisible /> : undefined}
      onClick={() => {
        router.push(
          shouldRedirectProfileNavItem(item, profile)
            ? buildUpgradeHref('/profile')
            : item.route,
        )
      }}
    />
  ))
}

interface EndingRowsOptions {
  context: RowContext
  onDeleteAccount: () => void
  onFreshStart: () => void
  onLogout: () => void
}

function buildEndingRows({
  context: { profile, t, tokens },
  onDeleteAccount,
  onFreshStart,
  onLogout,
}: EndingRowsOptions) {
  return [
    <ShareCardEntryButton key="share" displayName={profile?.name} />,
    <ListRow key="fresh-start" icon={icon(RotateCcw, tokens.fg1)} title={t('profile.freshStart.button')} chevron={false} onClick={onFreshStart} />,
    <ListRow key="logout" icon={icon(LogOut, tokens.fg1)} title={t('profile.logout')} chevron={false} onClick={onLogout} />,
    <ListRow key="delete" icon={icon(UserX, tokens.fg1)} title={t('profile.deleteAccount.button')} danger chevron={false} onClick={onDeleteAccount} />,
  ]
}

export function ProfileSettingsContent({
  profile,
  isLoading,
}: Readonly<ProfileSettingsContentProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const logout = useLogout()
  const preferenceControls = usePreferenceControls()
  const push = usePushNotifications()
  const tokens = useMemo(
    () => createTokensV2(preferenceControls.currentScheme, preferenceControls.currentTheme),
    [preferenceControls.currentScheme, preferenceControls.currentTheme],
  )
  const {
    isExporting,
    exportDone,
    exportError,
    exportData,
    clearExportDone,
  } = useDataExport()
  const [showEditName, setShowEditName] = useState(false)
  const [showFreshStart, setShowFreshStart] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  useShellNoticeSlot(
    exportDone,
    () => (
      <Toast
        kind="done"
        message={t('dataExport.done')}
        onDone={clearExportDone}
      />
    ),
    exportDone ? 'export-done' : 'export-idle',
  )
  const context = { profile, router, t, tokens }
  const rows = {
    you: buildYouRows(
      context,
      exportError,
      isExporting,
      () => setShowEditName(true),
      () => void exportData(),
      () => preferenceControls.setActivePicker('timeZone'),
    ),
    astra: buildAstraRows(context),
    notifications: buildNotificationRows(t, tokens, push),
    more: buildMoreRows(context),
    ending: buildEndingRows({
      context,
      onDeleteAccount: () => setShowDeleteAccount(true),
      onFreshStart: () => setShowFreshStart(true),
      onLogout: () => void logout(),
    }),
  }

  return (
    <>
      <ProfileSettingsFrame
        isLoading={isLoading}
        loadingLabel={t('profile.loading')}
        labels={{
          you: t('profile.groups.you'),
          astra: t('profile.groups.astra'),
          notifications: t('profile.groups.notifications'),
          more: t('profile.groups.more'),
          ending: t('profile.groups.ending'),
        }}
        rows={rows}
        uncontainedGroups={['notifications']}
      />
      <EditNameSheet open={showEditName} onClose={() => setShowEditName(false)} />
      <FreshStartModal open={showFreshStart} onClose={() => setShowFreshStart(false)} />
      <DeleteAccountModal open={showDeleteAccount} onClose={() => setShowDeleteAccount(false)} profile={profile} />
      <TimeZonePicker
        controls={preferenceControls}
        profile={profile}
        t={t}
        tokens={tokens}
      />
    </>
  )
}
