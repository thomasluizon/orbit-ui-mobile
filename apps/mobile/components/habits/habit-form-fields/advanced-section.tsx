import { type ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { X, Plus, TrendingUp, TrendingDown } from "lucide-react-native";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { HABIT_REMINDER_PRESETS } from "@orbit/shared/utils";
import { MAX_HABIT_DESCRIPTION_LENGTH } from "@orbit/shared/validation";
import { HabitChecklist } from "../habit-checklist";
import { ChecklistTemplates } from "../checklist-templates";
import { GoalLinkingField } from "../goal-linking-field";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { AppTimePicker } from "@/components/ui/app-time-picker";
import { type AppTokens, createSectionStyles } from "./styles";
import { BufferedSheetInput } from "./buffered-sheet-input";
import { ReminderSection } from "./reminder-section";
import { ScheduledReminderSection } from "./scheduled-reminder-section";
import { SlipAlertSection } from "./slip-alert-section";
import type {
  HabitFormControl,
  HabitFormSetValue,
  HabitFormStyles,
} from "./types";

interface AdvancedSectionProps {
  control: HabitFormControl;
  isGeneral: boolean;
  showEndDate: boolean;
  hasProAccess: boolean;
  reminderTimes: number[];
  onReminderTimesChange: (times: number[]) => void;
  onToggleReminder: (nextEnabled: boolean) => void;
  onValidationError: (message: string) => void;
  selectedGoalIds: string[];
  atGoalLimit: boolean;
  onToggleGoal: (goalId: string) => void;
  registerFlush: (flush: () => void) => () => void;
  setValue: HabitFormSetValue;
  styles: HabitFormStyles;
  sectionStyles: ReturnType<typeof createSectionStyles>;
  tokens: AppTokens;
  children?: ReactNode;
}

export function AdvancedSection({
  control,
  isGeneral,
  showEndDate,
  hasProAccess,
  reminderTimes,
  onReminderTimesChange,
  onToggleReminder,
  onValidationError,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  registerFlush,
  setValue,
  styles,
  sectionStyles,
  tokens,
  children,
}: Readonly<AdvancedSectionProps>) {
  const { t } = useTranslation();
  const description = useWatch({ control, name: "description" }) ?? "";
  const rawChecklistItems = useWatch({ control, name: "checklistItems" });
  const checklistItems = rawChecklistItems ?? [];
  const dueDate = useWatch({ control, name: "dueDate" }) ?? "";
  const dueTime = useWatch({ control, name: "dueTime" }) ?? "";
  const dueEndTime = useWatch({ control, name: "dueEndTime" }) ?? "";
  const endDate = useWatch({ control, name: "endDate" }) ?? "";
  const reminderEnabled = useWatch({ control, name: "reminderEnabled" }) ?? false;
  const scheduledReminders =
    useWatch({ control, name: "scheduledReminders" }) ?? [];
  const isBadHabit = useWatch({ control, name: "isBadHabit" }) ?? false;
  const slipAlertEnabled =
    useWatch({ control, name: "slipAlertEnabled" }) ?? false;

  function reminderLabel(minutes: number): string {
    const preset = HABIT_REMINDER_PRESETS.find((p) => p.value === minutes);
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
    <View style={styles.advancedSection}>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t("habits.form.description")}</Text>
        <BufferedSheetInput
          value={description}
          registerFlush={registerFlush}
          placeholder={t("habits.form.descriptionPlaceholder")}
          maxLength={MAX_HABIT_DESCRIPTION_LENGTH}
          multiline
          numberOfLines={2}
          style={styles.textarea}
          textAlignVertical="top"
          onCommit={(val) => setValue("description", val, { shouldDirty: true })}
        />
      </View>

      <View style={[styles.fieldGroup, { gap: 12 }]}>
        <Text style={styles.label}>{t("habits.form.checklist")}</Text>
        <HabitChecklist
          items={checklistItems}
          editable
          onItemsChange={(items) =>
            setValue("checklistItems", items, { shouldDirty: true })
          }
        />
        <View style={{ marginTop: 4 }}>
          <ChecklistTemplates
            items={checklistItems}
            onLoad={(items) =>
              setValue("checklistItems", items, { shouldDirty: true })
            }
          />
        </View>
      </View>

      {dueTime && !isGeneral && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("habits.form.dueEndTime")}</Text>
          <AppTimePicker
            value={dueEndTime}
            placeholder={t("habits.form.scheduledReminderTimePlaceholder")}
            accessibilityLabel={t("habits.form.dueEndTime")}
            onChange={(nextValue) =>
              setValue("dueEndTime", nextValue, { shouldDirty: true })
            }
            onClear={() => setValue("dueEndTime", "", { shouldDirty: true })}
          />
        </View>
      )}

      {showEndDate && (
        <View style={styles.fieldGroup}>
          {endDate ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("habits.form.endDate")}</Text>
              <View style={styles.endDateRow}>
                <View style={styles.endDatePicker}>
                  <AppDatePicker
                    value={endDate}
                    placeholder={t("common.selectDate")}
                    onChange={(value) =>
                      setValue("endDate", value, { shouldDirty: true })
                    }
                  />
                </View>
                <TouchableOpacity
                  style={styles.removeEndDateButton}
                  accessibilityRole="button"
                  accessibilityLabel={t("habits.form.removeEndDate")}
                  onPress={() => setValue("endDate", "", { shouldDirty: true })}
                  activeOpacity={0.7}
                >
                  <X size={16} color={tokens.fg3} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
              <Text style={styles.hintText}>{t("habits.form.endDateHint")}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={sectionStyles.addButton}
              accessibilityRole="button"
              onPress={() =>
                setValue("endDate", dueDate || "", { shouldDirty: true })
              }
              activeOpacity={0.7}
            >
              <Plus size={14} color={tokens.fg2} strokeWidth={2} />
              <Text style={sectionStyles.addButtonText}>
                {t("habits.form.addEndDate")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {dueTime && !isGeneral && (
        <ReminderSection
          tokens={tokens}
          reminderEnabled={reminderEnabled}
          reminderTimes={reminderTimes}
          onReminderTimesChange={onReminderTimesChange}
          onToggleReminder={() => onToggleReminder(!reminderEnabled)}
          reminderLabel={reminderLabel}
        />
      )}

      {!dueTime && !isGeneral && (
        <ScheduledReminderSection
          tokens={tokens}
          reminderEnabled={reminderEnabled}
          scheduledReminders={scheduledReminders}
          onToggleReminder={() => onToggleReminder(!reminderEnabled)}
          onSetScheduledReminders={(reminders) =>
            setValue("scheduledReminders", reminders, { shouldDirty: true })
          }
          onValidationError={onValidationError}
        />
      )}

      {hasProAccess && (
        <GoalLinkingField
          selectedGoalIds={selectedGoalIds}
          atGoalLimit={atGoalLimit}
          onToggleGoal={onToggleGoal}
        />
      )}

      {!isGeneral && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("habits.form.habitType")}</Text>
          <View style={styles.segmentGroup}>
            <TouchableOpacity
              style={[styles.segment, !isBadHabit && styles.segmentActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: !isBadHabit }}
              accessibilityLabel={t("habits.form.habitTypeBuild")}
              onPress={() => setValue("isBadHabit", false, { shouldDirty: true })}
              activeOpacity={0.7}
            >
              <TrendingUp
                size={16}
                color={isBadHabit ? tokens.fg3 : tokens.primary}
                strokeWidth={2}
              />
              <Text
                style={[styles.segmentText, !isBadHabit && styles.segmentTextActive]}
              >
                {t("habits.form.habitTypeBuild")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, isBadHabit && styles.segmentActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isBadHabit }}
              accessibilityLabel={t("habits.form.habitTypeAvoid")}
              onPress={() => setValue("isBadHabit", true, { shouldDirty: true })}
              activeOpacity={0.7}
            >
              <TrendingDown
                size={16}
                color={isBadHabit ? tokens.primary : tokens.fg3}
                strokeWidth={2}
              />
              <Text
                style={[styles.segmentText, isBadHabit && styles.segmentTextActive]}
              >
                {t("habits.form.habitTypeAvoid")}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hintText}>
            {isBadHabit
              ? t("habits.form.habitTypeAvoidHint")
              : t("habits.form.habitTypeBuildHint")}
          </Text>
        </View>
      )}

      {isBadHabit && (
        <SlipAlertSection
          tokens={tokens}
          hasProAccess={hasProAccess}
          slipAlertEnabled={slipAlertEnabled}
          onToggle={() =>
            setValue("slipAlertEnabled", !slipAlertEnabled, {
              shouldDirty: true,
            })
          }
        />
      )}

      {children}
    </View>
  );
}
