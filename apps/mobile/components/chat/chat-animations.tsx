import { useEffect, useMemo } from "react";
import { View, Animated } from "react-native";
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
  return (
    <View style={styles.visualizer}>
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
