import { useEffect, useMemo, useRef, useState } from "react";
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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

  const dayOpacityAnim = useMemo(() => new Animated.Value(1), []);
  const dayTranslateAnim = useMemo(() => new Animated.Value(0), []);
  const refetchTransitionAnim = useMemo(() => new Animated.Value(0), []);
  const [bulkBarAnim] = useState(() => new Animated.Value(isSelectMode ? 1 : 0));
  const previousFilterMotionKeyRef = useRef(filterMotionKey);
  const dayTransitionRunningRef = useRef(false);
  const dayTransitionSequenceRef = useRef(0);
  const selectionTransitionSequenceRef = useRef(0);
  const [renderBulkActionBar, setRenderBulkActionBar] = useState(isSelectMode);
  const [previousSelectMode, setPreviousSelectMode] = useState(isSelectMode);

  if (isSelectMode !== previousSelectMode) {
    setPreviousSelectMode(isSelectMode);
    if (isSelectMode) {
      setRenderBulkActionBar(true);
    }
  }

  useEffect(() => {
    if (filterMotionKey === previousFilterMotionKeyRef.current) {
      return;
    }

    const direction = filterMotionKey > previousFilterMotionKeyRef.current ? 1 : -1;
    previousFilterMotionKeyRef.current = filterMotionKey;
    const shouldStartAtEdge = !dayTransitionRunningRef.current;
    const sequence = dayTransitionSequenceRef.current + 1;
    dayTransitionSequenceRef.current = sequence;
    dayOpacityAnim.stopAnimation();
    dayTranslateAnim.stopAnimation();

    if (shouldStartAtEdge) {
      dayOpacityAnim.setValue(0.9);
      dayTranslateAnim.setValue(listMotion.reducedMotionEnabled ? 0 : direction * 8);
    } else if (listMotion.reducedMotionEnabled) {
      dayTranslateAnim.setValue(0);
    }
    dayTransitionRunningRef.current = true;
    const timingConfig = {
      duration: listMotion.enterDuration,
      easing: toAnimatedEasing(listMotion.enterEasing),
      useNativeDriver: true,
    } as const;
    Animated.parallel([
      Animated.timing(dayOpacityAnim, { ...timingConfig, toValue: 1 }),
      Animated.timing(dayTranslateAnim, { ...timingConfig, toValue: 0 }),
    ]).start(() => {
      if (dayTransitionSequenceRef.current === sequence) {
        dayTransitionRunningRef.current = false;
      }
    });
  }, [
    filterMotionKey,
    dayOpacityAnim,
    dayTranslateAnim,
    listMotion.enterDuration,
    listMotion.enterEasing,
    listMotion.reducedMotionEnabled,
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
    const sequence = selectionTransitionSequenceRef.current + 1;
    selectionTransitionSequenceRef.current = sequence;
    if (isSelectMode) {
      bulkBarAnim.stopAnimation(() => {
        if (selectionTransitionSequenceRef.current !== sequence) {
          return;
        }
        bulkBarAnim.setValue(selectionMotion.reducedMotionEnabled ? 1 : 0);
        Animated.timing(
          bulkBarAnim,
          createAnimatedTimingConfig(
            selectionMotion.enterDuration,
            selectionMotion.enterEasing,
          ),
        ).start();
      });
      return;
    }

    bulkBarAnim.stopAnimation();
    if (!renderBulkActionBar) {
      return;
    }
    Animated.timing(bulkBarAnim, {
      toValue: 0,
      duration: selectionMotion.exitDuration,
      easing: toAnimatedEasing(selectionMotion.exitEasing),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && selectionTransitionSequenceRef.current === sequence) {
        setRenderBulkActionBar(false);
      }
    });
  }, [
    bulkBarAnim,
    isSelectMode,
    renderBulkActionBar,
    selectionMotion.enterDuration,
    selectionMotion.enterEasing,
    selectionMotion.exitDuration,
    selectionMotion.exitEasing,
    selectionMotion.reducedMotionEnabled,
  ]);

  const dayAnimatedStyle = useMemo(
    () => ({
      opacity: dayOpacityAnim,
      transform: [
        {
          translateY: dayTranslateAnim,
        },
      ],
    }),
    [dayOpacityAnim, dayTranslateAnim],
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
    dayAnimatedStyle,
    refetchAnimatedStyle,
    bulkBarAnimatedStyle,
    renderBulkActionBar: isSelectMode || renderBulkActionBar,
  };
}
