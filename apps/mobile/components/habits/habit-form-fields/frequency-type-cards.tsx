import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import {
  CalendarCheck,
  Repeat,
  Shuffle,
  Infinity,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { RadioGlyph } from "@/components/ui/select-check";
import type { AppTokens } from "./styles";
import type { HabitFormStyles } from "./types";

const FREQUENCY_TYPE_CARDS = [
  {
    key: "one-time",
    icon: CalendarCheck,
    titleKey: "habits.form.oneTimeTask",
    descKey: "habits.form.oneTimeDescription",
    exampleKey: "habits.form.oneTimeExample",
  },
  {
    key: "recurring",
    icon: Repeat,
    titleKey: "habits.form.recurring",
    descKey: "habits.form.recurringDescription",
    exampleKey: "habits.form.recurringExample",
  },
  {
    key: "flexible",
    icon: Shuffle,
    titleKey: "habits.form.flexible",
    descKey: "habits.form.flexibleDescription2",
    exampleKey: "habits.form.flexibleExample2",
  },
  {
    key: "general",
    icon: Infinity,
    titleKey: "habits.form.general",
    descKey: "habits.form.generalDescription",
    exampleKey: "habits.form.generalExample",
  },
] as const;

interface FrequencyTypeCardsProps {
  isOneTime: boolean;
  isGeneral: boolean;
  isFlexible: boolean;
  onSetOneTime: () => void;
  onSetRecurring: () => void;
  onSetFlexible: () => void;
  onSetGeneral: () => void;
  styles: HabitFormStyles;
  tokens: AppTokens;
}

export function FrequencyTypeCards({
  isOneTime,
  isGeneral,
  isFlexible,
  onSetOneTime,
  onSetRecurring,
  onSetFlexible,
  onSetGeneral,
  styles,
  tokens,
}: Readonly<FrequencyTypeCardsProps>) {
  const { t } = useTranslation();

  const activeFrequencyKey = isOneTime
    ? "one-time"
    : isGeneral
      ? "general"
      : isFlexible
        ? "flexible"
        : "recurring";

  const frequencyHandlers: Record<string, () => void> = useMemo(
    () => ({
      "one-time": onSetOneTime,
      recurring: onSetRecurring,
      flexible: onSetFlexible,
      general: onSetGeneral,
    }),
    [onSetOneTime, onSetRecurring, onSetFlexible, onSetGeneral],
  );

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{t("habits.form.frequency")}</Text>
      <View style={styles.frequencyCardGrid}>
        {FREQUENCY_TYPE_CARDS.map((card) => {
          const isActive = activeFrequencyKey === card.key;
          const CardIcon = card.icon;
          return (
            <Pressable
              key={card.key}
              style={({ pressed }) => [
                styles.frequencyCard,
                isActive
                  ? styles.frequencyCardActive
                  : styles.frequencyCardInactive,
                !isActive && pressed
                  ? { backgroundColor: tokens.bgElev }
                  : null,
                pressed ? { transform: [{ scale: 0.99 }] } : null,
              ]}
              onPress={frequencyHandlers[card.key]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <View style={styles.frequencyCardHeader}>
                <View style={styles.frequencyCardIconWell}>
                  <CardIcon
                    size={22}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    color={isActive ? tokens.primary : tokens.fg2}
                  />
                </View>
                <View style={styles.frequencyCardTexts}>
                  <Text style={styles.frequencyCardTitle}>
                    {t(card.titleKey)}
                  </Text>
                  <Text style={styles.frequencyCardDesc}>
                    {t(card.descKey)}
                  </Text>
                  <Text style={styles.frequencyCardExample}>
                    {t(card.exampleKey)}
                  </Text>
                </View>
                <RadioGlyph selected={isActive} size={24} tokens={tokens} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
