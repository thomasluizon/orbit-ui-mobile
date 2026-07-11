import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDays, subDays, isToday, isYesterday, isTomorrow } from "date-fns";
import { useTranslation } from "react-i18next";
import { formatAPIDate, formatLocaleDate } from "@orbit/shared/utils";
import { useUIStore } from "@/stores/ui-store";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { toAnimatedEasing } from "@/lib/motion";
import { easings } from "@/lib/theme";

function getMillisecondsUntilNextLocalMidnight(): number {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(nextMidnight.getTime() - now.getTime(), 1_000);
}

function getTodayDate(): string {
  return formatAPIDate(new Date());
}

export interface TodayDate {
  pinnedDateStr: string | null;
  selectedDateStr: string;
  selectedDate: Date;
  dateStr: string;
  dateLabel: string;
  slideDirection: "left" | "right";
  dateLabelAnim: Animated.Value;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
  goToToday: () => void;
  swipeGesture: ReturnType<typeof useHorizontalSwipe>;
}

/**
 * Owns the Today screen's "which day am I viewing" concern: the pinned/rollover
 * date, the localized day label and its enter animation, day-to-day navigation,
 * and the horizontal swipe gesture. Extracted from TodayScreen unchanged.
 */
export function useTodayDate(): TodayDate {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const router = useRouter();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { date } = useLocalSearchParams<{ date?: string | string[] }>();

  const [slideDirection, setSlideDirection] = useState<"left" | "right">(
    "right",
  );
  const dateLabelAnim = useMemo(() => new Animated.Value(1), []);
  const hasAnimatedDateLabelRef = useRef(false);

  const dateParam = Array.isArray(date) ? date[0] : date;
  const pinnedDateStr =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

  const [today, setToday] = useState(getTodayDate);
  const handleTodayRollover = useCallback(() => {
    setToday(getTodayDate());
  }, []);

  const selectedDateStr = pinnedDateStr ?? today;
  const selectedDate = useMemo(
    () => new Date(selectedDateStr + "T00:00:00"),
    [selectedDateStr],
  );
  const dateStr = formatAPIDate(selectedDate);

  const goToPreviousDay = useCallback(() => {
    setSlideDirection("left");
    router.push(`/?date=${formatAPIDate(subDays(selectedDate, 1))}`);
  }, [router, selectedDate]);

  const goToNextDay = useCallback(() => {
    setSlideDirection("right");
    router.push(`/?date=${formatAPIDate(addDays(selectedDate, 1))}`);
  }, [router, selectedDate]);

  const goToToday = useCallback(() => {
    setSlideDirection(selectedDate > new Date() ? "left" : "right");
    setActiveView("today");
    router.navigate("/");
  }, [router, selectedDate, setActiveView]);

  useEffect(() => {
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const resetRolloverTimer = () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer);
      }

      rolloverTimer = globalThis.setTimeout(() => {
        handleTodayRollover();
        resetRolloverTimer();
      }, getMillisecondsUntilNextLocalMidnight());
    };

    resetRolloverTimer();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState !== "active") return;
      handleTodayRollover();
      resetRolloverTimer();
    });

    return () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer);
      }
      subscription.remove();
    };
  }, [handleTodayRollover]);

  const swipeGesture = useHorizontalSwipe({
    onSwipeLeft: goToNextDay,
    onSwipeRight: goToPreviousDay,
  });

  const dateLabel = useMemo(() => {
    if (isToday(selectedDate)) return t("dates.today");
    if (isYesterday(selectedDate)) return t("dates.yesterday");
    if (isTomorrow(selectedDate)) return t("dates.tomorrow");
    return formatLocaleDate(selectedDate, locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDate, t, locale]);

  useEffect(() => {
    if (!hasAnimatedDateLabelRef.current) {
      hasAnimatedDateLabelRef.current = true;
      return;
    }

    dateLabelAnim.setValue(0);
    Animated.timing(dateLabelAnim, {
      toValue: 1,
      duration: 180,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }).start();
  }, [dateLabelAnim, selectedDateStr, slideDirection]);

  return {
    pinnedDateStr,
    selectedDateStr,
    selectedDate,
    dateStr,
    dateLabel,
    slideDirection,
    dateLabelAnim,
    goToPreviousDay,
    goToNextDay,
    goToToday,
    swipeGesture,
  };
}
