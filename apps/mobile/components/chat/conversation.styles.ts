import { StyleSheet } from "react-native";
import { createTokensV2 } from "@/lib/theme";

export type Tokens = ReturnType<typeof createTokensV2>;
export type ChatStyles = ReturnType<typeof createStyles>;

export function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    keyboardAvoid: {
      flex: 1,
    },
    emptyState: {
      flex: 1,
      position: "relative",
    },
    emptyContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      paddingHorizontal: 32,
      zIndex: 1,
    },
    emptyTitle: {
      fontFamily: 'Geist_500Medium',
      fontSize: 22,
      letterSpacing: -0.22,
      textAlign: "center",
      color: tokens.fg1,
    },
    emptyText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 15,
      lineHeight: 22,
      maxWidth: 280,
      textAlign: "center",
      color: tokens.fg2,
    },
    aiDisclaimer: {
      fontFamily: 'Geist_400Regular',
      fontSize: 11,
      lineHeight: 15,
      textAlign: "center",
      maxWidth: 300,
      marginTop: 4,
      color: tokens.fg4,
    },
    messageList: {
      paddingVertical: 16,
    },
  });
}
