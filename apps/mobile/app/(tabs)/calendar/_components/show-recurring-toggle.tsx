import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Switch } from "@/components/ui/settings-row";
import { createTokensV2 } from "@/lib/theme";

type Tokens = ReturnType<typeof createTokensV2>;

interface ShowRecurringToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  tokens: Tokens;
}

/** Kit Switch + label controlling whether recurring habits appear in a calendar
 *  surface. Shared by the day detail and the week/interval views so the control
 *  reads and behaves identically everywhere, mirroring the web toggle. */
export function ShowRecurringToggle({
  checked,
  onChange,
  label,
  tokens,
}: Readonly<ShowRecurringToggleProps>) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  return (
    <View style={styles.row}>
      <Switch
        on={checked}
        onToggle={() => onChange(!checked)}
        accessibilityLabel={label}
      />
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={() => onChange(!checked)}
        hitSlop={{ top: 12, bottom: 12 }}
      >
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 0,
      minHeight: 44,
    },
    label: {
      fontFamily: "Rubik_400Regular",
      fontSize: 14,
      color: tokens.fg2,
    },
  });
}
