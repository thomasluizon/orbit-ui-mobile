import { useCallback, useEffect, useRef, useState } from "react";
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
} from '@/components/ui/icons';
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
  /**
   * When set (not null), the "General" option is locked to this value: the
   * habit has a parent or children whose `isGeneral` it must match. The
   * mismatching option(s) render dimmed and non-interactive.
   */
  lockedGeneral?: boolean | null;
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
  lockedGeneral = null,
  styles,
  tokens,
}: Readonly<FrequencyTypeCardsProps>) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const hasPositionedRef = useRef(false);
  const [pageWidth, setPageWidth] = useState(0);

  let activeIndex = 1;
  if (isOneTime) activeIndex = 0;
  else if (isGeneral) activeIndex = 3;
  else if (isFlexible) activeIndex = 2;

  const frequencyHandlers: (() => void)[] = [
    onSetOneTime,
    onSetRecurring,
    onSetFlexible,
    onSetGeneral,
  ];

  const isCardDisabled = useCallback(
    (index: number) => {
      if (lockedGeneral === null) return false;
      const isGeneralCard = FREQUENCY_TYPE_CARDS[index]?.key === "general";
      return lockedGeneral ? !isGeneralCard : isGeneralCard;
    },
    [lockedGeneral],
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
    if (nextIndex === activeIndex) {
      return;
    }
    if (isCardDisabled(nextIndex)) {
      scrollToActive(true);
      return;
    }
    frequencyHandlers[nextIndex]?.();
  }

  function goToIndex(index: number) {
    if (index < 0 || index >= FREQUENCY_TYPE_CARDS.length) {
      return;
    }
    if (isCardDisabled(index)) {
      return;
    }
    frequencyHandlers[index]?.();
  }

  const isPreviousDisabled = activeIndex === 0 || isCardDisabled(activeIndex - 1);
  const isNextDisabled =
    activeIndex === FREQUENCY_TYPE_CARDS.length - 1 ||
    isCardDisabled(activeIndex + 1);

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{t("habits.form.frequency")}</Text>
      <View style={styles.frequencyCarouselRow}>
        <Pressable
          style={({ pressed }) => [
            styles.frequencyArrow,
            isPreviousDisabled ? styles.frequencyArrowDisabled : null,
            pressed ? { transform: [{ scale: 0.96 }] } : null,
          ]}
          disabled={isPreviousDisabled}
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
          {/* react-doctor-disable-next-line rn-no-scrollview-mapped-list -- fixed 4-card horizontal paging carousel; ScrollView + pagingEnabled with programmatic scrollTo is the right primitive, FlatList virtualization breaks paging https://github.com/thomasluizon/orbit-ui-mobile/issues/243 */}
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
                    isCardDisabled(index) ? { opacity: 0.5 } : null,
                    pressed ? { transform: [{ scale: 0.98 }] } : null,
                  ]}
                  disabled={isCardDisabled(index)}
                  onPress={frequencyHandlers[index]}
                  accessibilityRole="radio"
                  accessibilityLabel={t(card.titleKey)}
                  accessibilityState={{
                    checked: index === activeIndex,
                    disabled: isCardDisabled(index),
                  }}
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
            isNextDisabled ? styles.frequencyArrowDisabled : null,
            pressed ? { transform: [{ scale: 0.96 }] } : null,
          ]}
          disabled={isNextDisabled}
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
