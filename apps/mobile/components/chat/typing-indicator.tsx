import { useEffect, useMemo } from "react";
import { View, StyleSheet, Animated } from "react-native";
import Reanimated, { FadeInUp, ReduceMotion } from "react-native-reanimated";
import { Sparkles } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { usePrefersReducedMotion } from "@/lib/motion";
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from "@/lib/use-app-theme";

function AnimatedDot({ delay, color }: Readonly<{ delay: number; color: string }>) {
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
          delay,
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
  }, [delay, opacity, prefersReducedMotion]);

  return (
    <Animated.View style={[styles.typingDot, { opacity, backgroundColor: color }]} />
  );
}

export function TypingIndicator() {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );

  return (
    <Reanimated.View
      entering={FadeInUp.duration(220).reduceMotion(ReduceMotion.System)}
      style={styles.container}
      accessibilityLiveRegion="polite"
      accessibilityLabel={t("chat.senderOrbit")}
    >
      <View
        style={[styles.aiAvatar, { backgroundColor: tintFromPrimary(tokens, 0.18) }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Sparkles size={16} color={tokens.primarySoft} strokeWidth={1.8} />
      </View>

      <View style={[styles.typingBubble, { backgroundColor: tokens.bgElev }]}>
        <View style={styles.dotsRow}>
          <AnimatedDot delay={0} color={tokens.primary} />
          <AnimatedDot delay={200} color={tokens.fg4} />
          <AnimatedDot delay={400} color={tokens.fg4} />
        </View>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  aiAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  typingBubble: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
