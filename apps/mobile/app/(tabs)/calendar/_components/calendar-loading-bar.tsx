import { useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { usePrefersReducedMotion } from "@/lib/motion";
import { createTokensV2 } from "@/lib/theme";

type Tokens = ReturnType<typeof createTokensV2>;

interface CalendarLoadingBarProps {
  active: boolean;
  tokens: Tokens;
}

/** 2px indeterminate fetch indicator mirroring the web .loading-bar: a primary
 *  bar sweeping horizontally, transform-only, hidden while idle. */
export function CalendarLoadingBar({
  active,
  tokens,
}: Readonly<CalendarLoadingBarProps>) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active || prefersReducedMotion) return;
    progress.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(progress);
      progress.value = 0;
    };
  }, [active, prefersReducedMotion, progress]);

  const sweepStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateX: interpolate(
            progress.value,
            [0, 1],
            [-trackWidth * 0.4, trackWidth],
          ),
        },
      ],
    }),
    [trackWidth],
  );

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      testID="calendar-loading-bar"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onTrackLayout}
      style={[styles.track, { opacity: active ? 1 : 0 }]}
    >
      <Animated.View
        style={[
          styles.sweep,
          { width: trackWidth * 0.4, backgroundColor: tokens.primary },
          sweepStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 2,
    borderRadius: 999,
    overflow: "hidden",
    marginHorizontal: 20,
  },
  sweep: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
});
