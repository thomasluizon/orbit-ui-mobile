import { useHabitFormInteraction } from './habit-form-interaction'
import { toTime24 } from '@orbit/shared/utils'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { useTimeFormat } from '@/hooks/use-time-format'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useState, useMemo } from "react";
import { View, Text, } from "react-native";
import { X } from '@/components/ui/icons';
import { useTranslation } from "react-i18next";
import type { ScheduledReminderWhen } from "@orbit/shared/types/habit";
import {
  MAX_SCHEDULED_REMINDERS,
  validateScheduledReminders,
} from "@orbit/shared/validation";
import { TimeField } from "@/components/ui/time-field";
import type { Time24 } from "@orbit/shared/contracts/forms";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { type AppTokens, createSectionStyles } from "./styles";

function ReminderWhenOption({ label, selected, onSelect, styles }: Readonly<{
  label: string;
  selected: boolean;
  onSelect: () => void;
  styles: ReturnType<typeof createSectionStyles>;
}>) {
  const { disabled, guard } = useHabitFormInteraction()
  return (
    <RadioItem selected={selected} onSelect={guard(onSelect)} disabled={disabled}><Pressable disabled={disabled} focusInset selectionRingWidth={1}
      style={({ pressed }) => [
        styles.whenButton,
        selected && styles.whenButtonActive,
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, ...(disabled ? { disabled: true } : {}) }}
    >
      <Text style={[styles.whenButtonText, selected && styles.whenButtonTextActive]}>{label}</Text>
    </Pressable></RadioItem>
  );
}

interface ScheduledReminderSectionProps {
  hideDayBefore?: boolean
  tokens: AppTokens;
  reminderEnabled: boolean;
  scheduledReminders:
    | { when: ScheduledReminderWhen; time: string }[]
    | undefined;
  onSetScheduledReminders: (
    reminders: { when: ScheduledReminderWhen; time: string }[],
  ) => void;
  onValidationError: (message: string) => void;
  offsetReminderCount?: number;
}

export function ScheduledReminderSection({
  tokens,
  hideDayBefore = false,
  reminderEnabled,
  scheduledReminders,
  onSetScheduledReminders,
  onValidationError,
  offsetReminderCount = 0,
}: Readonly<ScheduledReminderSectionProps>) {
  const { disabled, guard } = useHabitFormInteraction()
  const { t } = useTranslation();
  const { displayTime } = useTimeFormat();
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);

  const [when, setWhen] = useState<ScheduledReminderWhen>("same_day");


  const atScheduledLimit = (scheduledReminders?.length ?? 0) >= MAX_SCHEDULED_REMINDERS;
  const atRelativeLimit = (scheduledReminders?.length ?? 0) + offsetReminderCount >= 15;
  const atLimit = atScheduledLimit || atRelativeLimit;

  function addScheduledReminder(time: Time24) {
    if (atRelativeLimit) {
      onValidationError(t("habits.form.relativeReminderMax"));
      return;
    }
    const current = scheduledReminders ?? [];
    const candidate = [...current, { when: hideDayBefore ? 'same_day' as const : when, time }];
    const validationErrorKey = validateScheduledReminders(candidate);
    if (validationErrorKey) {
      onValidationError(
        t(validationErrorKey as "habits.form.scheduledReminderMax"),
      );
      return;
    }
    onSetScheduledReminders(candidate);

  }

  function removeScheduledReminder(index: number) {
    const current = scheduledReminders ?? [];
    onSetScheduledReminders(current.filter((_, i) => i !== index));
  }

  function scheduledReminderLabel(sr: {
    when: ScheduledReminderWhen;
    time: string;
  }): string {
    const timeDisplay = displayTime(sr.time);
    if (sr.when === "day_before") {
      return t("habits.form.scheduledReminderDayBeforeAt", {
        time: timeDisplay,
      });
    }
    return t("habits.form.scheduledReminderSameDayAt", { time: timeDisplay });
  }

  return (
    <View style={sectionStyles.body}>
      {reminderEnabled && (
        <View style={sectionStyles.body}>
          {(scheduledReminders?.length ?? 0) > 0 && (
            <View style={sectionStyles.chipsRow}>
              {(scheduledReminders ?? []).map((sr, idx) => (
                <View key={`${sr.when}-${sr.time}`} style={sectionStyles.chip}>
                  <Text style={sectionStyles.chipText}>
                    {scheduledReminderLabel(sr)}
                  </Text>
                  <Pressable disabled={disabled}
                    style={({ pressed }) => ({ minHeight: TOUCH_TARGET_MIN, minWidth: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}
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

          {atLimit && (
            <Text style={sectionStyles.limitText}>
              {t(atRelativeLimit ? "habits.form.relativeReminderMax" : "habits.form.scheduledReminderMax")}
            </Text>
          )}

          {!atLimit && (
            <View style={sectionStyles.formBody}>
              <RadioGroup accessibilityLabel={t("habits.form.scheduledReminder")} style={sectionStyles.whenRow}>
                {!hideDayBefore ? <ReminderWhenOption label={t("habits.form.scheduledReminderDayBefore")} selected={when === "day_before"} onSelect={() => setWhen("day_before")} styles={sectionStyles} /> : null}
                <ReminderWhenOption label={t("habits.form.scheduledReminderSameDay")} selected={when === "same_day"} onSelect={() => setWhen("same_day")} styles={sectionStyles} />
              </RadioGroup>

              <View style={sectionStyles.timeRow}>
                <TimeField disabled={disabled}
                  commitOnBlur
                  label={t("habits.form.scheduledReminderTime")}
                  placeholder={t("habits.form.scheduledReminderTimePlaceholder")}
                  value={toTime24('')}
                  onChange={guard(addScheduledReminder)}
                />

              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
