import { useEffect, useMemo, useRef, useState } from "react";
import { Animated } from "react-native";
import { useUIStore } from "@/stores/ui-store";
import {
  createAnimatedTimingConfig,
  toAnimatedEasing,
  useResolvedMotionPreset,
} from "@/lib/motion";
import { resolveBulkActionBarEnterShift } from "./today-model";

interface TodayMotionInput {
  filterMotionKey: string;
  isRefetching: boolean;
}

/**
 * Owns the Today screen's transition motion: the filter/list enter animation on
 * view or filter changes, the refetch dim, and the bulk-action-bar enter/exit
 * (including when the bar unmounts). Extracted from TodayScreen unchanged.
 */
export function useTodayMotion({
  filterMotionKey,
  isRefetching,
}: TodayMotionInput) {
  const listMotion = useResolvedMotionPreset("list-enter");
  const selectionMotion = useResolvedMotionPreset("selection");
  const isSelectMode = useUIStore((s) => s.isSelectMode);

  const filtersTransitionAnim = useMemo(() => new Animated.Value(1), []);
  const listTransitionAnim = useMemo(() => new Animated.Value(1), []);
  const refetchTransitionAnim = useMemo(() => new Animated.Value(0), []);
  const [bulkBarAnim] = useState(() => new Animated.Value(isSelectMode ? 1 : 0));
  const hasAnimatedFiltersRef = useRef(false);
  const [renderBulkActionBar, setRenderBulkActionBar] = useState(isSelectMode);

  useEffect(() => {
    if (!hasAnimatedFiltersRef.current) {
      hasAnimatedFiltersRef.current = true;
      return;
    }

    const startValue = listMotion.reducedMotionEnabled ? 1 : 0;
    const timingConfig = createAnimatedTimingConfig(
      listMotion.enterDuration,
      listMotion.enterEasing,
    );

    filtersTransitionAnim.stopAnimation();
    listTransitionAnim.stopAnimation();
    filtersTransitionAnim.setValue(startValue);
    listTransitionAnim.setValue(startValue);

    Animated.parallel([
      Animated.timing(filtersTransitionAnim, timingConfig),
      Animated.timing(listTransitionAnim, timingConfig),
    ]).start();
  }, [
    filterMotionKey,
    filtersTransitionAnim,
    listMotion.enterDuration,
    listMotion.enterEasing,
    listMotion.reducedMotionEnabled,
    listTransitionAnim,
  ]);

  useEffect(() => {
    Animated.timing(refetchTransitionAnim, {
      toValue: isRefetching ? 1 : 0,
      duration: isRefetching
        ? listMotion.enterDuration
        : listMotion.exitDuration,
      easing: toAnimatedEasing(
        isRefetching ? listMotion.enterEasing : listMotion.exitEasing,
      ),
      useNativeDriver: true,
    }).start();
  }, [
    isRefetching,
    listMotion.enterDuration,
    listMotion.enterEasing,
    listMotion.exitDuration,
    listMotion.exitEasing,
    refetchTransitionAnim,
  ]);

  useEffect(() => {
    if (isSelectMode) {
      bulkBarAnim.stopAnimation();
      bulkBarAnim.setValue(selectionMotion.reducedMotionEnabled ? 1 : 0);
      Animated.timing(
        bulkBarAnim,
        createAnimatedTimingConfig(
          selectionMotion.enterDuration,
          selectionMotion.enterEasing,
        ),
      ).start();
      return;
    }

    bulkBarAnim.stopAnimation();
    Animated.timing(bulkBarAnim, {
      toValue: 0,
      duration: selectionMotion.exitDuration,
      easing: toAnimatedEasing(selectionMotion.exitEasing),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setRenderBulkActionBar(false);
      }
    });
  }, [
    bulkBarAnim,
    isSelectMode,
    selectionMotion.enterDuration,
    selectionMotion.enterEasing,
    selectionMotion.exitDuration,
    selectionMotion.exitEasing,
    selectionMotion.reducedMotionEnabled,
  ]);

  const filtersAnimatedStyle = useMemo(
    () => ({
      opacity: filtersTransitionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.86, 1],
      }),
      transform: [
        {
          translateY: filtersTransitionAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [Math.max(4, Math.round(listMotion.shift / 2)), 0],
          }),
        },
      ],
    }),
    [filtersTransitionAnim, listMotion.shift],
  );

  const listAnimatedStyle = useMemo(
    () => ({
      opacity: listTransitionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.9, 1],
      }),
      transform: [
        {
          translateY: listTransitionAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [Math.max(4, Math.round(listMotion.shift / 2)), 0],
          }),
        },
      ],
    }),
    [listMotion.shift, listTransitionAnim],
  );

  const refetchAnimatedStyle = useMemo(
    () => ({
      flex: 1,
      opacity: refetchTransitionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.8],
      }),
      transform: [
        {
          translateY: refetchTransitionAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 4],
          }),
        },
      ],
    }),
    [refetchTransitionAnim],
  );

  const bulkBarAnimatedStyle = useMemo(
    () => ({
      opacity: bulkBarAnim,
      transform: [
        {
          translateY: bulkBarAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [resolveBulkActionBarEnterShift(selectionMotion), 0],
          }),
        },
        {
          scale: bulkBarAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [selectionMotion.scaleFrom, 1],
          }),
        },
      ],
    }),
    [bulkBarAnim, selectionMotion],
  );

  return {
    filtersAnimatedStyle,
    listAnimatedStyle,
    refetchAnimatedStyle,
    bulkBarAnimatedStyle,
    renderBulkActionBar,
    setRenderBulkActionBar,
  };
}
