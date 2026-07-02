import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ShieldAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ProBadge } from "@/components/ui/pro-badge";
import { Switch } from "@/components/ui/settings-row";
import { type AppTokens, createSectionStyles } from "./styles";

interface SlipAlertSectionProps {
  tokens: AppTokens;
  hasProAccess: boolean;
  slipAlertEnabled: boolean;
  onToggle: () => void;
}

export function SlipAlertSection({
  tokens,
  hasProAccess,
  slipAlertEnabled,
  onToggle,
}: Readonly<SlipAlertSectionProps>) {
  const { t } = useTranslation();
  const router = useRouter();
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);

  return (
    <View style={sectionStyles.container}>
      {hasProAccess ? (
        <View style={sectionStyles.headerRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={sectionStyles.headerLeft}>
              <ShieldAlert size={20} color={tokens.fg2} strokeWidth={1.8} />
              <Text style={sectionStyles.headerLabel}>
                {t("habits.form.slipAlert")}
              </Text>
            </View>
            <Text style={sectionStyles.slipDescription}>
              {t("habits.form.slipAlertDescription")}
            </Text>
          </View>
          <Switch
            on={slipAlertEnabled}
            onToggle={onToggle}
            accessibilityLabel={t("habits.form.slipAlert")}
          />
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            sectionStyles.headerRow,
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
          onPress={() => router.push("/upgrade")}
          accessibilityRole="button"
        >
          <View style={{ flex: 1, gap: 4 }}>
            <View style={sectionStyles.headerLeft}>
              <ShieldAlert size={20} color={tokens.fg3} strokeWidth={1.8} />
              <Text
                style={[sectionStyles.headerLabel, { color: tokens.fg3 }]}
              >
                {t("habits.form.slipAlert")}
              </Text>
              <ProBadge alwaysVisible />
            </View>
            <Text style={sectionStyles.slipDescription}>
              {t("habits.form.slipAlertDescription")}
            </Text>
          </View>
          <View style={[sectionStyles.disabledSwitch]}>
            <View style={sectionStyles.disabledThumb} />
          </View>
        </Pressable>
      )}
    </View>
  );
}
