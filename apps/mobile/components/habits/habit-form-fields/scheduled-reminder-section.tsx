import { useState, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { X, Plus, Bell } from '@/components/ui/icons';
import { useTranslation } from "react-i18next";
import type { ScheduledReminderWhen } from "@orbit/shared/types/habit";
import { formatLocaleTime } from "@orbit/shared/utils";
import {
  MAX_SCHEDULED_REMINDERS,
  validateScheduledReminders,
} from "@orbit/shared/validation";
import { AppTimePicker } from "@/components/ui/app-time-picker";
import { Switch } from "@/components/ui/settings-row";
import { type AppTokens, createSectionStyles } from "./styles";

interface ScheduledReminderSectionProps {
  tokens: AppTokens;
  reminderEnabled: boolean;
  scheduledReminders:
    | { when: ScheduledReminderWhen; time: string }[]
    | undefined;
  onToggleReminder: () => void;
  onSetScheduledReminders: (
    reminders: { when: ScheduledReminderWhen; time: string }[],
  ) => void;
  onValidationError: (message: string) => void;
  /**
   * When rendered as the secondary surface beside the offset-reminder card (a due-timed habit that
   * also holds scheduled reminders, #447 Bug 3), the master on/off is already owned by that card, so
   * this one drops its own switch to avoid a duplicate toggle.
   */
  nested?: boolean;
}

export function ScheduledReminderSection({
  tokens,
  reminderEnabled,
  scheduledReminders,
  onToggleReminder,
  onSetScheduledReminders,
  onValidationError,
  nested = false,
}: Readonly<ScheduledReminderSectionProps>) {
  const { t, i18n } = useTranslation();
  const deviceLocale = i18n.language;
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);
  const [showForm, setShowForm] = useState(false);
  const [when, setWhen] = useState<ScheduledReminderWhen>("same_day");
  const [time, setTime] = useState("");

  const atLimit = (scheduledReminders?.length ?? 0) >= MAX_SCHEDULED_REMINDERS;

  function addScheduledReminder() {
    if (!time) {
      onValidationError(t("habits.form.invalidScheduledReminderTime"));
      return;
    }
    const current = scheduledReminders ?? [];
    const candidate = [...current, { when, time }];
    const validationErrorKey = validateScheduledReminders(candidate);
    if (validationErrorKey) {
      onValidationError(
        t(validationErrorKey as "habits.form.scheduledReminderMax"),
      );
      return;
    }
    onSetScheduledReminders(candidate);
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
    const timeDisplay = formatLocaleTime(sr.time, deviceLocale);
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
          <Bell size={20} color={tokens.fg2} strokeWidth={1.8} />
          <Text style={sectionStyles.headerLabel}>
            {t("habits.form.scheduledReminder")}
          </Text>
        </View>
        {!nested && (
          <Switch
            on={reminderEnabled}
            onToggle={onToggleReminder}
            accessibilityLabel={t("habits.form.scheduledReminder")}
          />
        )}
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
                  <Pressable
                    style={({ pressed }) =>
                      pressed ? { transform: [{ scale: 0.96 }] } : null
                    }
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                    accessibilityRole="button"
                    accessibilityLabel={t("habits.form.removeScheduledReminder")}
                    onPress={() => removeScheduledReminder(idx)}
                  >
                    <X size={13} color={tokens.primary} strokeWidth={2.2} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {!showForm && !atLimit && (
            <Pressable
              style={({ pressed }) => [
                sectionStyles.addButton,
                pressed && { transform: [{ scale: 0.96 }] },
              ]}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              onPress={() => setShowForm(true)}
            >
              <Plus size={14} color={tokens.fg2} strokeWidth={2} />
              <Text style={sectionStyles.addButtonText}>
                {t("habits.form.scheduledReminderAdd")}
              </Text>
            </Pressable>
          )}

          {atLimit && (
            <Text style={sectionStyles.limitText}>
              {t("habits.form.scheduledReminderMax")}
            </Text>
          )}

          {showForm && (
            <View style={sectionStyles.formBody}>
              <View style={sectionStyles.whenRow}>
                <Pressable
                  style={({ pressed }) => [
                    sectionStyles.whenButton,
                    when === "day_before" && sectionStyles.whenButtonActive,
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                  hitSlop={{ top: 3, bottom: 3 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: when === "day_before" }}
                  onPress={() => setWhen("day_before")}
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
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    sectionStyles.whenButton,
                    when === "same_day" && sectionStyles.whenButtonActive,
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                  hitSlop={{ top: 3, bottom: 3 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: when === "same_day" }}
                  onPress={() => setWhen("same_day")}
                >
                  <Text
                    style={[
                      sectionStyles.whenButtonText,
                      when === "same_day" && sectionStyles.whenButtonTextActive,
                    ]}
                  >
                    {t("habits.form.scheduledReminderSameDay")}
                  </Text>
                </Pressable>
              </View>

              <View style={sectionStyles.timeRow}>
                <AppTimePicker
                  value={time}
                  containerStyle={{ flex: 1 }}
                  accessibilityLabel={t(
                    "habits.form.scheduledReminderTimePlaceholder",
                  )}
                  placeholder={t(
                    "habits.form.scheduledReminderTimePlaceholder",
                  )}
                  onChange={setTime}
                />
                <Pressable
                  style={({ pressed }) => [
                    sectionStyles.timeAddButton,
                    !time && { opacity: 0.45 },
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                  hitSlop={{ top: 3, bottom: 3 }}
                  disabled={!time}
                  accessibilityRole="button"
                  onPress={addScheduledReminder}
                >
                  <Text style={sectionStyles.timeAddButtonText}>
                    {t("common.add")}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    sectionStyles.timeCancelButton,
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                  hitSlop={2}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.cancel")}
                  onPress={() => {
                    setShowForm(false);
                    setTime("");
                  }}
                >
                  <X size={16} color={tokens.fg3} strokeWidth={1.8} />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
