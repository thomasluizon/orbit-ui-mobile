import { View, Text, Pressable, ScrollView } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { Calendar, Check, Languages, Moon, Palette } from '@/components/ui/icons'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import {
  getNativePushStatusPresentation,
  LANGUAGE_OPTIONS,
  type NativePushRegistrationStatus,
} from '@orbit/shared/utils'
import type { NotificationPermissionStatus } from '@/lib/push-notification-permissions'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup } from '@/components/ui/settings-group'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { RadioRow } from '@/components/ui/select-check'
import { ProBadge } from '@/components/ui/pro-badge'
import { MarketingConsentSection } from '@/components/marketing-consent/marketing-consent-section'
import { styles, type Tokens } from './preferences-styles'

export type PreferencePicker = 'language' | 'theme' | 'scheme' | 'weekStart'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

type SchemeOption = (typeof colorSchemeOptions)[number]

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
    .reduceMotion(ReduceMotion.System)
}

interface PushNotificationSectionProps {
  tokens: Tokens
  t: TranslationFn
  pushSupported: boolean
  pushEnabled: boolean
  pushRegistered: boolean
  pushLoading: boolean
  permissionStatus: NotificationPermissionStatus | null
  registrationStatus: NativePushRegistrationStatus
  onToggle: () => void
  onOpenSettings: () => void
}

export function PushNotificationSection({
  tokens,
  t,
  pushSupported,
  pushEnabled,
  pushRegistered,
  pushLoading,
  permissionStatus,
  registrationStatus,
  onToggle,
  onOpenSettings,
}: Readonly<PushNotificationSectionProps>) {
  const pushStatusPresentation = getNativePushStatusPresentation({
    permissionStatus,
    registrationStatus,
    isEnabled: pushEnabled,
    isRegistered: pushRegistered,
  })
  const pushStatusText = t(pushStatusPresentation.messageKey)
  const accentStatusColor =
    pushStatusPresentation.tone === 'accent' ? tokens.primary : tokens.fg3
  const pushStatusColor =
    pushStatusPresentation.tone === 'critical' ? tokens.statusBad : accentStatusColor

  return (
    <>
      <SectionLabel bottom={4}>{t('settings.notifications.title')}</SectionLabel>
      {pushSupported ? (
        <>
          <SettingsRow
            label={t('settings.notifications.allowed')}
            accessory="none"
          >
            <Switch
              on={pushEnabled}
              onToggle={onToggle}
              disabled={pushLoading}
              accessibilityLabel={t('settings.notifications.title')}
            />
          </SettingsRow>
          <View style={styles.statusBlock}>
            <Text style={[styles.statusText, { color: pushStatusColor }]}>
              {pushStatusText}
            </Text>
          </View>
          {permissionStatus === 'denied' ? (
            <Pressable
              onPress={onOpenSettings}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.linkChip,
                {
                  backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                  borderColor: tokens.hairline,
                },
                pressed ? styles.linkChipPressed : null,
              ]}
            >
              <Text style={[styles.linkText, { color: tokens.fg2 }]}>
                {t('settings.notifications.openSettings')}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <View style={styles.statusBlock}>
          <Text style={[styles.statusText, { color: tokens.fg3 }]}>
            {t('settings.notifications.unsupportedNative')}
          </Text>
        </View>
      )}
    </>
  )
}

interface PersistentReminderControls {
  isSupported: boolean
  enabled: boolean
  isLoading: boolean
  onToggle: () => void
}

function PersistentReminderRow({
  t,
  enabled,
  isLoading,
  onToggle,
}: Readonly<{ t: TranslationFn } & Omit<PersistentReminderControls, 'isSupported'>>) {
  return (
    <SettingsRow
      label={t('persistentReminder.label')}
      desc={t('persistentReminder.description')}
      accessory="none"
    >
      <Switch
        on={enabled}
        onToggle={onToggle}
        disabled={isLoading}
        accessibilityLabel={t('persistentReminder.label')}
      />
    </SettingsRow>
  )
}

interface PreferenceSettingsListProps {
  tokens: Tokens
  t: TranslationFn
  languageLabel?: string
  themeLabel?: string
  schemeLabel?: string
  weekStartLabel?: string
  schemeOption?: SchemeOption
  showGeneralOnToday: boolean
  onOpenPicker: (picker: PreferencePicker) => void
  onToggleShowGeneral: () => void
  push: Omit<PushNotificationSectionProps, 'tokens' | 't'>
  persistentReminder: PersistentReminderControls
}

export function PreferenceSettingsList({
  tokens,
  t,
  languageLabel,
  themeLabel,
  schemeLabel,
  weekStartLabel,
  schemeOption,
  showGeneralOnToday,
  onOpenPicker,
  onToggleShowGeneral,
  push,
  persistentReminder,
}: Readonly<PreferenceSettingsListProps>) {
  return (
    <>
      <Animated.View entering={sectionEntrance(0)}>
        <SectionLabel bottom={4}>{t('preferences.general')}</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={Languages}
            label={t('profile.language.title')}
            value={languageLabel}
            onPress={() => onOpenPicker('language')}
          />
          <SettingsRow
            icon={Moon}
            label={t('preferences.themeMode')}
            value={themeLabel}
            onPress={() => onOpenPicker('theme')}
          />
          <SettingsRow
            icon={Palette}
            label={t('profile.colorScheme.title')}
            value={schemeLabel}
            onPress={() => onOpenPicker('scheme')}
          >
            {schemeOption ? (
              <View
                style={[styles.schemeDot, { backgroundColor: schemeOption.color }]}
              />
            ) : null}
            <ProBadge />
          </SettingsRow>
          <SettingsRow
            icon={Calendar}
            label={t('settings.weekStartDay.title')}
            value={weekStartLabel}
            onPress={() => onOpenPicker('weekStart')}
          />
        </SettingsGroup>
      </Animated.View>

      <Animated.View entering={sectionEntrance(1)}>
        <SectionLabel bottom={4}>{t('settings.homeScreen.title')}</SectionLabel>
        <SettingsRow
          label={t('settings.homeScreen.showGeneral')}
          desc={t('settings.homeScreen.showGeneralDesc')}
          accessory="none"
        >
          <Switch
            on={showGeneralOnToday}
            onToggle={onToggleShowGeneral}
            accessibilityLabel={t('settings.homeScreen.showGeneral')}
          />
        </SettingsRow>
      </Animated.View>

      <Animated.View entering={sectionEntrance(2)}>
        <PushNotificationSection tokens={tokens} t={t} {...push} />
        {persistentReminder.isSupported ? (
          <PersistentReminderRow
            t={t}
            enabled={persistentReminder.enabled}
            isLoading={persistentReminder.isLoading}
            onToggle={persistentReminder.onToggle}
          />
        ) : null}
      </Animated.View>

      <Animated.View entering={sectionEntrance(3)}>
        <MarketingConsentSection />
      </Animated.View>
    </>
  )
}

interface PreferencePickerSheetProps {
  tokens: Tokens
  t: TranslationFn
  activePicker: PreferencePicker | null
  pickerTitles: Record<PreferencePicker, string>
  pickerDescriptions: Partial<Record<PreferencePicker, string>>
  selectedLanguage: 'en' | 'pt-BR'
  currentTheme: ThemeMode
  currentScheme: ColorScheme
  weekStartDay?: number
  themeModeOptions: { value: ThemeMode; label: string }[]
  weekStartOptions: { value: 0 | 1; label: string }[]
  onClose: () => void
  onLanguageChange: (locale: 'en' | 'pt-BR') => void
  onThemeModeChange: (mode: ThemeMode) => void
  onSchemeChange: (scheme: ColorScheme) => void
  onWeekStartChange: (day: 0 | 1) => void
}

export function PreferencePickerSheet({
  tokens,
  t,
  activePicker,
  pickerTitles,
  pickerDescriptions,
  selectedLanguage,
  currentTheme,
  currentScheme,
  weekStartDay,
  themeModeOptions,
  weekStartOptions,
  onClose,
  onLanguageChange,
  onThemeModeChange,
  onSchemeChange,
  onWeekStartChange,
}: Readonly<PreferencePickerSheetProps>) {
  return (
    <BottomSheetModal
      open={activePicker !== null}
      onClose={onClose}
      title={activePicker ? pickerTitles[activePicker] : undefined}
      contentKey={activePicker ?? 'none'}
      snapPoints={['55%']}
      contentManagesScroll
    >
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
        {activePicker && pickerDescriptions[activePicker] ? (
          <Text style={[styles.sheetDescription, { color: tokens.fg3 }]}>
            {pickerDescriptions[activePicker]}
          </Text>
        ) : null}
        {activePicker === 'language' &&
          LANGUAGE_OPTIONS.map((lang, index) => (
            <RadioRow
              key={lang.value}
              label={lang.label}
              selected={selectedLanguage === lang.value}
              divider={index < LANGUAGE_OPTIONS.length - 1}
              onPress={() => {
                onClose()
                onLanguageChange(lang.value)
              }}
            />
          ))}
        {activePicker === 'theme' &&
          themeModeOptions.map((mode, index) => (
            <RadioRow
              key={mode.value}
              label={mode.label}
              selected={currentTheme === mode.value}
              divider={index < themeModeOptions.length - 1}
              onPress={() => {
                onClose()
                onThemeModeChange(mode.value)
              }}
            />
          ))}
        {activePicker === 'scheme' && (
          <>
            {colorSchemeOptions.map((option, index) => (
              <RadioRow
                key={option.value}
                label={t(`preferences.color${capitalize(option.value)}`)}
                selected={currentScheme === option.value}
                dot={option.color}
                divider={index < colorSchemeOptions.length - 1}
                onPress={() => {
                  onSchemeChange(option.value)
                }}
              />
            ))}
            <View style={styles.sheetFooter}>
              <PillButton
                variant="secondary"
                // eslint-disable-next-line local/no-fullbleed-button -- picker sheet footer primary action
                fullWidth
                onPress={onClose}
                leading={<Check size={18} color={tokens.bg} strokeWidth={2} />}
              >
                {t('common.done')}
              </PillButton>
            </View>
          </>
        )}
        {activePicker === 'weekStart' &&
          weekStartOptions.map((option, index) => (
            <RadioRow
              key={option.value}
              label={option.label}
              selected={weekStartDay === option.value}
              divider={index < weekStartOptions.length - 1}
              onPress={() => {
                onClose()
                onWeekStartChange(option.value)
              }}
            />
          ))}
      </ScrollView>
    </BottomSheetModal>
  )
}
