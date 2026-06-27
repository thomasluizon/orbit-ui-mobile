import { useMemo } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { createTokensV2 } from "@/lib/theme";

type Tokens = ReturnType<typeof createTokensV2>;

interface ShowRecurringToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  tokens: Tokens;
}

/** Switch + label controlling whether recurring habits appear in a calendar
 *  surface. Shared by the week and interval views so the control reads and
 *  behaves identically on both. */
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
        value={checked}
        onValueChange={onChange}
        trackColor={{ false: tokens.bgSunk, true: tokens.primary }}
        thumbColor={tokens.fgOnPrimary}
      />
      <Text style={styles.label}>{label}</Text>
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
    },
    label: {
      fontFamily: "Rubik_400Regular",
      fontSize: 12,
      color: tokens.fg2,
    },
  });
}
