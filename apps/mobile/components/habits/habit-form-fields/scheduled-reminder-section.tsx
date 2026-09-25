import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useState, useMemo } from "react";
import { View, Text, } from "react-native";
import { X, Plus, Bell } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";
import type { ScheduledReminderWhen } from "@orbit/shared/types/habit";
import { formatLocaleTime } from "@orbit/shared/utils";
import {
  MAX_SCHEDULED_REMINDERS,
  validateScheduledReminders,
} from "@orbit/shared/validation";
import { TimeField } from "@/components/ui/time-field";
import type { Time24 } from "@orbit/shared/contracts/forms";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, useRadioGroupItem } from "@/components/ui/radio-row";
import { type AppTokens, createSectionStyles } from "./styles";

function ReminderWhenOption({ label, selected, onSelect, styles }: Readonly<{
  label: string;
  selected: boolean;
  onSelect: () => void;
  styles: ReturnType<typeof createSectionStyles>;
}>) {
  const { elementRef, onActivate, ...navigationProps } = useRadioGroupItem({ disabled: false, onSelect, selected });
  return (
    <Pressable
      {...navigationProps}
      ref={elementRef}
      style={({ pressed }) => [
        styles.whenButton,
        selected && styles.whenButtonActive,
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
      hitSlop={{ top: 3, bottom: 3 }}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onActivate}
    >
      <Text style={[styles.whenButtonText, selected && styles.whenButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

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
  const [time, setTime] = useState<Time24 | "">("");

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
            checked={reminderEnabled}
            onChange={onToggleReminder}
            label={t("habits.form.scheduledReminder")}
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
                    <X size={16} color={tokens.primary} strokeWidth={2.2} />
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
              <Plus size={16} color={tokens.fg2} strokeWidth={2} />
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
              <RadioGroup accessibilityLabel={t("habits.form.scheduledReminder")} style={sectionStyles.whenRow}>
                <ReminderWhenOption label={t("habits.form.scheduledReminderDayBefore")} selected={when === "day_before"} onSelect={() => setWhen("day_before")} styles={sectionStyles} />
                <ReminderWhenOption label={t("habits.form.scheduledReminderSameDay")} selected={when === "same_day"} onSelect={() => setWhen("same_day")} styles={sectionStyles} />
              </RadioGroup>

              <View style={sectionStyles.timeRow}>
                <TimeField
                  label={t("habits.form.scheduledReminderTimePlaceholder")}
                  value={time}
                  onChange={setTime}
                  onClear={() => setTime("")}
                />
                <View style={sectionStyles.timeControls}>
                  <Pressable style={({ pressed }) => [sectionStyles.timeAddButton, !time && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.96 }] }]} disabled={!time} accessibilityRole="button" onPress={addScheduledReminder}>
                    <Text style={sectionStyles.timeAddButtonText}>{t("common.add")}</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [sectionStyles.timeCancelButton, pressed && { transform: [{ scale: 0.96 }] }]} accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={() => { setShowForm(false); setTime(""); }}>
                    <X size={16} color={tokens.fg3} strokeWidth={1.8} />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
