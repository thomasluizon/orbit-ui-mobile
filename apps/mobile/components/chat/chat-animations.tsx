import { useEffect, useMemo } from "react";
import { View, Animated } from "react-native";
import { Sparkles } from "lucide-react-native";
import { CHAT_VISUALIZER_BAR_OFFSETS as VISUALIZER_BAR_OFFSETS } from "@orbit/shared/chat";
import type { ChatStyles } from "@/app/chat.styles";

export function AnimatedSparkle({
  primaryColor,
  styles,
}: Readonly<{
  primaryColor: string;
  styles: ChatStyles;
}>) {
  const scale = useMemo(() => new Animated.Value(1), []);
  const opacity = useMemo(() => new Animated.Value(0.7), []);
  const spin = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.1,
            duration: 1250,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 1250,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1250,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 1250,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(spin, {
          toValue: 1,
          duration: 3200,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, scale, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.sparkleOuter}>
      <Animated.View style={[styles.orbitRing, { transform: [{ rotate }] }]} />
      <View style={styles.sparkleGlow} />
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Sparkles size={36} color={primaryColor} strokeWidth={1.3} />
      </Animated.View>
    </View>
  );
}

function AnimatedVisualizerBar({
  delay,
  styles,
}: Readonly<{
  delay: number;
  styles: ChatStyles;
}>) {
  const scale = useMemo(() => new Animated.Value(0.45), []);

  useEffect(() => {
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
  }, [delay, scale]);

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
