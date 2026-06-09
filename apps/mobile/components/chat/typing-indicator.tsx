import { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Orbit } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from "@/lib/use-app-theme";

function AnimatedDot({ delay }: { delay: number }) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const opacity = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
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
  }, [delay, opacity]);

  return <Animated.View style={[styles.typingDot, { opacity }]} />;
}

export function TypingIndicator() {
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View
      style={[styles.container, styles.aiContainer]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={styles.aiAvatar}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Orbit size={20} color={tokens.primary} />
      </View>

      <View style={styles.bubbleColumnAI}>
        <Text style={styles.senderLabel}>{t("chat.senderOrbit")}</Text>
        <View style={styles.typingBubble}>
          <View style={styles.dotsRow}>
            <AnimatedDot delay={0} />
            <AnimatedDot delay={200} />
            <AnimatedDot delay={400} />
          </View>
        </View>
      </View>
    </View>
  );
}

type AppTokens = ReturnType<typeof createTokensV2>;

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      marginBottom: 24,
      paddingHorizontal: 16,
      gap: 12,
    },
    aiContainer: {
      justifyContent: "flex-start",
    },
    aiAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairlineStrong,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-end",
    },
    bubbleColumnAI: {
      alignItems: "flex-start",
    },
    senderLabel: {
      fontSize: 11,
      fontWeight: "500",
      color: tokens.fg2,
      marginBottom: 4,
      paddingHorizontal: 8,
    },
    typingBubble: {
      backgroundColor: tokens.bgElev,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: tokens.hairline,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 1,
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
      backgroundColor: tokens.fg2,
    },
  });
}
