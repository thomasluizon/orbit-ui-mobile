import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import {
  CalendarCheck,
  Repeat,
  Shuffle,
  Infinity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
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
  const scrollRef = useRef<ScrollView>(null);
  const hasPositionedRef = useRef(false);
  const [pageWidth, setPageWidth] = useState(0);

  const activeIndex = isOneTime ? 0 : isGeneral ? 3 : isFlexible ? 2 : 1;

  const frequencyHandlers = useMemo<(() => void)[]>(
    () => [onSetOneTime, onSetRecurring, onSetFlexible, onSetGeneral],
    [onSetOneTime, onSetRecurring, onSetFlexible, onSetGeneral],
  );

  const scrollToActive = useCallback(
    (animated: boolean) => {
      if (pageWidth === 0) {
        return;
      }
      scrollRef.current?.scrollTo({ x: activeIndex * pageWidth, animated });
    },
    [activeIndex, pageWidth],
  );

  useEffect(() => {
    scrollToActive(hasPositionedRef.current);
    hasPositionedRef.current = true;
  }, [scrollToActive]);

  function handleLayout(event: LayoutChangeEvent) {
    setPageWidth(event.nativeEvent.layout.width);
  }

  function handleMomentumScrollEnd(
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) {
    if (pageWidth === 0) {
      return;
    }
    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.x / pageWidth,
    );
    if (nextIndex !== activeIndex) {
      frequencyHandlers[nextIndex]?.();
    }
  }

  function goToIndex(index: number) {
    if (index < 0 || index >= FREQUENCY_TYPE_CARDS.length) {
      return;
    }
    frequencyHandlers[index]?.();
  }

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{t("habits.form.frequency")}</Text>
      <View style={styles.frequencyCarouselRow}>
        <Pressable
          style={({ pressed }) => [
            styles.frequencyArrow,
            activeIndex === 0 ? styles.frequencyArrowDisabled : null,
            pressed ? { transform: [{ scale: 0.96 }] } : null,
          ]}
          disabled={activeIndex === 0}
          onPress={() => goToIndex(activeIndex - 1)}
          accessibilityRole="button"
          accessibilityLabel={t("common.previous")}
          hitSlop={8}
        >
          <ChevronLeft size={18} strokeWidth={2} color={tokens.fg2} />
        </Pressable>

        <ScrollView
          ref={scrollRef}
          style={styles.frequencyScroll}
          onLayout={handleLayout}
          onContentSizeChange={() => scrollToActive(false)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumScrollEnd}
        >
          {FREQUENCY_TYPE_CARDS.map((card, index) => {
            const CardIcon = card.icon;
            return (
              <View
                key={card.key}
                style={[styles.frequencySlide, { width: pageWidth }]}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.frequencyCardCarousel,
                    pressed ? { transform: [{ scale: 0.98 }] } : null,
                  ]}
                  onPress={frequencyHandlers[index]}
                  accessibilityRole="radio"
                  accessibilityLabel={t(card.titleKey)}
                  accessibilityState={{ checked: index === activeIndex }}
                >
                  <View style={styles.frequencyCardIconWell}>
                    <CardIcon
                      size={22}
                      strokeWidth={2.2}
                      color={tokens.primary}
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
                </Pressable>
              </View>
            );
          })}
        </ScrollView>

        <Pressable
          style={({ pressed }) => [
            styles.frequencyArrow,
            activeIndex === FREQUENCY_TYPE_CARDS.length - 1
              ? styles.frequencyArrowDisabled
              : null,
            pressed ? { transform: [{ scale: 0.96 }] } : null,
          ]}
          disabled={activeIndex === FREQUENCY_TYPE_CARDS.length - 1}
          onPress={() => goToIndex(activeIndex + 1)}
          accessibilityRole="button"
          accessibilityLabel={t("common.next")}
          hitSlop={8}
        >
          <ChevronRight size={18} strokeWidth={2} color={tokens.fg2} />
        </Pressable>
      </View>

      <View style={styles.frequencyDots}>
        {FREQUENCY_TYPE_CARDS.map((card, index) => (
          <View
            key={card.key}
            style={[
              styles.frequencyDot,
              index === activeIndex ? styles.frequencyDotActive : null,
            ]}
          />
        ))}
      </View>
    </View>
  );
}
