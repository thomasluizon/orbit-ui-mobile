import { useEffect, useMemo } from "react";
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { View, Animated, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS } from "@orbit/shared/chat";
import { usePrefersReducedMotion } from "@/lib/motion";
import type { ChatStyles } from "@/app/chat.styles";

function AnimatedVisualizerBar({
  delay,
  styles,
}: Readonly<{
  delay: number;
  styles: ChatStyles;
}>) {
  const scale = useMemo(() => new Animated.Value(0.45), []);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      scale.setValue(0.45);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: 520,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.45,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [delay, prefersReducedMotion, scale]);

  return (
    <Animated.View
      style={[
        styles.visualizerBar,
        {
          transform: [{ scaleY: scale }],
        },
      ]}
    />
  );
}

export function RecordingVisualizer({ styles }: Readonly<{ styles: ChatStyles }>) {
  const { t } = useTranslation();
  return (
    <View style={styles.visualizer} accessible accessibilityLabel={t("chat.listening")}>
      {VISUALIZER_BAR_OFFSETS.map((offset) => (
        <AnimatedVisualizerBar
          key={`bar-${offset}`}
          delay={Math.round(offset * 1000)}
          styles={styles}
        />
      ))}
    </View>
  );
}

/** Recording-state dot that pulses its opacity in a loop (reduced-motion gated). */
export function RecordingPulseDot({
  style,
  color,
}: Readonly<{ style: StyleProp<ViewStyle>; color: string }>) {
  const opacity = useMemo(() => new Animated.Value(1), []);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      opacity.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, prefersReducedMotion]);

  return <Animated.View style={[style, { opacity, backgroundColor: color }]} />;
}
