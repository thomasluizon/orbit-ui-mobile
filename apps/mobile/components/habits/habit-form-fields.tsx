import { useState, useMemo, useCallback, type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
} from "react-native";
import {
  X,
  Plus,
  Bell,
  Check,
  ShieldAlert,
  PenSquare,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type {
  FrequencyUnit,
  ScheduledReminderWhen,
  HabitTag,
} from "@orbit/shared/types/habit";
import { tagKeys, QUERY_STALE_TIMES } from "@orbit/shared/query";
import { API } from "@orbit/shared/api";
import { HabitChecklist } from "./habit-checklist";
import { GoalLinkingField } from "./goal-linking-field";
import type { TagSelectionState } from "@/hooks/use-tag-selection";
import type { HabitFormHelpers } from "@/hooks/use-habit-form";
import { useHasProAccess } from "@/hooks/use-profile";
import { useTags } from "@/hooks/use-tags";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { AppSelect } from "@/components/ui/app-select";
import { apiClient } from "@/lib/api-client";
import { radius } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

type ThemeColors = ReturnType<typeof useAppTheme>["colors"];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitFormFieldsProps {
  formHelpers: HabitFormHelpers;
  tags: TagSelectionState;
  selectedGoalIds: string[];
  atGoalLimit: boolean;
  onToggleGoal: (goalId: string) => void;
  reminderTimes: number[];
  onReminderTimesChange: (times: number[]) => void;
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Reminder presets
// ---------------------------------------------------------------------------

const REMINDER_PRESETS = [
  { value: 0, key: "habits.form.reminderAtTime" },
  { value: 5, key: "habits.form.reminder5min" },
  { value: 10, key: "habits.form.reminder10min" },
  { value: 15, key: "habits.form.reminder15min" },
  { value: 30, key: "habits.form.reminder30min" },
  { value: 60, key: "habits.form.reminder1hour" },
  { value: 120, key: "habits.form.reminder2hours" },
  { value: 360, key: "habits.form.reminder6hours" },
  { value: 720, key: "habits.form.reminder12hours" },
  { value: 1440, key: "habits.form.reminder1day" },
] as const;

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

function isValidTime(time: string): boolean {
  if (time.length !== 5) return true;
  const [hStr, mStr] = time.split(":");
  const h = Number.parseInt(hStr ?? "", 10);
  const m = Number.parseInt(mStr ?? "", 10);
  return (
    !Number.isNaN(h) &&
    !Number.isNaN(m) &&
    h >= 0 &&
    h <= 23 &&
    m >= 0 &&
    m <= 59
  );
}

function formatScheduledTimeInput(value: string): string {
  let v = value.replace(/\D/g, "");
  if (v.length > 4) v = v.slice(0, 4);
  if (v.length >= 3) v = v.slice(0, 2) + ":" + v.slice(2);
  return v;
}

function isValidScheduledTime(time: string): boolean {
  if (time.length !== 5) return false;
  const [hStr, mStr] = time.split(":");
  const h = Number.parseInt(hStr ?? "", 10);
  const m = Number.parseInt(mStr ?? "", 10);
  return (
    !Number.isNaN(h) &&
    !Number.isNaN(m) &&
    h >= 0 &&
    h <= 23 &&
    m >= 0 &&
    m <= 59
  );
}

// ---------------------------------------------------------------------------
// Reminder sub-component
// ---------------------------------------------------------------------------

interface ReminderSectionProps {
  colors: ThemeColors;
  reminderEnabled: boolean;
  reminderTimes: number[];
  onReminderTimesChange: (times: number[]) => void;
  onToggleReminder: () => void;
  reminderLabel: (minutes: number) => string;
}

function ReminderSection({
  colors,
  reminderEnabled,
  reminderTimes,
  onReminderTimesChange,
  onToggleReminder,
  reminderLabel,
}: Readonly<ReminderSectionProps>) {
  const { t } = useTranslation();
  const sectionStyles = useMemo(() => createSectionStyles(colors), [colors]);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"min" | "hours" | "days">("min");

  const availablePresets = useMemo(
    () => REMINDER_PRESETS.filter((p) => !reminderTimes.includes(p.value)),
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
          <Bell size={16} color={colors.primary} />
          <Text style={sectionStyles.headerLabel}>
            {t("habits.form.reminder")}
          </Text>
        </View>
        <Switch
          value={reminderEnabled}
          onValueChange={onToggleReminder}
          trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>
      {reminderEnabled && (
        <View style={sectionStyles.body}>
          {/* Selected reminder chips */}
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
                  <X size={12} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Add reminder */}
          <TouchableOpacity
            style={sectionStyles.addButton}
            onPress={() => {
              setShowAddReminder(!showAddReminder);
              setShowCustomInput(false);
            }}
            activeOpacity={0.7}
          >
            <Plus size={14} color={colors.primary} />
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
                  <TextInput
                    value={customValue}
                    placeholder={t("habits.form.reminderCustomPlaceholder")}
                    placeholderTextColor={colors.textMuted}
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
                    <Plus size={14} color={colors.white} />
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
                    { color: colors.primary, fontWeight: "500" },
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

// ---------------------------------------------------------------------------
// Scheduled reminder sub-component
// ---------------------------------------------------------------------------

interface ScheduledReminderSectionProps {
  colors: ThemeColors;
  reminderEnabled: boolean;
  scheduledReminders:
    | Array<{ when: ScheduledReminderWhen; time: string }>
    | undefined;
  onToggleReminder: () => void;
  onSetScheduledReminders: (
    reminders: Array<{ when: ScheduledReminderWhen; time: string }>,
  ) => void;
}

function ScheduledReminderSection({
  colors,
  reminderEnabled,
  scheduledReminders,
  onToggleReminder,
  onSetScheduledReminders,
}: Readonly<ScheduledReminderSectionProps>) {
  const { t } = useTranslation();
  const sectionStyles = useMemo(() => createSectionStyles(colors), [colors]);
  const MAX_SCHEDULED_REMINDERS = 5;
  const [showForm, setShowForm] = useState(false);
  const [when, setWhen] = useState<ScheduledReminderWhen>("same_day");
  const [time, setTime] = useState("");

  const atLimit = (scheduledReminders?.length ?? 0) >= MAX_SCHEDULED_REMINDERS;

  function addScheduledReminder() {
    if (!isValidScheduledTime(time)) return;
    if (atLimit) return;
    const current = scheduledReminders ?? [];
    const duplicate = current.some(
      (sr) => sr.when === when && sr.time === time,
    );
    if (duplicate) return;
    onSetScheduledReminders([...current, { when, time }]);
    setTime("");
    setShowForm(false);
  }

  function removeScheduledReminder(index: number) {
    const current = scheduledReminders ?? [];
    onSetScheduledReminders(current.filter((_, i) => i !== index));
  }

  function scheduledReminderLabel(sr: {
    when: ScheduledReminderWhen;
    time: string;
  }): string {
    const timeDisplay = sr.time.slice(0, 5);
    if (sr.when === "day_before") {
      return t("habits.form.scheduledReminderDayBeforeAt", {
        time: timeDisplay,
      });
    }
    return t("habits.form.scheduledReminderSameDayAt", { time: timeDisplay });
  }

  return (
    <View style={sectionStyles.container}>
      <View style={sectionStyles.headerRow}>
        <View style={sectionStyles.headerLeft}>
          <Bell size={16} color={colors.primary} />
          <Text style={sectionStyles.headerLabel}>
            {t("habits.form.scheduledReminder")}
          </Text>
        </View>
        <Switch
          value={reminderEnabled}
          onValueChange={onToggleReminder}
          trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>
      {reminderEnabled && (
        <View style={sectionStyles.body}>
          {(scheduledReminders?.length ?? 0) > 0 && (
            <View style={sectionStyles.chipsRow}>
              {(scheduledReminders ?? []).map((sr, idx) => (
                <View key={`${sr.when}-${sr.time}`} style={sectionStyles.chip}>
                  <Text style={sectionStyles.chipText}>
                    {scheduledReminderLabel(sr)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeScheduledReminder(idx)}
                    activeOpacity={0.7}
                  >
                    <X size={12} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {!showForm && !atLimit && (
            <TouchableOpacity
              style={sectionStyles.addButton}
              onPress={() => setShowForm(true)}
              activeOpacity={0.7}
            >
              <Plus size={14} color={colors.primary} />
              <Text style={sectionStyles.addButtonText}>
                {t("habits.form.scheduledReminderAdd")}
              </Text>
            </TouchableOpacity>
          )}

          {atLimit && (
            <Text style={sectionStyles.limitText}>
              {t("habits.form.scheduledReminderMax")}
            </Text>
          )}

          {showForm && (
            <View style={sectionStyles.formBody}>
              {/* Day before / Same day toggle */}
              <View style={sectionStyles.whenRow}>
                <TouchableOpacity
                  style={[
                    sectionStyles.whenButton,
                    when === "day_before" && sectionStyles.whenButtonActive,
                  ]}
                  onPress={() => setWhen("day_before")}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      sectionStyles.whenButtonText,
                      when === "day_before" &&
                        sectionStyles.whenButtonTextActive,
                    ]}
                  >
                    {t("habits.form.scheduledReminderDayBefore")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    sectionStyles.whenButton,
                    when === "same_day" && sectionStyles.whenButtonActive,
                  ]}
                  onPress={() => setWhen("same_day")}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      sectionStyles.whenButtonText,
                      when === "same_day" && sectionStyles.whenButtonTextActive,
                    ]}
                  >
                    {t("habits.form.scheduledReminderSameDay")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Time input + add/cancel */}
              <View style={sectionStyles.timeRow}>
                <TextInput
                  value={time}
                  placeholder={t(
                    "habits.form.scheduledReminderTimePlaceholder",
                  )}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                  style={sectionStyles.timeInput}
                  onChangeText={(val) => setTime(formatScheduledTimeInput(val))}
                  onSubmitEditing={addScheduledReminder}
                />
                <TouchableOpacity
                  style={[
                    sectionStyles.timeAddButton,
                    !isValidScheduledTime(time) && { opacity: 0.4 },
                  ]}
                  disabled={!isValidScheduledTime(time)}
                  onPress={addScheduledReminder}
                  activeOpacity={0.7}
                >
                  <Text style={sectionStyles.timeAddButtonText}>
                    {t("common.add")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={sectionStyles.timeCancelButton}
                  onPress={() => {
                    setShowForm(false);
                    setTime("");
                  }}
                  activeOpacity={0.7}
                >
                  <X size={14} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Slip alert sub-component
// ---------------------------------------------------------------------------

interface SlipAlertSectionProps {
  colors: ThemeColors;
  hasProAccess: boolean;
  slipAlertEnabled: boolean;
  onToggle: () => void;
}

function SlipAlertSection({
  colors,
  hasProAccess,
  slipAlertEnabled,
  onToggle,
}: Readonly<SlipAlertSectionProps>) {
  const { t } = useTranslation();
  const sectionStyles = useMemo(() => createSectionStyles(colors), [colors]);

  return (
    <View style={sectionStyles.container}>
      {hasProAccess ? (
        <View style={sectionStyles.headerRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={sectionStyles.headerLeft}>
              <ShieldAlert size={16} color={colors.primary} />
              <Text style={sectionStyles.headerLabel}>
                {t("habits.form.slipAlert")}
              </Text>
            </View>
            <Text style={sectionStyles.slipDescription}>
              {t("habits.form.slipAlertDescription")}
            </Text>
          </View>
          <Switch
            value={slipAlertEnabled}
            onValueChange={onToggle}
            trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>
      ) : (
        <View style={sectionStyles.headerRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={sectionStyles.headerLeft}>
              <ShieldAlert size={16} color={colors.textMuted} />
              <Text
                style={[sectionStyles.headerLabel, { color: colors.textMuted }]}
              >
                {t("habits.form.slipAlert")}
              </Text>
              <View style={sectionStyles.proBadge}>
                <Text style={sectionStyles.proBadgeText}>
                  {t("common.proBadge")}
                </Text>
              </View>
            </View>
            <Text style={sectionStyles.slipDescription}>
              {t("habits.form.slipAlertDescription")}
            </Text>
          </View>
          <View style={[sectionStyles.disabledSwitch]}>
            <View style={sectionStyles.disabledThumb} />
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitFormFields({
  formHelpers,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  reminderTimes,
  onReminderTimesChange,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sectionStyles = useMemo(() => createSectionStyles(colors), [colors]);
  const hasProAccess = useHasProAccess();
  const { tags: availableTags } = useTags();

  const {
    form,
    isOneTime,
    isGeneral,
    isFlexible,
    showDayPicker,
    showEndDate,
    daysList,
    frequencyUnits,
    setOneTime,
    setRecurring,
    setFlexible,
    setGeneral,
    toggleDay,
    formatTimeInput,
    formatEndTimeInput,
  } = formHelpers;

  const { watch, setValue } = form;

  const watchedFrequencyUnit = watch("frequencyUnit");
  const watchedFrequencyQuantity = watch("frequencyQuantity");
  const watchedDays = watch("days");
  const watchedDueDate = watch("dueDate");
  const watchedDueTime = watch("dueTime");
  const watchedDueEndTime = watch("dueEndTime");
  const watchedEndDate = watch("endDate");
  const watchedIsBadHabit = watch("isBadHabit");
  const watchedReminderEnabled = watch("reminderEnabled");
  const watchedSlipAlertEnabled = watch("slipAlertEnabled");
  const watchedChecklistItems = watch("checklistItems");
  const watchedScheduledReminders = watch("scheduledReminders");
  const watchedTitle = watch("title");
  const watchedDescription = watch("description");

  // Reminder label function
  function reminderLabel(minutes: number): string {
    const preset = REMINDER_PRESETS.find((p) => p.value === minutes);
    if (preset) return t(preset.key);
    if (minutes < 60) return `${minutes} ${t("habits.form.reminderMinutes")}`;
    if (minutes < 1440) {
      const h = Math.floor(minutes / 60);
      return `${h} ${t(h === 1 ? "habits.form.reminderHour" : "habits.form.reminderHours")}`;
    }
    const d = Math.floor(minutes / 1440);
    return `${d} ${t(d === 1 ? "habits.form.reminderDay" : "habits.form.reminderDays")}`;
  }

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t("habits.form.title")}</Text>
        <TextInput
          value={watchedTitle}
          maxLength={200}
          placeholder={t("habits.form.titlePlaceholder")}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onChangeText={(val) => setValue("title", val, { shouldDirty: true })}
        />
      </View>

      {/* Description */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t("habits.form.description")}</Text>
        <TextInput
          value={watchedDescription}
          placeholder={t("habits.form.descriptionPlaceholder")}
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={2}
          style={[styles.input, styles.textarea]}
          textAlignVertical="top"
          onChangeText={(val) =>
            setValue("description", val, { shouldDirty: true })
          }
        />
      </View>

      {/* Checklist */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t("habits.form.checklist")}</Text>
        <HabitChecklist
          items={watchedChecklistItems ?? []}
          editable
          onItemsChange={(items) =>
            setValue("checklistItems", items, { shouldDirty: true })
          }
        />
      </View>

      {/* Frequency toggle */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t("habits.form.frequency")}</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              isOneTime && styles.toggleButtonActive,
            ]}
            onPress={setOneTime}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.toggleButtonText,
                isOneTime && styles.toggleButtonTextActive,
              ]}
            >
              {t("habits.form.oneTimeTask")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              !isOneTime &&
                !isGeneral &&
                !isFlexible &&
                styles.toggleButtonActive,
            ]}
            onPress={setRecurring}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.toggleButtonText,
                !isOneTime &&
                  !isGeneral &&
                  !isFlexible &&
                  styles.toggleButtonTextActive,
              ]}
            >
              {t("habits.form.recurring")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              isFlexible && styles.toggleButtonActive,
            ]}
            onPress={setFlexible}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.toggleButtonText,
                isFlexible && styles.toggleButtonTextActive,
              ]}
            >
              {t("habits.form.flexible")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              isGeneral && styles.toggleButtonActive,
            ]}
            onPress={setGeneral}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.toggleButtonText,
                isGeneral && styles.toggleButtonTextActive,
              ]}
            >
              {t("habits.form.general")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Flexible description */}
      {isFlexible && (
        <Text style={styles.flexibleHint}>
          {t("habits.form.flexibleDescription", {
            n: watchedFrequencyQuantity ?? 3,
            unit: watchedFrequencyUnit
              ? t(
                  `habits.form.unit${watchedFrequencyUnit}` as "habits.form.unitDay",
                )
              : "",
          })}
        </Text>
      )}

      {/* Frequency picker */}
      {!isOneTime && !isGeneral && (
        <View style={styles.frequencyRow}>
          <View style={styles.frequencyField}>
            <Text style={styles.label}>
              {isFlexible
                ? t("habits.form.timesPerUnit")
                : t("habits.form.every")}
            </Text>
            <TextInput
              value={String(watchedFrequencyQuantity ?? "")}
              keyboardType="number-pad"
              style={styles.input}
              onChangeText={(val) => {
                const num = Number(val);
                if (!val) {
                  setValue("frequencyQuantity", null, { shouldDirty: true });
                } else if (!Number.isNaN(num)) {
                  setValue("frequencyQuantity", num, { shouldDirty: true });
                }
              }}
            />
          </View>
          <View style={styles.frequencyField}>
            <Text style={styles.label}>{t("habits.form.unit")}</Text>
            <AppSelect
              value={watchedFrequencyUnit ?? null}
              options={frequencyUnits.map((unit) => ({
                value: unit.value,
                label: unit.label,
              }))}
              label={t("habits.form.unit")}
              onChange={(value) =>
                setValue("frequencyUnit", value as FrequencyUnit, {
                  shouldDirty: true,
                })
              }
            />
          </View>
        </View>
      )}

      {/* Day picker */}
      {showDayPicker && !isGeneral && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("habits.form.activeDays")}</Text>
          <View style={styles.daysRow}>
            {daysList.map((day) => (
              <TouchableOpacity
                key={day.value}
                style={[
                  styles.dayButton,
                  watchedDays?.includes(day.value) && styles.dayButtonActive,
                ]}
                onPress={() => toggleDay(day.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayButtonText,
                    watchedDays?.includes(day.value) &&
                      styles.dayButtonTextActive,
                  ]}
                >
                  {day.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Due date */}
      {!isGeneral && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("habits.form.dueDate")}</Text>
          <AppDatePicker
            value={watchedDueDate}
            placeholder={t("common.selectDate")}
            onChange={(value) =>
              setValue("dueDate", value, { shouldDirty: true })
            }
          />
        </View>
      )}

      {/* Due time */}
      {!isGeneral && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("habits.form.dueTime")}</Text>
          <TextInput
            value={watchedDueTime}
            placeholder={t("habits.form.scheduledReminderTimePlaceholder")}
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={5}
            style={styles.input}
            onChangeText={(val) => {
              const formatted = formatTimeInput(val);
              setValue("dueTime", formatted, { shouldDirty: true });
            }}
          />
          {watchedDueTime.length === 5 && !isValidTime(watchedDueTime) && (
            <Text style={styles.validationError}>
              {t("habits.form.invalidTime")}
            </Text>
          )}
        </View>
      )}

      {/* End time */}
      {watchedDueTime && !isGeneral && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("habits.form.dueEndTime")}</Text>
          <TextInput
            value={watchedDueEndTime}
            placeholder={t("habits.form.scheduledReminderTimePlaceholder")}
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={5}
            style={styles.input}
            onChangeText={(val) => {
              const formatted = formatEndTimeInput(val);
              setValue("dueEndTime", formatted, { shouldDirty: true });
            }}
          />
          {watchedDueEndTime.length === 5 &&
            !isValidTime(watchedDueEndTime) && (
              <Text style={styles.validationError}>
                {t("habits.form.invalidEndTime")}
              </Text>
            )}
          {watchedDueEndTime &&
            watchedDueTime &&
            watchedDueEndTime <= watchedDueTime && (
              <Text style={styles.validationError}>
                {t("habits.form.endTimeBeforeStartTime")}
              </Text>
            )}
        </View>
      )}

      {/* End date (recurring only) */}
      {showEndDate && (
        <View style={styles.fieldGroup}>
          {watchedEndDate ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("habits.form.endDate")}</Text>
              <View style={styles.endDateRow}>
                <View style={styles.endDatePicker}>
                  <AppDatePicker
                    value={watchedEndDate}
                    placeholder={t("common.selectDate")}
                    onChange={(value) =>
                      setValue("endDate", value, { shouldDirty: true })
                    }
                  />
                </View>
                <TouchableOpacity
                  style={styles.removeEndDateButton}
                  onPress={() => setValue("endDate", "", { shouldDirty: true })}
                  activeOpacity={0.7}
                >
                  <X size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {watchedEndDate &&
              watchedDueDate &&
              watchedEndDate < watchedDueDate ? (
                <Text style={styles.validationError}>
                  {t("habits.form.endDateBeforeDueDate")}
                </Text>
              ) : (
                <Text style={styles.hintText}>
                  {t("habits.form.endDateHint")}
                </Text>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={sectionStyles.addButton}
              onPress={() =>
                setValue("endDate", watchedDueDate || "", { shouldDirty: true })
              }
              activeOpacity={0.7}
            >
              <Plus size={14} color={colors.primary} />
              <Text style={sectionStyles.addButtonText}>
                {t("habits.form.addEndDate")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Reminder (only when dueTime is set, hidden for general habits) */}
      {watchedDueTime && !isGeneral && (
        <ReminderSection
          colors={colors}
          reminderEnabled={watchedReminderEnabled}
          reminderTimes={reminderTimes}
          onReminderTimesChange={onReminderTimesChange}
          onToggleReminder={() =>
            setValue("reminderEnabled", !watchedReminderEnabled, {
              shouldDirty: true,
            })
          }
          reminderLabel={reminderLabel}
        />
      )}

      {/* Scheduled reminders (when no dueTime, hidden for general habits) */}
      {!watchedDueTime && !isGeneral && (
        <ScheduledReminderSection
          colors={colors}
          reminderEnabled={watchedReminderEnabled}
          scheduledReminders={watchedScheduledReminders}
          onToggleReminder={() =>
            setValue("reminderEnabled", !watchedReminderEnabled, {
              shouldDirty: true,
            })
          }
          onSetScheduledReminders={(reminders) =>
            setValue("scheduledReminders", reminders, { shouldDirty: true })
          }
        />
      )}

      {/* Tags */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t("habits.form.tags")}</Text>
        <View style={styles.tagsRow}>
          {availableTags.map((tag) => {
            const isSelected = tags.selectedTagIds.includes(tag.id);
            const isDisabled = !isSelected && tags.atTagLimit;
            return (
              <View
                key={tag.id}
                style={[
                  styles.tagChip,
                  isSelected && { backgroundColor: tag.color },
                  !isSelected && styles.tagChipInactive,
                  isDisabled && { opacity: 0.3 },
                ]}
              >
                <TouchableOpacity
                  style={styles.tagChipMain}
                  disabled={isDisabled}
                  onPress={() => tags.toggleTag(tag.id)}
                  activeOpacity={0.7}
                >
                  {!isSelected && (
                    <View
                      style={[styles.tagDot, { backgroundColor: tag.color }]}
                    />
                  )}
                  <Text
                    style={[
                      styles.tagChipText,
                      isSelected && { color: colors.white },
                    ]}
                  >
                    {tag.name}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.tagAction}
                  onPress={() => tags.startEditTag(tag)}
                  activeOpacity={0.7}
                >
                  <PenSquare
                    size={12}
                    color={
                      isSelected ? "rgba(255,255,255,0.7)" : colors.textMuted
                    }
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.tagAction}
                  onPress={() => tags.deleteTag(tag.id, async () => {})}
                  activeOpacity={0.7}
                >
                  <X
                    size={12}
                    color={
                      isSelected ? "rgba(255,255,255,0.7)" : colors.textMuted
                    }
                  />
                </TouchableOpacity>
              </View>
            );
          })}
          {!tags.showNewTag && !tags.atTagLimit && (
            <TouchableOpacity
              style={styles.newTagButton}
              onPress={() => tags.setShowNewTag(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.newTagButtonText}>
                + {t("habits.form.newTag")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Inline tag edit */}
        {tags.editingTagId && (
          <View style={styles.tagEditSection}>
            <View style={styles.colorPicker}>
              {tags.tagColors.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    tags.editTagColor === c && styles.colorDotSelected,
                  ]}
                  onPress={() => tags.setEditTagColor(c)}
                  activeOpacity={0.7}
                />
              ))}
            </View>
            <View style={styles.tagFormRow}>
              <TextInput
                value={tags.editTagName}
                maxLength={50}
                style={[styles.input, { flex: 1 }]}
                onChangeText={tags.setEditTagName}
                onSubmitEditing={() => tags.saveEditTag(async () => {})}
              />
              <TouchableOpacity
                style={styles.tagFormSave}
                onPress={() => tags.saveEditTag(async () => {})}
                activeOpacity={0.7}
              >
                <Text style={styles.tagFormSaveText}>{t("common.save")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tagFormCancel}
                onPress={tags.cancelEditTag}
                activeOpacity={0.7}
              >
                <X size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Inline new tag creation */}
        {tags.showNewTag && (
          <View style={styles.tagEditSection}>
            <View style={styles.colorPicker}>
              {tags.tagColors.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    tags.newTagColor === c && styles.colorDotSelected,
                  ]}
                  onPress={() => tags.setNewTagColor(c)}
                  activeOpacity={0.7}
                />
              ))}
            </View>
            <View style={styles.tagFormRow}>
              <TextInput
                value={tags.newTagName}
                placeholder={t("habits.form.tagName")}
                placeholderTextColor={colors.textMuted}
                maxLength={50}
                style={[styles.input, { flex: 1 }]}
                onChangeText={tags.setNewTagName}
                onSubmitEditing={() =>
                  tags.createAndSelectTag(async () => null)
                }
              />
              <TouchableOpacity
                style={styles.tagFormSave}
                onPress={() => tags.createAndSelectTag(async () => null)}
                activeOpacity={0.7}
              >
                <Text style={styles.tagFormSaveText}>{t("common.add")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tagFormCancel}
                onPress={() => tags.setShowNewTag(false)}
                activeOpacity={0.7}
              >
                <X size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <GoalLinkingField
        selectedGoalIds={selectedGoalIds}
        atGoalLimit={atGoalLimit}
        onToggleGoal={onToggleGoal}
      />

      {/* Bad habit toggle */}
      {!isGeneral && (
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() =>
            setValue("isBadHabit", !watchedIsBadHabit, { shouldDirty: true })
          }
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.customCheckbox,
              watchedIsBadHabit && styles.customCheckboxChecked,
            ]}
          >
            {watchedIsBadHabit && <Check size={12} color={colors.white} />}
          </View>
          <Text style={styles.checkboxLabel}>
            {t("habits.form.badHabitLabel")}
          </Text>
        </TouchableOpacity>
      )}

      {/* Slip alert toggle (only when bad habit) */}
      {watchedIsBadHabit && (
        <SlipAlertSection
          colors={colors}
          hasProAccess={hasProAccess}
          slipAlertEnabled={watchedSlipAlertEnabled}
          onToggle={() =>
            setValue("slipAlertEnabled", !watchedSlipAlertEnabled, {
              shouldDirty: true,
            })
          }
        />
      )}

      {/* Slot for extra fields (e.g. sub-habits) */}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section styles (shared by sub-components)
// ---------------------------------------------------------------------------

function createSectionStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 16,
      backgroundColor: colors.surfaceGround,
      gap: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.textPrimary,
    },
    body: {
      gap: 12,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
      backgroundColor: colors.primary_15,
    },
    chipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
    },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    addButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
    },
    dropdown: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      backgroundColor: colors.surfaceOverlay,
      padding: 4,
      marginTop: 8,
    },
    dropdownItem: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.xl,
    },
    dropdownItemText: {
      fontSize: 14,
      color: colors.textPrimary,
    },
    customRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    customInput: {
      width: 60,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      borderRadius: radius.xl,
      paddingVertical: 6,
      paddingHorizontal: 12,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    unitRow: {
      flexDirection: "row",
      gap: 4,
    },
    unitButton: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    unitButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    unitButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    unitButtonTextActive: {
      color: colors.white,
    },
    customAddButton: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    limitText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    formBody: {
      gap: 12,
    },
    whenRow: {
      flexDirection: "row",
      gap: 8,
    },
    whenButton: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    whenButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    whenButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    whenButtonTextActive: {
      color: colors.white,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    timeInput: {
      flex: 1,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      borderRadius: radius.xl,
      paddingVertical: 8,
      paddingHorizontal: 12,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    timeAddButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.xl,
      backgroundColor: colors.primary,
    },
    timeAddButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.white,
    },
    timeCancelButton: {
      padding: 8,
    },
    slipDescription: {
      fontSize: 12,
      color: colors.textMuted,
      marginLeft: 24,
    },
    proBadge: {
      backgroundColor: colors.primary_20,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    proBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.primary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    disabledSwitch: {
      width: 40,
      height: 22,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceElevated,
      opacity: 0.5,
      justifyContent: "center",
      paddingHorizontal: 2,
    },
    disabledThumb: {
      width: 18,
      height: 18,
      borderRadius: radius.full,
      backgroundColor: colors.white,
    },
  });
}

// ---------------------------------------------------------------------------
// Main styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: 20,
    },
    fieldGroup: {
      gap: 6,
    },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      borderRadius: radius.lg,
      paddingVertical: 12,
      paddingHorizontal: 16,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    textarea: {
      minHeight: 60,
      textAlignVertical: "top",
    },
    validationError: {
      fontSize: 12,
      color: colors.red400,
      fontWeight: "500",
    },
    hintText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    flexibleHint: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: -12,
    },
    toggleRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    toggleButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toggleButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    toggleButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    toggleButtonTextActive: {
      color: colors.white,
    },
    frequencyRow: {
      flexDirection: "row",
      gap: 12,
    },
    frequencyField: {
      flex: 1,
      gap: 6,
    },
    unitPicker: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
    },
    unitOption: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    unitOptionActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    unitOptionText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    unitOptionTextActive: {
      color: colors.white,
    },
    daysRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    dayButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dayButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    dayButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    dayButtonTextActive: {
      color: colors.white,
    },
    endDateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    endDatePicker: {
      flex: 1,
    },
    removeEndDateButton: {
      padding: 8,
      borderRadius: radius.full,
    },
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    tagChip: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: radius.full,
    },
    tagChipInactive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tagChipMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 12,
      paddingRight: 4,
      paddingVertical: 6,
    },
    tagDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    tagChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    tagAction: {
      paddingHorizontal: 4,
      paddingVertical: 6,
    },
    newTagButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
    },
    newTagButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
    },
    tagEditSection: {
      gap: 8,
    },
    colorPicker: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
    },
    colorDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    colorDotSelected: {
      borderWidth: 2,
      borderColor: colors.white,
    },
    tagFormRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    tagFormSave: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.xl,
      backgroundColor: colors.primary,
    },
    tagFormSaveText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.white,
    },
    tagFormCancel: {
      padding: 8,
    },
    checkboxRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 4,
    },
    customCheckbox: {
      width: 20,
      height: 20,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    customCheckboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkboxLabel: {
      fontSize: 14,
      color: colors.textPrimary,
    },
  });
}
