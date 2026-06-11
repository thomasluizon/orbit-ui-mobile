import { useState, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { X, Plus, Bell } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ScheduledReminderWhen } from "@orbit/shared/types/habit";
import { formatLocaleTime } from "@orbit/shared/utils";
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
}

export function ScheduledReminderSection({
  tokens,
  reminderEnabled,
  scheduledReminders,
  onToggleReminder,
  onSetScheduledReminders,
  onValidationError,
}: Readonly<ScheduledReminderSectionProps>) {
  const { t, i18n } = useTranslation();
  const deviceLocale = i18n.language;
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);
  const MAX_SCHEDULED_REMINDERS = 5;
  const [showForm, setShowForm] = useState(false);
  const [when, setWhen] = useState<ScheduledReminderWhen>("same_day");
  const [time, setTime] = useState("");

  const atLimit = (scheduledReminders?.length ?? 0) >= MAX_SCHEDULED_REMINDERS;

  function addScheduledReminder() {
    if (!time) {
      onValidationError(t("habits.form.invalidScheduledReminderTime"));
      return;
    }
    if (atLimit) {
      onValidationError(t("habits.form.scheduledReminderMax"));
      return;
    }
    const current = scheduledReminders ?? [];
    const duplicate = current.some(
      (sr) => sr.when === when && sr.time === time,
    );
    if (duplicate) {
      onValidationError(t("habits.form.duplicateScheduledReminder"));
      return;
    }
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
        <Switch
          on={reminderEnabled}
          onToggle={onToggleReminder}
          accessibilityLabel={t("habits.form.scheduledReminder")}
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
                    <X size={13} color={tokens.primary} strokeWidth={2.2} />
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
              <Plus size={16} color={tokens.primary} strokeWidth={1.8} />
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
                <TouchableOpacity
                  style={[
                    sectionStyles.timeAddButton,
                    !time && { opacity: 0.4 },
                  ]}
                  disabled={!time}
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
                  <X size={16} color={tokens.fg3} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
