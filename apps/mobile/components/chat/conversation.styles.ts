import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { StyleSheet } from "react-native";
import { createTokensV2 } from "@/lib/theme";

export type Tokens = ReturnType<typeof createTokensV2>;
export type ChatStyles = ReturnType<typeof createStyles>;

export function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    content: {
      flex: 1,
    },
    headerClose: {
      width: TOUCH_TARGET_MIN,
      height: TOUCH_TARGET_MIN,
      borderRadius: 999,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    emptyState: {
      flex: 1,
    },
    emptyContent: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    aiDisclaimer: {
      fontFamily: 'Geist_400Regular',
      fontSize: 12,
      lineHeight: 16,
      textAlign: "center",
      maxWidth: 300,
      color: tokens.fg3,
    },
    messageList: {
      padding: 16,
      gap: 16,
    },
  });
}
