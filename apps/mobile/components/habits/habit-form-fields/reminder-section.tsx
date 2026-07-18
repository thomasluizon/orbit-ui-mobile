import { useState, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { X, Plus, Bell } from '@/components/ui/icons';
import { useTranslation } from "react-i18next";
import { HABIT_REMINDER_PRESETS } from "@orbit/shared/utils";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { Switch } from "@/components/ui/settings-row";
import { type AppTokens, createSectionStyles } from "./styles";

interface ReminderSectionProps {
  tokens: AppTokens;
  reminderEnabled: boolean;
  reminderTimes: number[];
  onReminderTimesChange: (times: number[]) => void;
  onToggleReminder: () => void;
  reminderLabel: (minutes: number) => string;
}

export function ReminderSection({
  tokens,
  reminderEnabled,
  reminderTimes,
  onReminderTimesChange,
  onToggleReminder,
  reminderLabel,
}: Readonly<ReminderSectionProps>) {
  const { t } = useTranslation();
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"min" | "hours" | "days">("min");

  const availablePresets = useMemo(
    () => HABIT_REMINDER_PRESETS.filter((p) => !reminderTimes.includes(p.value)),
    [reminderTimes],
  );

  function addPreset(value: number) {
    if (!reminderTimes.includes(value)) {
      onReminderTimesChange([...reminderTimes, value].sort((a, b) => b - a));
    }
    setShowAddReminder(false);
  }

  function addCustomReminder() {
    const num = Number(customValue);
    if (!num || num <= 0) return;
    let multiplier = 1;
    if (customUnit === "days") multiplier = 1440;
    else if (customUnit === "hours") multiplier = 60;
    const minutes = num * multiplier;
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
    <View style={sectionStyles.container}>
      <View style={sectionStyles.headerRow}>
        <View style={sectionStyles.headerLeft}>
          <Bell size={20} color={tokens.fg2} strokeWidth={1.8} />
          <Text style={sectionStyles.headerLabel}>
            {t("habits.form.reminder")}
          </Text>
        </View>
        <Switch
          on={reminderEnabled}
          onToggle={onToggleReminder}
          accessibilityLabel={t("habits.form.reminder")}
        />
      </View>
      {reminderEnabled && (
        <View style={sectionStyles.body}>
          <View style={sectionStyles.chipsRow}>
            {reminderTimes.map((time) => (
              <View key={time} style={sectionStyles.chip}>
                <Text style={sectionStyles.chipText}>
                  {reminderLabel(time)}
                </Text>
                <Pressable
                  disabled={reminderTimes.length <= 1}
                  style={({ pressed }) => [
                    reminderTimes.length <= 1 && { opacity: 0.45 },
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                  hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("habits.form.removeReminder")}
                  onPress={() => removeReminder(time)}
                >
                  <X size={13} color={tokens.primary} strokeWidth={2.2} />
                </Pressable>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              sectionStyles.addButton,
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            onPress={() => {
              setShowAddReminder(!showAddReminder);
              setShowCustomInput(false);
            }}
          >
            <Plus size={14} color={tokens.fg2} strokeWidth={2} />
            <Text style={sectionStyles.addButtonText}>
              {t("habits.form.reminderAdd")}
            </Text>
          </Pressable>

          {showAddReminder && (
            <View style={sectionStyles.dropdown}>
              {availablePresets.map((preset) => (
                <Pressable
                  key={preset.value}
                  style={({ pressed }) => [
                    sectionStyles.dropdownItem,
                    pressed && {
                      backgroundColor: tokens.bgElev,
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
                  <BottomSheetAppTextInput
                    value={customValue}
                    placeholder={t("habits.form.reminderCustomPlaceholder")}
                    keyboardType="number-pad"
                    style={sectionStyles.customInput}
                    onChangeText={setCustomValue}
                    onSubmitEditing={addCustomReminder}
                  />
                  <View style={sectionStyles.unitRow}>
                    {(["min", "hours", "days"] as const).map((unit) => (
                      <Pressable
                        key={unit}
                        style={({ pressed }) => [
                          sectionStyles.unitButton,
                          customUnit === unit && sectionStyles.unitButtonActive,
                          pressed && { transform: [{ scale: 0.96 }] },
                        ]}
                        hitSlop={{ top: 6, bottom: 6 }}
                        accessibilityRole="button"
                        onPress={() => setCustomUnit(unit)}
                      >
                        <Text
                          style={[
                            sectionStyles.unitButtonText,
                            customUnit === unit &&
                              sectionStyles.unitButtonTextActive,
                          ]}
                        >
                          {t(
                            `habits.form.reminderUnit${unit.charAt(0).toUpperCase() + unit.slice(1)}` as "habits.form.reminderUnitMin",
                          )}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      sectionStyles.customAddButton,
                      pressed && { transform: [{ scale: 0.96 }] },
                    ]}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.add")}
                    onPress={addCustomReminder}
                  >
                    <Plus size={16} color={tokens.fgOnPrimary} strokeWidth={2.2} />
                  </Pressable>
                </View>
              )}
              <Pressable
                style={({ pressed }) => [
                  sectionStyles.dropdownItem,
                  pressed && {
                    backgroundColor: tokens.bgElev,
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
        </View>
      )}
    </View>
  );
}
