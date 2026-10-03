import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { PillButton } from "@/components/ui/pill-button";
import { useTimeFormat } from '@/hooks/use-time-format'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useState, useMemo } from "react";
import { View, Text, } from "react-native";
import { X, Plus, Bell } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";
import type { ScheduledReminderWhen } from "@orbit/shared/types/habit";
import {
  MAX_SCHEDULED_REMINDERS,
  validateScheduledReminders,
} from "@orbit/shared/validation";
import { TimeField } from "@/components/ui/time-field";
import type { Time24 } from "@orbit/shared/contracts/forms";
import { Switch } from "@/components/ui/switch";
import { useReminderPermission } from "@/hooks/use-reminder-permission";
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
  inline?: boolean;
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
  /** The timed reminder card owns the switch when this editor is nested inside it. */
  nested?: boolean;
  offsetReminderCount?: number;
}

export function ScheduledReminderSection({
  tokens,
  inline = false,
  reminderEnabled,
  scheduledReminders,
  onToggleReminder,
  onSetScheduledReminders,
  onValidationError,
  nested = false,
  offsetReminderCount = 0,
}: Readonly<ScheduledReminderSectionProps>) {
  const { t } = useTranslation();
  const { displayTime } = useTimeFormat();
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);
  const [showForm, setShowForm] = useState(false);
  const [when, setWhen] = useState<ScheduledReminderWhen>("same_day");
  const [time, setTime] = useState<Time24 | "">("");
  const permission = useReminderPermission(reminderEnabled, onToggleReminder);

  const atScheduledLimit = (scheduledReminders?.length ?? 0) >= MAX_SCHEDULED_REMINDERS;
  const atRelativeLimit = (scheduledReminders?.length ?? 0) + offsetReminderCount >= 15;
  const atLimit = atScheduledLimit || atRelativeLimit;

  function addScheduledReminder() {
    if (atRelativeLimit) {
      onValidationError(t("habits.form.relativeReminderMax"));
      return;
    }
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
    const timeDisplay = displayTime(sr.time);
    if (sr.when === "day_before") {
      return t("habits.form.scheduledReminderDayBeforeAt", {
        time: timeDisplay,
      });
    }
    return t("habits.form.scheduledReminderSameDayAt", { time: timeDisplay });
  }

  return (
    <View style={nested ? sectionStyles.body : inline ? { gap: 12 } : sectionStyles.container}>
      {nested ? <Text style={sectionStyles.hintText}>{t("habits.form.scheduledReminderFixedTimes")}</Text> : null}
      {!nested && <View style={sectionStyles.headerRow}>
        <View style={sectionStyles.headerLeft}>
          <Bell size={20} color={tokens.fg2} strokeWidth={1.8} />
          <Text style={sectionStyles.headerLabel}>
            {t("habits.form.scheduledReminder")}
          </Text>
        </View>
        <Switch
          checked={reminderEnabled}
          onChange={permission.toggleReminder}
          label={t("habits.form.scheduledReminder")}
        />
      </View>}
      {!nested && <View style={permission.showNotice ? { gap: 4 } : { position: "absolute" }}>
          <Text accessibilityLiveRegion="polite" style={sectionStyles.hintText}>
            {permission.showNotice ? t("habits.form.reminderPermissionNeeded") : ""}
          </Text>
          {permission.showNotice && <Pressable accessibilityRole="button" style={{ minHeight: TOUCH_TARGET_MIN, justifyContent: "center", alignSelf: "flex-start" }} onPress={permission.openSettings}>
            <Text style={[sectionStyles.hintText, { color: tokens.fg2, textDecorationLine: "underline" }]}>
              {t("common.openSettings")}
            </Text>
          </Pressable>}
      </View>}
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
                {t(nested ? "habits.form.reminderAddTime" : "habits.form.scheduledReminderAdd")}
              </Text>
            </Pressable>
          )}

          {atLimit && (
            <Text style={sectionStyles.limitText}>
              {t(atRelativeLimit ? "habits.form.relativeReminderMax" : "habits.form.scheduledReminderMax")}
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
                  {inline ? <PillButton variant="ghost" size="sm" disabled={!time} onClick={addScheduledReminder}>{t("common.add")}</PillButton> : (
                  <Pressable style={({ pressed }) => [sectionStyles.timeAddButton, !time && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.96 }] }]} disabled={!time} accessibilityRole="button" onPress={addScheduledReminder}>
                    <Text style={sectionStyles.timeAddButtonText}>{t("common.add")}</Text>
                  </Pressable>
                  )}
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
