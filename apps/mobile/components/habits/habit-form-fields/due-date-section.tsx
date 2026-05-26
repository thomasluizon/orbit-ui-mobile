import { View, Text } from "react-native";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { AppTimePicker } from "@/components/ui/app-time-picker";
import type { HabitFormControl, HabitFormStyles } from "./types";

interface DueDateSectionProps {
  control: HabitFormControl;
  onDueDateChange: (value: string) => void;
  onDueTimeChange: (value: string) => void;
  onClearDueTime: () => void;
  styles: HabitFormStyles;
}

export function DueDateSection({
  control,
  onDueDateChange,
  onDueTimeChange,
  onClearDueTime,
  styles,
}: Readonly<DueDateSectionProps>) {
  const { t } = useTranslation();
  const watchedDueDate = useWatch({ control, name: "dueDate" }) ?? "";
  const watchedDueTime = useWatch({ control, name: "dueTime" }) ?? "";

  return (
    <View style={styles.dueDateRow}>
      <View style={[styles.fieldGroup, { flex: 1 }]}>
        <Text style={styles.label}>{t("habits.form.dueDate")}</Text>
        <AppDatePicker
          value={watchedDueDate}
          placeholder={t("common.selectDate")}
          onChange={onDueDateChange}
        />
      </View>
      <View style={[styles.fieldGroup, { flex: 1 }]}>
        <Text style={styles.label}>{t("habits.form.dueTime")}</Text>
        <AppTimePicker
          value={watchedDueTime}
          placeholder={t("habits.form.scheduledReminderTimePlaceholder")}
          accessibilityLabel={t("habits.form.dueTime")}
          onChange={onDueTimeChange}
          onClear={onClearDueTime}
        />
      </View>
    </View>
  );
}
