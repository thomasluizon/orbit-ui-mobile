import { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, Switch } from "react-native";
import { X, Plus, Bell } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { HABIT_REMINDER_PRESETS } from "@orbit/shared/utils";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
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
          <Bell size={16} color={tokens.primary} />
          <Text style={sectionStyles.headerLabel}>
            {t("habits.form.reminder")}
          </Text>
        </View>
        <Switch
          value={reminderEnabled}
          onValueChange={onToggleReminder}
          trackColor={{ false: tokens.bgElev, true: tokens.primary }}
          thumbColor={tokens.fgOnPrimary}
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
                <TouchableOpacity
                  disabled={reminderTimes.length <= 1}
                  style={
                    reminderTimes.length <= 1 ? { opacity: 0.3 } : undefined
                  }
                  onPress={() => removeReminder(time)}
                  activeOpacity={0.7}
                >
                  <X size={12} color={tokens.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={sectionStyles.addButton}
            onPress={() => {
              setShowAddReminder(!showAddReminder);
              setShowCustomInput(false);
            }}
            activeOpacity={0.7}
          >
            <Plus size={14} color={tokens.primary} />
            <Text style={sectionStyles.addButtonText}>
              {t("habits.form.reminderAdd")}
            </Text>
          </TouchableOpacity>

          {showAddReminder && (
            <View style={sectionStyles.dropdown}>
              {availablePresets.map((preset) => (
                <TouchableOpacity
                  key={preset.value}
                  style={sectionStyles.dropdownItem}
                  onPress={() => addPreset(preset.value)}
                  activeOpacity={0.7}
                >
                  <Text style={sectionStyles.dropdownItemText}>
                    {t(preset.key)}
                  </Text>
                </TouchableOpacity>
              ))}
              {showCustomInput && (
                <View style={sectionStyles.customRow}>
                  <BottomSheetAppTextInput
                    value={customValue}
                    placeholder={t("habits.form.reminderCustomPlaceholder")}
                    placeholderTextColor={tokens.fg3}
                    keyboardType="number-pad"
                    style={sectionStyles.customInput}
                    onChangeText={setCustomValue}
                    onSubmitEditing={addCustomReminder}
                  />
                  <View style={sectionStyles.unitRow}>
                    {(["min", "hours", "days"] as const).map((unit) => (
                      <TouchableOpacity
                        key={unit}
                        style={[
                          sectionStyles.unitButton,
                          customUnit === unit && sectionStyles.unitButtonActive,
                        ]}
                        onPress={() => setCustomUnit(unit)}
                        activeOpacity={0.7}
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
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={sectionStyles.customAddButton}
                    onPress={addCustomReminder}
                    activeOpacity={0.7}
                  >
                    <Plus size={14} color={tokens.fgOnPrimary} />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                style={sectionStyles.dropdownItem}
                onPress={() => setShowCustomInput(!showCustomInput)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    sectionStyles.dropdownItemText,
                    { color: tokens.primary, fontWeight: "500" },
                  ]}
                >
                  {t("habits.form.reminderCustom")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
