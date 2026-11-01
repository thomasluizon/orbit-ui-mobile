import { IconButton } from '@/components/ui/icon-button'
import { useHabitFormInteraction } from './habit-form-interaction'
import { Select } from '@/components/ui/select'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { PillButton } from "@/components/ui/pill-button";
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useState, useMemo, type ReactNode } from "react";
import { View, Text, } from "react-native";
import { X, Plus } from '@/components/ui/icons';
import { useTranslation } from "react-i18next";
import { HABIT_REMINDER_PRESETS } from "@orbit/shared/utils";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { type AppTokens, createSectionStyles } from "./styles";

interface ReminderSectionProps {
  tokens: AppTokens;
  reminderEnabled: boolean;
  reminderTimes: number[];
  onReminderTimesChange: (times: number[]) => void;
  reminderLabel: (minutes: number) => string;
  children?: ReactNode;
  scheduledReminderCount?: number;
  onValidationError?: (message: string) => void;
}

export function ReminderSection({
  tokens,
  reminderEnabled,
  reminderTimes,
  onReminderTimesChange,
  reminderLabel,
  children,
  scheduledReminderCount = 0,
  onValidationError,
}: Readonly<ReminderSectionProps>) {
  const { disabled, guard, isDisabled } = useHabitFormInteraction()
  const { t } = useTranslation();
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"min" | "hours" | "days">("min");
  const [customDirection, setCustomDirection] = useState<"before" | "after">("before");

  const availablePresets = useMemo(
    () => HABIT_REMINDER_PRESETS.filter((p) => !reminderTimes.includes(p.value)),
    [reminderTimes],
  );
  const atLimit = reminderTimes.length + scheduledReminderCount >= 15;

  function addPreset(value: number) {
    if (reminderTimes.length + scheduledReminderCount >= 15) {
      onValidationError?.(t("habits.form.relativeReminderMax"));
      return;
    }
    if (!reminderTimes.includes(value)) {
      onReminderTimesChange([...reminderTimes, value].sort((a, b) => b - a));
    }
    setShowAddReminder(false);
  }

  function addCustomReminder() {
    const num = Number(customValue);
    if (!Number.isInteger(num) || num <= 0) {
      onValidationError?.(t("habits.form.invalidRelativeReminder"));
      return;
    }
    let multiplier = 1;
    if (customUnit === "days") multiplier = 1440;
    else if (customUnit === "hours") multiplier = 60;
    const minutes = num * multiplier * (customDirection === "after" ? -1 : 1);
    if (minutes < -1439 || minutes > 10080) {
      onValidationError?.(t("habits.form.invalidRelativeReminder"));
      return;
    }
    if (reminderTimes.length + scheduledReminderCount >= 15) {
      onValidationError?.(t("habits.form.relativeReminderMax"));
      return;
    }
    if (!reminderTimes.includes(minutes)) {
      onReminderTimesChange([...reminderTimes, minutes].sort((a, b) => b - a));
    }
    setCustomValue("");
    setShowCustomInput(false);
    setShowAddReminder(false);
  }

  function removeReminder(value: number) {
    onReminderTimesChange(reminderTimes.filter((v) => v !== value));
  }

  return (
    <View style={{ gap: 12 }}>
      {reminderEnabled && (
        <View style={sectionStyles.body}>
          <View style={sectionStyles.chipsRow}>
            {reminderTimes.map((time) => (
              <View key={time} style={sectionStyles.chip}>
                <Text style={sectionStyles.chipText}>
                  {reminderLabel(time)}
                </Text>
                <Pressable
                  disabled={disabled || (reminderTimes.length + scheduledReminderCount <= 1)}
                  style={({ pressed }) => [
                    { minHeight: TOUCH_TARGET_MIN, minWidth: TOUCH_TARGET_MIN, alignItems: "center", justifyContent: "center" },
                    { borderRadius: 999, overflow: "hidden" },
                    reminderTimes.length + scheduledReminderCount <= 1 && { opacity: 0.45 },
                    pressed && { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
                  ]}

                  accessibilityRole="button"
                  accessibilityLabel={t("habits.form.removeReminder")}
                  onPress={() => removeReminder(time)}
                >
                  <X size={16} color={tokens.fg2} strokeWidth={2.2} />
                </Pressable>
              </View>
            ))}
          </View>
          {reminderTimes.length === 1 && scheduledReminderCount === 0 ? (
            <Text style={sectionStyles.hintText}>
              {t("habits.form.reminderLastRequired")}
            </Text>
          ) : null}

          {atLimit ? <Text style={sectionStyles.limitText}>{t("habits.form.relativeReminderMax")}</Text> : null}
          {!atLimit ? <IconButton label={t("habits.form.reminderAdd")} disabled={disabled} onPress={() => {
              setShowAddReminder(!showAddReminder);
              setShowCustomInput(false);
            }}><Plus size={20} strokeWidth={1.5} accessible={false} /></IconButton> : null}

          {showAddReminder && !atLimit && (
            <View style={sectionStyles.dropdown}>
              {availablePresets.map((preset) => (
                <Pressable disabled={disabled}
                  key={preset.value}
                  style={({ pressed }) => [
                    sectionStyles.dropdownItem,
                    pressed && {
                      backgroundColor: tokens.bgHover,
                      transform: [{ scale: 0.98 }],
                    },
                  ]}
                  accessibilityRole="button"
                  onPress={() => addPreset(preset.value)}
                >
                  <Text style={sectionStyles.dropdownItemText}>
                    {t(preset.key)}
                  </Text>
                </Pressable>
              ))}
              {showCustomInput && (
                <View style={sectionStyles.customRow}>
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: tokens.fg2, fontFamily: "Geist_500Medium", fontSize: 14, fontWeight: "500" }}>{t("habits.form.reminderCustomLabel")}</Text>
                    <BottomSheetAppTextInput isChangeDisabled={isDisabled} editable={!disabled} accessibilityState={{ disabled }}
                      value={customValue}
                      accessibilityLabel={t("habits.form.reminderCustomLabel")}
                      keyboardType="number-pad"
                      style={sectionStyles.customInput}
                      onChangeText={guard(setCustomValue)}
                      onSubmitEditing={addCustomReminder}
                    />
                  </View>
                  <Select value={customUnit} onChange={(value) => setCustomUnit(value as 'min' | 'hours' | 'days')} disabled={disabled} label={t('habits.form.reminderCustom')} options={(['min', 'hours', 'days'] as const).map((unit) => ({ value: unit, label: t(`habits.form.reminderUnit${unit.charAt(0).toUpperCase() + unit.slice(1)}` as 'habits.form.reminderUnitMin') }))} />
                  <Select value={customDirection} onChange={(value) => setCustomDirection(value as 'before' | 'after')} disabled={disabled} label={t('habits.form.reminderDirection')} options={[
                    { value: 'before', label: t('habits.form.reminderBefore') },
                    { value: 'after', label: t('habits.form.reminderAfter') },
                  ]} />
                  <View style={{ minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center' }}>
                    <PillButton disabled={disabled} variant="ghost" size="sm" iconOnly label={t("common.add")} onClick={addCustomReminder}><Plus size={20} color={tokens.fg1} /></PillButton>
                  </View>
                </View>
              )}
              <Pressable disabled={disabled}
                style={({ pressed }) => [
                  sectionStyles.dropdownItem,
                  pressed && {
                    backgroundColor: tokens.bgHover,
                    transform: [{ scale: 0.98 }],
                  },
                ]}
                accessibilityRole="button"
                onPress={() => setShowCustomInput(!showCustomInput)}
              >
                <Text style={sectionStyles.dropdownItemTextAccent}>
                  {t("habits.form.reminderCustom")}
                </Text>
              </Pressable>
            </View>
          )}
          {children}
        </View>
      )}
    </View>
  );
}
