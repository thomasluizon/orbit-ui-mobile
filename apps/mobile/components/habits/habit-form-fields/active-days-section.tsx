import { View, Text } from "react-native";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ChoiceButtonRow } from "./choice-button-row";
import type { HabitFormControl, HabitFormStyles } from "./types";

interface ActiveDaysSectionProps {
  control: HabitFormControl;
  daysList: { value: string; label: string }[];
  onToggleDay: (day: string) => void;
  styles: HabitFormStyles;
}

export function ActiveDaysSection({
  control,
  daysList,
  onToggleDay,
  styles,
}: Readonly<ActiveDaysSectionProps>) {
  const { t } = useTranslation();
  const watchedDays = useWatch({ control, name: "days" }) ?? [];

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{t("habits.form.activeDays")}</Text>
      <ChoiceButtonRow
        containerStyle={styles.daysRow}
        buttonStyle={styles.dayButton}
        activeButtonStyle={styles.dayButtonActive}
        textStyle={styles.dayButtonText}
        activeTextStyle={styles.dayButtonTextActive}
        options={daysList.map((day) => ({
          key: day.value,
          label: day.label,
          active: watchedDays?.includes(day.value) ?? false,
          onPress: () => onToggleDay(day.value),
        }))}
      />
    </View>
  );
}
