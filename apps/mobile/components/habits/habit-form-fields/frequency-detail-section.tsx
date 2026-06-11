import { View, Text } from "react-native";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { FrequencyUnit } from "@orbit/shared/types/habit";
import { AppSelect } from "@/components/ui/app-select";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import type { HabitFormControl, HabitFormStyles } from "./types";

interface FrequencyDetailSectionProps {
  control: HabitFormControl;
  isOneTime: boolean;
  isGeneral: boolean;
  isFlexible: boolean;
  frequencyUnits: { value: FrequencyUnit; label: string }[];
  onQuantityChange: (value: number | null) => void;
  onUnitChange: (value: FrequencyUnit) => void;
  styles: HabitFormStyles;
}

export function FrequencyDetailSection({
  control,
  isOneTime,
  isGeneral,
  isFlexible,
  frequencyUnits,
  onQuantityChange,
  onUnitChange,
  styles,
}: Readonly<FrequencyDetailSectionProps>) {
  const { t } = useTranslation();
  const watchedFrequencyUnit =
    useWatch({ control, name: "frequencyUnit" }) ?? null;
  const watchedFrequencyQuantity =
    useWatch({ control, name: "frequencyQuantity" }) ?? null;

  return (
    <>
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

      {!isOneTime && !isGeneral && (
        <View style={styles.frequencyRow}>
          <View style={styles.frequencyField}>
            <Text style={styles.label}>
              {isFlexible
                ? t("habits.form.timesPerUnit")
                : t("habits.form.every")}
            </Text>
            <BottomSheetAppTextInput
              value={String(watchedFrequencyQuantity ?? "")}
              keyboardType="number-pad"
              onChangeText={(val: string) => {
                const num = Number(val);
                if (!val) {
                  onQuantityChange(null);
                } else if (!Number.isNaN(num)) {
                  onQuantityChange(num);
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
              onChange={(value) => onUnitChange(value as FrequencyUnit)}
            />
          </View>
        </View>
      )}
    </>
  );
}
