'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Profile } from '@orbit/shared/types/profile'
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
} from '@/components/ui/icons'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ProfileSettingsFrame } from '@/components/profile/profile-settings-frame'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { ListRow } from '@/components/ui/list-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { useAuthStore } from '@/stores/auth-store'
import { useIsClient } from '@/hooks/use-is-client'
import { usePushNotificationPreferences } from '@/hooks/use-push-notification-preferences'
import { MarketingConsentSection } from '@/app/(app)/preferences/_components/marketing-consent-section'
import { PushNotificationSection } from '@/app/(app)/preferences/_components/push-notification-section'
import { PreferencePickerSheet, type PreferencePicker } from '@/app/(app)/preferences/_components/preference-picker-sheet'
import { usePreferenceControls } from '@/app/(app)/preferences/_components/use-preference-controls'
import { DeleteAccountModal } from './delete-account-modal'
import { EditNameSheet } from './edit-name-sheet'
import { FreshStartModal } from './fresh-start-modal'
import { useDataExport } from './use-data-export'

interface ProfileSettingsContentProps {
  profile: Profile | undefined
  isLoading: boolean
}

type Translate = ReturnType<typeof useTranslations>
type Router = ReturnType<typeof useRouter>

interface RowContext {
  profile: Profile | undefined
  router: Router
  t: Translate
}

const icon = (Icon: typeof User) => (
  <Icon size={24} strokeWidth={1.8} color="var(--fg-1)" />
)

function buildYouRows(
  { profile, router, t }: RowContext,
  onEditName: () => void,
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
    <ListRow key="account" icon={icon(User)} title={profile?.name ?? t('profile.editName.title')} accessibilityLabel={t('profile.settingsRows.editName', { name: profile?.name ?? '', email: profile?.email ?? '' })} description={profile?.email} onClick={onEditName} />,
    <ListRow key="language" icon={icon(Languages)} title={t('profile.language.title')} onClick={() => router.push('/preferences')} />,
    <ListRow key="timezone" icon={icon(Clock)} title={t('profile.settingsRows.timezone')} accessibilityLabel={timeZoneLabel} value={profile?.timeZone ?? undefined} onClick={onOpenTimeZone} />,
    <ListRow key="week-start" icon={icon(Calendar)} title={t('settings.weekStartDay.title')} onClick={() => router.push('/preferences')} />,
    <ListRow key="theme" icon={icon(Moon)} title={t('preferences.themeMode')} onClick={() => router.push('/preferences')} />,
    <ListRow key="plan" icon={icon(CreditCard)} title={t('profile.subscription.plan')} value={planLabel} onClick={() => router.push('/upgrade')} />,
  ]
}

function buildAstraRows({ profile, router, t }: RowContext) {
  return [
    <ListRow key="allowance" icon={icon(Satellite)} title={t('profile.settingsRows.dailyAllowance')} value={`${profile?.aiMessagesUsed ?? 0}/${profile?.aiMessagesLimit ?? 0}`} onClick={() => router.push('/upgrade')} />,
    <ListRow key="proactive" icon={icon(BellRing)} title={t('profile.proactiveAstra.title')} onClick={() => router.push('/ai-settings')} />,
    <ListRow key="summary" icon={icon(MessageSquare)} title={t('profile.aiSummary.title')} onClick={() => router.push('/ai-settings')} />,
    <ListRow key="api-keys" icon={icon(Lock)} title={t('profile.settingsRows.apiKeysMcp')} onClick={() => router.push('/advanced')} />,
  ]
}

function buildNotificationRows(
  t: Translate,
  push: ReturnType<typeof usePushNotificationPreferences>,
) {
  return [
    <MarketingConsentSection
      key="product-email"
      showSectionLabel={false}
      contained
      acceptVariant="secondary"
    />,
    <PushNotificationSection
      key="push"
      showSectionLabel={false}
      contained
      deviceLabel={t('profile.settingsRows.currentDevice')}
      deviceDescription={t('profile.settingsRows.pushDeviceLimit')}
      push={{
        supported: push.supported,
        subscribed: push.subscribed,
        permission: push.permission,
        loading: push.loading,
        status: push.status,
        onToggle: () => void push.togglePush(),
      }}
    />,
    <p
      key="habit-notifications"
      data-profile-notification-guidance
      className="m-0 px-1 font-sans text-sm leading-[1.55] text-[var(--fg-3)] [text-wrap:pretty]"
    >
      {t('profile.settingsRows.remindersNote')}
    </p>,
  ]
}

interface TimeZonePickerProps {
  controls: ReturnType<typeof usePreferenceControls>
  mounted: boolean
  profile: Profile | undefined
  t: Translate
}

function TimeZonePicker({ controls, mounted, profile, t }: Readonly<TimeZonePickerProps>) {
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
      activePicker={controls.activePicker}
      mounted={mounted}
      selectedLanguage={controls.selectedLanguage}
      currentTheme={controls.currentTheme}
      timeZone={profile?.timeZone}
      weekStartDay={profile?.weekStartDay}
      themeModeOptions={themeModeOptions}
      weekStartOptions={weekStartOptions}
      pickerTitles={pickerTitles}
      pickerDescriptions={{
        language: t('profile.language.description'),
        weekStart: t('settings.weekStartDay.description'),
      }}
      timeZoneSearchLabel={t('profile.timezonePicker.search')}
      timeZoneNoResultsLabel={t('profile.timezonePicker.noResults')}
      timeZoneShowMoreLabel={t('profile.timezonePicker.showMore')}
      onClose={() => controls.setActivePicker(null)}
      onLanguageChange={(locale) => void controls.handleLanguageChange(locale)}
      onThemeModeChange={controls.handleThemeModeChange}
      onTimeZoneChange={(timeZone) => controls.timeZoneMutation.mutate(timeZone)}
      onWeekStartChange={(day) => controls.weekStartMutation.mutate(day)}
    />
  )
}

function buildMoreRows({ profile, router, t }: RowContext) {
  return PROFILE_NAV_ITEMS.map((item) => (
    <ListRow
      key={item.id}
      icon={<ProfileNavIcon iconKey={item.iconKey} />}
      title={t(item.titleKey)}
      description={t(item.hintKey)}
      trailing={item.proBadge ? <ProBadge alwaysVisible /> : undefined}
      onClick={() => {
        router.push(shouldRedirectProfileNavItem(item, profile) ? '/upgrade' : item.route)
      }}
    />
  ))
}

interface EndingRowsOptions {
  context: RowContext
  exportError: string | null
  isExporting: boolean
  onDeleteAccount: () => void
  onExport: () => void
  onFreshStart: () => void
  onLogout: () => void
}

function buildEndingRows({
  context: { profile, t },
  exportError,
  isExporting,
  onDeleteAccount,
  onExport,
  onFreshStart,
  onLogout,
}: EndingRowsOptions) {
  return [
    <ListRow key="export" icon={icon(Download)} title={isExporting ? t('dataExport.preparing') : t('dataExport.button')} description={exportError ?? undefined} chevron={false} onClick={onExport} />,
    <ShareCardEntryButton key="share" variant="row" displayName={profile?.name} />,
    <ListRow key="fresh-start" icon={icon(RotateCcw)} title={t('profile.freshStart.button')} chevron={false} onClick={onFreshStart} />,
    <ListRow key="logout" icon={icon(LogOut)} title={t('profile.logout')} chevron={false} onClick={onLogout} />,
    <ListRow key="delete" icon={icon(UserX)} title={t('profile.deleteAccount.button')} danger chevron={false} onClick={onDeleteAccount} />,
  ]
}

export function ProfileSettingsContent({
  profile,
  isLoading,
}: Readonly<ProfileSettingsContentProps>) {
  const t = useTranslations()
  const router = useRouter()
  const mounted = useIsClient()
  const logout = useAuthStore((state) => state.logout)
  const preferenceControls = usePreferenceControls()
  const push = usePushNotificationPreferences()
  const { isExporting, exportError, exportData } = useDataExport()
  const [showEditName, setShowEditName] = useState(false)
  const [showFreshStart, setShowFreshStart] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const context = { profile, router, t }
  const rows = {
    you: buildYouRows(
      context,
      () => setShowEditName(true),
      () => preferenceControls.setActivePicker('timeZone'),
    ),
    astra: buildAstraRows(context),
    notifications: buildNotificationRows(t, push),
    more: buildMoreRows(context),
    ending: buildEndingRows({
      context,
      exportError,
      isExporting,
      onDeleteAccount: () => setShowDeleteAccount(true),
      onExport: () => void exportData(),
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
      <EditNameSheet open={showEditName} onOpenChange={setShowEditName} />
      <FreshStartModal open={showFreshStart} onOpenChange={setShowFreshStart} />
      <DeleteAccountModal open={showDeleteAccount} onOpenChange={setShowDeleteAccount} profile={profile} />
      <TimeZonePicker
        controls={preferenceControls}
        mounted={mounted}
        profile={profile}
        t={t}
      />
    </>
  )
}
