import { useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  DAY_PERIODS,
  detectDefaultTimeFormat,
  formatLocaleTime,
  formatTimeParts,
  from12Hour,
  HOURS_12,
  HOURS_24,
  MINUTES,
  padTimePart,
  parseTimeParts,
  to12Hour,
  type DayPeriod,
} from '@orbit/shared/utils'
import { Clock3, X } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'

const ROW_HEIGHT = 44
const COLUMN_HEIGHT = 220

type Tokens = ReturnType<typeof createTokensV2>

interface TimeFieldProps {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  placeholder?: string
  accessibilityLabel?: string
  disabled?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

interface TimeColumnProps {
  values: readonly (number | string)[]
  selected: number | string
  formatValue: (value: number | string) => string
  label: string
  tokens: Tokens
  onSelect: (value: number | string) => void
}

function TimeColumn({
  values,
  selected,
  formatValue,
  label,
  tokens,
  onSelect,
}: Readonly<TimeColumnProps>) {
  const listRef = useRef<ScrollView>(null)
  const selectedIndex = values.indexOf(selected)

  return (
    <ScrollView
      ref={listRef}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.columnContent}
      onLayout={() => {
        if (selectedIndex < 0) return
        listRef.current?.scrollTo({
          y: Math.max(0, selectedIndex * ROW_HEIGHT - COLUMN_HEIGHT / 2 + ROW_HEIGHT / 2),
          animated: false,
        })
      }}
      showsVerticalScrollIndicator={false}
      style={styles.column}
    >
      {values.map((option) => {
        const isSelected = option === selected
        return (
          <Pressable
            key={String(option)}
            accessibilityLabel={formatValue(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option)}
            style={[
              styles.option,
              { backgroundColor: isSelected ? tokens.primary : 'transparent' },
            ]}
          >
            <Text
              style={[
                styles.optionLabel,
                { color: isSelected ? tokens.fgOnPrimary : tokens.fg1 },
              ]}
            >
              {formatValue(option)}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

export function TimeField({
  value,
  onChange,
  onClear,
  placeholder,
  accessibilityLabel,
  disabled = false,
  containerStyle,
}: Readonly<TimeFieldProps>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const is24Hour = profile?.uses24HourClock ?? detectDefaultTimeFormat(i18n.language) === '24h'
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ hour24: 9, minute: 0 })
  const { sheetRef, closeSheet } = useSheetHost()

  const displayValue = value
    ? formatLocaleTime(value, i18n.language, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: !is24Hour,
      })
    : ''
  const canClear = !disabled && value.length > 0 && onClear != null
  const { hour12, period } = to12Hour(draft.hour24)

  function openPicker() {
    const now = new Date()
    setDraft(parseTimeParts(value) ?? { hour24: now.getHours(), minute: now.getMinutes() })
    setOpen(true)
  }

  function applyDraft() {
    closeSheet(() => {
      setOpen(false)
      onChange(formatTimeParts(draft))
    })
  }

  return (
    <>
      <View
        style={[
          styles.trigger,
          { backgroundColor: tokens.bgField, borderColor: tokens.hairline },
          containerStyle,
          disabled ? styles.disabled : null,
        ]}
      >
        <Pressable
          onPress={openPicker}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            accessibilityLabel ?? (displayValue || placeholder || t('common.selectTime'))
          }
          style={styles.triggerMain}
        >
          <Text
            style={{
              color: displayValue ? tokens.fg1 : tokens.fg3,
              fontFamily: 'Rubik_400Regular',
              fontSize: 16,
            }}
          >
            {displayValue || placeholder || t('common.selectTime')}
          </Text>
        </Pressable>
        <Pressable
          onPress={canClear ? onClear : openPicker}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={canClear ? t('common.clear') : t('common.selectTime')}
          style={styles.icon}
        >
          {canClear ? (
            <X size={20} color={tokens.fg3} strokeWidth={1.8} />
          ) : (
            <Clock3 size={20} color={tokens.fg4} strokeWidth={1.8} />
          )}
        </Pressable>
      </View>
      {open ? (
        <Sheet
          ref={sheetRef}
          open
          title={t('common.selectTime')}
          onClose={() => setOpen(false)}
          actions={<PillButton onClick={applyDraft}>{t('common.done')}</PillButton>}
        >
          <View style={styles.columns}>
            <TimeColumn
              values={is24Hour ? HOURS_24 : HOURS_12}
              selected={is24Hour ? draft.hour24 : hour12}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.hours')}
              tokens={tokens}
              onSelect={(option) =>
                setDraft((current) => ({
                  ...current,
                  hour24: is24Hour ? Number(option) : from12Hour(Number(option), period),
                }))
              }
            />
            <TimeColumn
              values={MINUTES}
              selected={draft.minute}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.minutes')}
              tokens={tokens}
              onSelect={(option) => setDraft((current) => ({ ...current, minute: Number(option) }))}
            />
            {is24Hour ? null : (
              <TimeColumn
                values={DAY_PERIODS}
                selected={period}
                formatValue={String}
                label={t('common.amPm')}
                tokens={tokens}
                onSelect={(option) =>
                  setDraft((current) => ({
                    ...current,
                    hour24: from12Hour(to12Hour(current.hour24).hour12, option as DayPeriod),
                  }))
                }
              />
            )}
          </View>
        </Sheet>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    width: '100%',
  },
  triggerMain: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  icon: { alignItems: 'center', justifyContent: 'center', minHeight: 52, width: 48 },
  disabled: { opacity: 0.6 },
  columns: { flexDirection: 'row', gap: 8, height: COLUMN_HEIGHT },
  column: { flex: 1 },
  columnContent: { paddingVertical: 4 },
  option: {
    alignItems: 'center',
    borderRadius: 10,
    height: ROW_HEIGHT,
    justifyContent: 'center',
  },
  optionLabel: { fontFamily: 'Rubik_400Regular', fontSize: 16 },
})
