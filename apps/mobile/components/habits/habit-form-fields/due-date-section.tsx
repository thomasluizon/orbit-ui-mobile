import { View, Text } from "react-native";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { DateField } from "@/components/ui/date-field";
import { TimeField } from "@/components/ui/time-field";
import type { Time24 } from "@orbit/shared/contracts/forms";
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
        <DateField
          value={watchedDueDate}
          placeholder={t("common.selectDate")}
          onChange={onDueDateChange}
        />
      </View>
      <View style={[styles.fieldGroup, { flex: 1 }]}>
        <TimeField
          label={t("habits.form.dueTime")}
          value={watchedDueTime as Time24 | ''}
          onChange={onDueTimeChange}
          onClear={onClearDueTime}
        />
      </View>
    </View>
  );
}
