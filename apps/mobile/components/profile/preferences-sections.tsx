import { useMemo, useRef, useState, type Ref } from 'react'
import { View, Text, Pressable } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { Calendar, Languages, Moon } from '@/components/ui/icons'
import type { ThemeMode } from '@orbit/shared/types/profile'
import {
  getNativePushStatusPresentation,
  getTimezoneList,
  LANGUAGE_OPTIONS,
  type NativePushRegistrationStatus,
} from '@orbit/shared/utils'
import type { NotificationPermissionStatus } from '@/lib/push-notification-permissions'
import { Sheet, type SheetHandle } from '@/components/ui/sheet'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { RadioRow } from '@/components/ui/select-check'
import { RadioGroup } from '@/components/ui/radio-row'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import { RowList } from '@/components/ui/row-list'
import { MarketingConsentSection } from '@/components/marketing-consent/marketing-consent-section'
import { styles, type Tokens } from '@/app/preferences-styles'

export type PreferencePicker = 'language' | 'theme' | 'timeZone' | 'weekStart'

const TIME_ZONE_OPTIONS = getTimezoneList()
const TIME_ZONE_PAGE_SIZE = 20

/** Focus moves the draft and only a press commits it, so arrow keys never write a preference per keypress. */
function PickerOptions<Value extends string | number>({
  label,
  options,
  selected,
  onCommit,
}: Readonly<{
  label: string
  options: readonly { value: Value; label: string }[]
  selected: Value | null
  onCommit: (value: Value) => void
}>) {
  const [draft, setDraft] = useState<Value | null>(null)
  const draftRef = useRef<Value | null>(null)
  /** Null until focus moves, so a profile that resolves after the first render still checks its row. */
  const checked = draft ?? selected
  const selectDraft = (next: Value) => {
    draftRef.current = next
    setDraft(next)
  }
  const commitDraft = () => {
    const pending = draftRef.current ?? selected
    if (pending !== null) onCommit(pending)
  }

  return (
    <RadioGroup accessibilityLabel={label} onCommit={commitDraft}>
      {options.map((option) => (
        <RadioRow
          key={String(option.value)}
          label={option.label}
          selected={checked === option.value}
          onSelect={() => selectDraft(option.value)}
        />
      ))}
    </RadioGroup>
  )
}

function TimeZoneOptions({
  tokens,
  selected,
  searchLabel,
  noResultsLabel,
  showMoreLabel,
  onCommit,
}: Readonly<{
  tokens: Tokens
  selected?: string | null
  searchLabel: string
  noResultsLabel: string
  showMoreLabel: string
  onCommit: (timeZone: string) => void
}>) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(TIME_ZONE_PAGE_SIZE)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized
      ? TIME_ZONE_OPTIONS.filter((option) => option.toLocaleLowerCase().includes(normalized))
      : TIME_ZONE_OPTIONS
  }, [query])
  const ordered = selected && filtered.includes(selected)
    ? [selected, ...filtered.filter((option) => option !== selected)]
    : filtered
  const visible = ordered.slice(0, visibleCount)

  return (
    <View style={styles.timeZoneOptions}>
      <Text style={[styles.timeZoneSearchLabel, { color: tokens.fg2 }]}>
        {searchLabel}
      </Text>
      <BottomSheetAppTextInput
        value={query}
        onChangeText={(value) => {
          setQuery(value)
          setVisibleCount(TIME_ZONE_PAGE_SIZE)
        }}
        accessibilityLabel={searchLabel}
        placeholder={searchLabel}
        style={styles.timeZoneSearch}
      />
      <PickerOptions
        label={searchLabel}
        options={visible.map((option) => ({ label: option, value: option }))}
        selected={selected ?? null}
        onCommit={onCommit}
      />
      {visible.length === 0 ? (
        <Text style={[styles.timeZoneEmpty, { color: tokens.fg3 }]}>{noResultsLabel}</Text>
      ) : null}
      {visibleCount < ordered.length ? (
        <View style={styles.timeZoneMore}>
          <PillButton
            size="sm"
            variant="ghost"
            onClick={() => setVisibleCount((count) => count + TIME_ZONE_PAGE_SIZE)}
          >
            {showMoreLabel}
          </PillButton>
        </View>
      ) : null}
    </View>
  )
}

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

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
  showSectionLabel?: boolean
  deviceLabel?: string
  deviceDescription?: string
  contained?: boolean
}

function PushSectionLabel({
  show,
  t,
}: Readonly<{ show: boolean; t: TranslationFn }>) {
  return show ? (
    <SectionLabel>{t('settings.notifications.title')}</SectionLabel>
  ) : null
}

interface SupportedPushContentProps {
  tokens: Tokens
  t: TranslationFn
  pushEnabled: boolean
  pushLoading: boolean
  permissionStatus: NotificationPermissionStatus | null
  pushStatusColor: string
  pushStatusText: string
  switchLabel: string
  deviceLabel?: string
  deviceDescription?: string
  onToggle: () => void
  onOpenSettings: () => void
}

function SupportedPushContent({
  tokens,
  t,
  pushEnabled,
  pushLoading,
  permissionStatus,
  pushStatusColor,
  pushStatusText,
  switchLabel,
  deviceLabel,
  deviceDescription,
  onToggle,
  onOpenSettings,
}: Readonly<SupportedPushContentProps>) {
  return (
    <>
      <SettingsRow
        label={deviceLabel ?? t('settings.notifications.allowed')}
        desc={deviceDescription}
        accessory="none"
        divider={false}
      >
        <View
          pointerEvents={pushLoading ? 'none' : 'auto'}
          accessible={pushLoading}
          accessibilityRole={pushLoading ? 'switch' : undefined}
          accessibilityLabel={pushLoading ? switchLabel : undefined}
          accessibilityState={pushLoading ? { checked: pushEnabled, disabled: true } : undefined}
        >
          <View
            accessibilityElementsHidden={pushLoading}
            importantForAccessibility={pushLoading ? 'no-hide-descendants' : 'auto'}
          >
            <Switch checked={pushEnabled} onChange={onToggle} label={switchLabel} />
          </View>
        </View>
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
  )
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
  showSectionLabel = true,
  deviceLabel,
  deviceDescription,
  contained = false,
}: Readonly<PushNotificationSectionProps>) {
  const pushStatusPresentation = getNativePushStatusPresentation({
    permissionStatus,
    registrationStatus,
    isEnabled: pushEnabled,
    isRegistered: pushRegistered,
  })
  const pushStatusText = t(pushStatusPresentation.messageKey)
  const switchLabel = deviceLabel ?? t('settings.notifications.title')
  const accentStatusColor =
    pushStatusPresentation.tone === 'accent' ? tokens.primarySoft : tokens.fg3
  const pushStatusColor =
    pushStatusPresentation.tone === 'critical' ? tokens.statusBadText : accentStatusColor
  const content = pushSupported ? (
    <SupportedPushContent
      tokens={tokens}
      t={t}
      pushEnabled={pushEnabled}
      pushLoading={pushLoading}
      permissionStatus={permissionStatus}
      pushStatusColor={pushStatusColor}
      pushStatusText={pushStatusText}
      switchLabel={switchLabel}
      deviceLabel={deviceLabel}
      deviceDescription={deviceDescription}
      onToggle={onToggle}
      onOpenSettings={onOpenSettings}
    />
  ) : (
    <View style={styles.statusBlock}>
      <Text style={[styles.statusText, { color: tokens.fg3 }]}>
        {t('settings.notifications.unsupportedNative')}
      </Text>
    </View>
  )

  return (
    <>
      <PushSectionLabel show={showSectionLabel} t={t} />
      {contained ? <RowList>{content}</RowList> : content}
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
      divider={false}
    >
      <View
        pointerEvents={isLoading ? 'none' : 'auto'}
        accessible={isLoading}
        accessibilityRole={isLoading ? 'switch' : undefined}
        accessibilityLabel={isLoading ? t('persistentReminder.label') : undefined}
        accessibilityState={isLoading ? { checked: enabled, disabled: true } : undefined}
      >
        <View
          accessibilityElementsHidden={isLoading}
          importantForAccessibility={isLoading ? 'no-hide-descendants' : 'auto'}
        >
          <Switch
            checked={enabled}
            onChange={onToggle}
            label={t('persistentReminder.label')}
          />
        </View>
      </View>
    </SettingsRow>
  )
}

interface PreferenceSettingsListProps {
  tokens: Tokens
  t: TranslationFn
  languageLabel?: string
  themeLabel?: string
  weekStartLabel?: string
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
  weekStartLabel,
  showGeneralOnToday,
  onOpenPicker,
  onToggleShowGeneral,
  push,
  persistentReminder,
}: Readonly<PreferenceSettingsListProps>) {
  return (
    <>
      <Animated.View entering={sectionEntrance(0)}>
        <SectionLabel>{t('preferences.general')}</SectionLabel>
        <SettingsRow
          icon={Languages}
          label={t('profile.language.title')}
          value={languageLabel}
          onPress={() => onOpenPicker('language')}
          divider={false}
        />
        <SettingsRow
          icon={Moon}
          label={t('preferences.themeMode')}
          value={themeLabel}
          onPress={() => onOpenPicker('theme')}
          divider={false}
        />
        <SettingsRow
          icon={Calendar}
          label={t('settings.weekStartDay.title')}
          value={weekStartLabel}
          onPress={() => onOpenPicker('weekStart')}
          divider={false}
        />
      </Animated.View>

      <Animated.View entering={sectionEntrance(1)}>
        <SectionLabel>{t('settings.homeScreen.title')}</SectionLabel>
        <SettingsRow
          label={t('settings.homeScreen.showGeneral')}
          desc={t('settings.homeScreen.showGeneralDesc')}
          accessory="none"
          divider={false}
        >
          <Switch
            checked={showGeneralOnToday}
            onChange={onToggleShowGeneral}
            label={t('settings.homeScreen.showGeneral')}
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
  activePicker: PreferencePicker | null
  pickerTitles: Record<PreferencePicker, string>
  pickerDescriptions: Partial<Record<PreferencePicker, string>>
  timeZoneSearchLabel: string
  timeZoneNoResultsLabel: string
  timeZoneShowMoreLabel: string
  selectedLanguage: 'en' | 'pt-BR'
  currentTheme: ThemeMode
  timeZone?: string | null
  weekStartDay?: number
  themeModeOptions: { value: ThemeMode; label: string }[]
  weekStartOptions: { value: 0 | 1; label: string }[]
  sheetRef: Ref<SheetHandle>
  closePicker: (exitAction?: () => void) => void
  onHidden: () => void
  onLanguageChange: (locale: 'en' | 'pt-BR') => void
  onThemeModeChange: (mode: ThemeMode) => void
  onTimeZoneChange: (timeZone: string) => void
  onWeekStartChange: (day: 0 | 1) => void
}

export function PreferencePickerSheet({
  tokens,
  activePicker,
  pickerTitles,
  pickerDescriptions,
  timeZoneSearchLabel,
  timeZoneNoResultsLabel,
  timeZoneShowMoreLabel,
  selectedLanguage,
  currentTheme,
  timeZone,
  weekStartDay,
  themeModeOptions,
  weekStartOptions,
  sheetRef,
  closePicker,
  onHidden,
  onLanguageChange,
  onThemeModeChange,
  onTimeZoneChange,
  onWeekStartChange,
}: Readonly<PreferencePickerSheetProps>) {
  const commitSelection = (apply: () => void) => closePicker(() => {
    onHidden()
    apply()
  })

  return (
    activePicker !== null ? (<Sheet
      ref={sheetRef}
      open
      onClose={onHidden}
      title={pickerTitles[activePicker]}
      key={activePicker}
    >
      <View style={styles.sheetContent}>
        {pickerDescriptions[activePicker] ? (
          <Text style={[styles.sheetDescription, { color: tokens.fg3 }]}>
            {pickerDescriptions[activePicker]}
          </Text>
        ) : null}
        {activePicker === 'language' ? (
          <PickerOptions
            label={pickerTitles.language}
            options={LANGUAGE_OPTIONS}
            selected={selectedLanguage}
            onCommit={(locale) => commitSelection(() => onLanguageChange(locale))}
          />
        ) : null}
        {activePicker === 'theme' ? (
          <PickerOptions
            label={pickerTitles.theme}
            options={themeModeOptions}
            selected={currentTheme}
            onCommit={(mode) => commitSelection(() => onThemeModeChange(mode))}
          />
        ) : null}
        {activePicker === 'timeZone' ? (
          <TimeZoneOptions
            tokens={tokens}
            selected={timeZone}
            searchLabel={timeZoneSearchLabel}
            noResultsLabel={timeZoneNoResultsLabel}
            showMoreLabel={timeZoneShowMoreLabel}
            onCommit={(nextTimeZone) => commitSelection(() => onTimeZoneChange(nextTimeZone))}
          />
        ) : null}
        {activePicker === 'weekStart' ? (
          <PickerOptions
            label={pickerTitles.weekStart}
            options={weekStartOptions}
            selected={weekStartDay === 0 || weekStartDay === 1 ? weekStartDay : null}
            onCommit={(day) => commitSelection(() => onWeekStartChange(day))}
          />
        ) : null}
      </View>
    </Sheet>) : null
  )
}
