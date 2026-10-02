import { PillButton } from "@/components/ui/pill-button";
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useState, useMemo, type ReactNode } from "react";
import { View, Text, } from "react-native";
import { X, Plus, Bell } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";
import { HABIT_REMINDER_PRESETS } from "@orbit/shared/utils";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { Switch } from "@/components/ui/switch";
import { useReminderPermission } from "@/hooks/use-reminder-permission";
import { type AppTokens, createSectionStyles } from "./styles";

interface ReminderSectionProps {
  inline?: boolean;
  toggleLabel?: string;
  tokens: AppTokens;
  reminderEnabled: boolean;
  reminderTimes: number[];
  onReminderTimesChange: (times: number[]) => void;
  onToggleReminder: () => void;
  reminderLabel: (minutes: number) => string;
  children?: ReactNode;
  scheduledReminderCount?: number;
  onValidationError?: (message: string) => void;
}

export function ReminderSection({
  tokens,
  inline = false,
  toggleLabel,
  reminderEnabled,
  reminderTimes,
  onReminderTimesChange,
  onToggleReminder,
  reminderLabel,
  children,
  scheduledReminderCount = 0,
  onValidationError,
}: Readonly<ReminderSectionProps>) {
  const { t } = useTranslation();
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"min" | "hours" | "days">("min");
  const [customDirection, setCustomDirection] = useState<"before" | "after">("before");
  const permission = useReminderPermission(reminderEnabled, onToggleReminder);
  const label = toggleLabel ?? t(inline ? "habits.form.reminders" : "habits.form.reminder");

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
    <View style={inline ? { gap: 12 } : sectionStyles.container}>
      <View style={sectionStyles.headerRow}>
        <View style={sectionStyles.headerLeft}>
          {!inline ? <Bell size={20} color={tokens.fg2} strokeWidth={1.8} /> : null}
          <Text style={sectionStyles.headerLabel}>
            {label}
          </Text>
        </View>
        <Switch
          checked={reminderEnabled}
          onChange={permission.toggleReminder}
          label={label}
        />
      </View>
      <View style={permission.showNotice ? { gap: 4 } : { position: "absolute" }}>
          <Text accessibilityLiveRegion="polite" style={sectionStyles.hintText}>
            {permission.showNotice ? t("habits.form.reminderPermissionNeeded") : ""}
          </Text>
          {permission.showNotice && <Pressable accessibilityRole="button" style={({ pressed }) => [{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start", borderRadius: 999, overflow: "hidden" }, pressed && { backgroundColor: tokens.bgHover }]} onPress={permission.openSettings}>
            <Text style={[sectionStyles.hintText, { color: tokens.fg2, textDecorationLine: "underline" }]}>
              {t("common.openSettings")}
            </Text>
          </Pressable>}
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
                  disabled={reminderTimes.length + scheduledReminderCount <= 1}
                  style={({ pressed }) => [
                    { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
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
          {!atLimit ? <Pressable
            style={({ pressed }) => [
              sectionStyles.addButton,
              pressed && { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
            ]}

            accessibilityRole="button"
            onPress={() => {
              setShowAddReminder(!showAddReminder);
              setShowCustomInput(false);
            }}
          >
            <Plus size={16} color={tokens.fg2} strokeWidth={2} />
            <Text style={sectionStyles.addButtonText}>
              {t("habits.form.reminderAdd")}
            </Text>
          </Pressable> : null}

          {showAddReminder && !atLimit && (
            <View style={sectionStyles.dropdown}>
              {availablePresets.map((preset) => (
                <Pressable
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
                          pressed && { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
                        ]}

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
                  <View style={sectionStyles.unitRow}>
                    {(["before", "after"] as const).map((direction) => (
                      <Pressable
                        key={direction}
                        style={({ pressed }) => [
                          sectionStyles.unitButton,
                          customDirection === direction && sectionStyles.unitButtonActive,
                          pressed && { backgroundColor: tokens.bgHover },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: customDirection === direction }}

                        onPress={() => setCustomDirection(direction)}
                      >
                        <Text style={[
                          sectionStyles.unitButtonText,
                          customDirection === direction && sectionStyles.unitButtonTextActive,
                        ]}>
                          {t(direction === "before" ? "habits.form.reminderBefore" : "habits.form.reminderAfter")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {inline ? <PillButton variant="ghost" size="sm" iconOnly label={t("common.add")} onClick={addCustomReminder}><Plus size={20} color={tokens.fg1} /></PillButton> : (
                  <Pressable
                    style={({ pressed }) => [
                      sectionStyles.customAddButton,
                      { backgroundColor: pressed ? tokens.primaryPressed : tokens.primary },
                      pressed && { transform: [{ scale: 0.96 }] },
                    ]}

                    accessibilityRole="button"
                    accessibilityLabel={t("common.add")}
                    onPress={addCustomReminder}
                  >
                    <Plus size={16} color={tokens.fgOnPrimary} strokeWidth={2.2} />
                  </Pressable>
                  )}
                </View>
              )}
              <Pressable
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
