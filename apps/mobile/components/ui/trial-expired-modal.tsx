import { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Sparkles, CheckCircle2 } from "lucide-react-native";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTrialExpired } from "@/hooks/use-profile";
import { plural } from "@/lib/plural";
import { radius } from "@/lib/theme";
import { buildUpgradeHref } from "@/lib/upgrade-route";
import { useAppTheme } from "@/lib/use-app-theme";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "orbit_trial_expired_seen";

const FEATURES = [
  "trial.expired.unlimitedHabits",
  "trial.expired.aiChat",
  "trial.expired.allColors",
  "trial.expired.aiSummary",
  "trial.expired.subHabits",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrialExpiredModal() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { colors, shadows } = useAppTheme();
  const trialExpired = useTrialExpired();
  const [dismissed, setDismissed] = useState(false);
  const [alreadySeen, setAlreadySeen] = useState(true);
  const styles = useMemo(
    () => createStyles(colors, shadows),
    [colors, shadows],
  );

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      setAlreadySeen(value === "1");
    });
  }, []);

  const isOpen =
    pathname !== "/upgrade" && !dismissed && trialExpired && !alreadySeen;

  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(STORAGE_KEY, "1");
  }, []);

  if (!isOpen) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Sparkles size={20} color={colors.primary} />
              </View>
              <Text style={styles.title}>{t("trial.expired.title")}</Text>
            </View>

            {/* Subtitle */}
            <Text style={styles.subtitle}>
              {plural(t("trial.expired.subtitle", { days: 7 }), 7)}
            </Text>

            {/* Don't lose */}
            <Text style={styles.sectionLabel}>
              {t("trial.expired.dontLose")}
            </Text>

            {/* Feature list */}
            <View style={styles.featureList}>
              {FEATURES.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <CheckCircle2 size={16} color={colors.primary} />
                  <Text style={styles.featureText}>{t(feature)}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={styles.subscribeBtn}
              activeOpacity={0.8}
              onPress={() => {
                dismiss();
                router.push(buildUpgradeHref(pathname || "/"));
              }}
            >
              <Text style={styles.subscribeBtnText}>
                {t("trial.expired.subscribe")}
              </Text>
            </TouchableOpacity>

            {/* Continue free */}
            <TouchableOpacity
              style={styles.continueBtn}
              activeOpacity={0.7}
              onPress={dismiss}
            >
              <Text style={styles.continueBtnText}>
                {t("trial.expired.continueFree")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(
  colors: ReturnType<typeof useAppTheme>["colors"],
  shadows: ReturnType<typeof useAppTheme>["shadows"],
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.60)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    dialog: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: colors.surfaceOverlay,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 24,
      ...shadows.lg,
      elevation: 12,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary_10,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: 16,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    featureList: {
      gap: 10,
      marginBottom: 24,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    featureText: {
      fontSize: 14,
      color: colors.textSecondary,
      flex: 1,
    },
    subscribeBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.xl,
      paddingVertical: 14,
      alignItems: "center",
      ...shadows.sm,
      elevation: 3,
    },
    subscribeBtnText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: "700",
    },
    continueBtn: {
      paddingVertical: 8,
      alignItems: "center",
      marginTop: 8,
    },
    continueBtnText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: "500",
    },
  });
}
