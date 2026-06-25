import { useCallback, useMemo, useState } from 'react'
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { Clock3, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { detectDefaultTimeFormat, formatLocaleTime } from '@orbit/shared/utils'
import { createTokensV2, radius, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'

type AppTokens = ReturnType<typeof createTokensV2>

interface AppTimePickerProps {
  value: string
  onChange: (value: string) => void
  /** Optional clear callback. When provided and value is set, a clear (X)
   *  button replaces the clock icon and tapping it invokes onClear. */
  onClear?: () => void
  placeholder?: string
  accessibilityLabel?: string
  disabled?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

function parseTimeValue(value: string): Date {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    const fallback = new Date()
    fallback.setSeconds(0, 0)
    return fallback
  }

  const [hoursRaw, minutesRaw] = value.split(':')
  const parsed = new Date()
  parsed.setHours(Number(hoursRaw), Number(minutesRaw), 0, 0)
  return parsed
}

function formatApiTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function AppTimePicker({
  value,
  onChange,
  onClear,
  placeholder,
  accessibilityLabel,
  disabled = false,
  containerStyle,
}: Readonly<AppTimePickerProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [isOpen, setIsOpen] = useState(false)
  const [draftValue, setDraftValue] = useState(() => parseTimeValue(value))
  const { profile } = useProfile()
  const is24Hour = profile?.uses24HourClock ?? detectDefaultTimeFormat(locale) === '24h'
  const displayValue = value
    ? formatLocaleTime(value, locale, { hour: 'numeric', minute: '2-digit', hour12: !is24Hour })
    : ''

  const openPicker = useCallback(() => {
    if (disabled) return

    const nextValue = parseTimeValue(value)
    setDraftValue(nextValue)

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: nextValue,
        mode: 'time',
        is24Hour,
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type === 'set' && selectedDate) {
            onChange(formatApiTime(selectedDate))
          }
        },
      })
      return
    }

    setIsOpen(true)
  }, [disabled, is24Hour, onChange, value])

  const canClear = !disabled && !!value && !!onClear

  return (
    <>
      <View
        style={[styles.trigger, containerStyle, disabled && styles.triggerDisabled]}
      >
        <Pressable
          onPress={openPicker}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            accessibilityLabel ??
            (displayValue
              ? t('common.selectedTime', { time: displayValue })
              : placeholder ?? t('common.selectTime'))
          }
          style={styles.triggerTextArea}
        >
          <Text
            style={[
              styles.triggerText,
              !displayValue && styles.triggerPlaceholder,
              disabled && styles.triggerTextDisabled,
            ]}
            numberOfLines={1}
          >
            {displayValue || placeholder || t('common.selectTime')}
          </Text>
        </Pressable>
        {canClear ? (
          <Pressable
            onPress={onClear}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.clear')}
            style={styles.iconButton}
          >
            <X size={16} strokeWidth={1.8} color={tokens.fg3} />
          </Pressable>
        ) : (
          <Pressable
            onPress={openPicker}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? placeholder ?? t('common.selectTime')}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={styles.iconButton}
          >
            <Clock3 size={20} strokeWidth={1.8} color={tokens.fg4} />
          </Pressable>
        )}
      </View>

      {Platform.OS === 'ios' ? (
        <Modal
          visible={isOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsOpen(false)}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setIsOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <View
              style={styles.dialog}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.dialogHeader}>
                <TouchableOpacity
                  onPress={() => setIsOpen(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                >
                  <Text style={styles.dialogAction}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.dialogTitle}>{t('common.selectTime')}</Text>
                <TouchableOpacity
                  onPress={() => {
                    onChange(formatApiTime(draftValue))
                    setIsOpen(false)
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                >
                  <Text style={styles.dialogAction}>{t('common.done')}</Text>
                </TouchableOpacity>
              </View>

              <DateTimePicker
                value={draftValue}
                mode="time"
                display="spinner"
                themeVariant={currentTheme}
                is24Hour={is24Hour}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) {
                    setDraftValue(selectedDate)
                  }
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null}
    </>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    trigger: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 14,
    },
    triggerDisabled: {
      opacity: 0.6,
    },
    triggerTextArea: {
      flex: 1,
      paddingVertical: 10,
      paddingLeft: 16,
      paddingRight: 8,
    },
    iconButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    triggerText: {
      color: tokens.fg1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
    },
    triggerTextDisabled: {
      color: tokens.fg3,
    },
    triggerPlaceholder: {
      color: tokens.fg3,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    dialog: {
      width: '100%',
      maxWidth: 360,
      borderRadius: radius.lg,
      backgroundColor: tokens.bgSheet,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 16,
      gap: 12,
      ...shadowsV2.shadow2,
    },
    dialogHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dialogTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
    },
    dialogAction: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.primary,
    },
  })
}
